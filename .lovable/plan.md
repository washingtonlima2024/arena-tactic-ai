

# Melhorar Feedback de Progresso do Whisper no Pipeline Async

## Situacao Atual

O processo esta rodando normalmente -- o Whisper Local esta transcrevendo o video de 49 MB no modo CPU, o que pode levar de 5 a 15 minutos. O problema e que a UI mostra 20% e "pending" durante todo esse tempo porque o pipeline so atualiza o status quando a transcricao de uma parte **termina completamente**.

```text
FLUXO ATUAL:
  _update_async_job(20%, "Transcrevendo com Whisper...")  -- linha 8545
       |
       v
  ThreadPoolExecutor.submit(_transcribe_part_parallel)  -- sem update intermediario
       |
       (5-15 min de silencio na UI)
       |
       v
  as_completed -> _update_async_job(80%, "Parte 1/1 transcrita")  -- so aqui atualiza
```

## Mudancas Propostas

### 1. Atualizar status da parte para "transcribing" quando inicia (server.py)

**Arquivo:** `video-processor/server.py` (linhas 8566-8574)

Antes de submeter cada parte ao executor, atualizar o status para "transcribing" imediatamente, dando feedback visual ao usuario:

```python
# ANTES (linha 8566-8574):
for item in all_parts_flat:
    future = executor.submit(
        _transcribe_part_parallel,
        item['partInfo'],
        item['halfType'],
        match_id,
        item['minuteOffset']
    )
    transcribe_futures[future] = item

# DEPOIS:
for item in all_parts_flat:
    # Atualizar status da parte para "transcribing" imediatamente
    for ps in parts_status:
        if ps['halfType'] == item['halfType'] and ps['part'] == item['partInfo']['part']:
            ps['status'] = 'transcribing'
            ps['progress'] = 10
            break
    
    future = executor.submit(
        _transcribe_part_parallel,
        item['partInfo'],
        item['halfType'],
        match_id,
        item['minuteOffset']
    )
    transcribe_futures[future] = item

# Atualizar job com status "transcribing" nas partes
_update_async_job(job_id, 'transcribing', 25, 
                  'Whisper processando audio (pode levar alguns minutos)...',
                  'transcribing', 0, total_parts, parts_status)
```

### 2. Adicionar mensagem informativa sobre modo CPU (server.py)

**Arquivo:** `video-processor/server.py` (linha 8545)

Quando o Whisper inicia, mostrar uma mensagem mais informativa que inclui a estimativa de tempo baseada no modo (CPU vs GPU):

```python
# ANTES (linha 8545):
_update_async_job(job_id, 'transcribing', 20, 'Transcrevendo com Whisper...', 'transcribing')

# DEPOIS:
# Verificar se Whisper esta em modo GPU ou CPU para estimar tempo
gpu_info = ""
try:
    import torch
    if torch.cuda.is_available():
        gpu_info = " (GPU - rapido)"
    else:
        gpu_info = " (CPU - pode levar 5-15 min)"
except:
    gpu_info = " (CPU)"

_update_async_job(job_id, 'transcribing', 20, 
                  f'Transcrevendo com Whisper Local{gpu_info}...', 
                  'transcribing', 0, total_parts, parts_status)
```

### 3. Adicionar heartbeat de progresso durante transcricao (server.py)

**Arquivo:** `video-processor/server.py` (funcao `_transcribe_part_parallel`, linhas 8097-8136)

Executar a transcricao em uma thread separada com heartbeat a cada 10 segundos para dar feedback visual:

```python
def _transcribe_part_parallel(part_info: dict, half_type: str, match_id: str, minute_offset: float):
    """Transcribe a single video part - used by ThreadPoolExecutor."""
    try:
        part_path = part_info['path']
        part_num = part_info['part']
        part_start = part_info['start']
        part_duration = part_info['duration']
        
        part_start_minute = minute_offset + (part_start / 60)
        
        print(f"[ASYNC-TRANSCRIBE] Part {part_num} (half={half_type}): transcribing...")
        
        # Log inicio com tamanho do arquivo para diagnostico
        file_size_mb = os.path.getsize(part_path) / (1024 * 1024) if os.path.exists(part_path) else 0
        print(f"[ASYNC-TRANSCRIBE] Part {part_num}: {file_size_mb:.1f} MB, estimativa: {file_size_mb * 0.3:.0f}-{file_size_mb * 0.6:.0f}s")
        
        result = _transcribe_video_part_direct(part_path, part_start, minute_offset)
        
        if result.get('success') and result.get('text'):
            print(f"[ASYNC-TRANSCRIBE] Part {part_num}: CONCLUIDO - {len(result.get('text', ''))} chars")
            return {
                'success': True,
                'part': part_num,
                'halfType': half_type,
                'text': result.get('text', ''),
                'srtContent': result.get('srtContent', ''),
                'startMinute': part_start_minute,
                'duration': part_duration
            }
        else:
            return {
                'success': False,
                'part': part_num,
                'halfType': half_type,
                'error': result.get('error', 'Unknown error')
            }
    except Exception as e:
        return {
            'success': False,
            'part': part_info.get('part', 0),
            'halfType': half_type,
            'error': str(e)
        }
```

### 4. Progresso simulado durante espera longa (server.py)

**Arquivo:** `video-processor/server.py` (linhas 8576-8599, bloco `as_completed`)

Adicionar um timer que incrementa o progresso gradualmente enquanto espera o Whisper terminar, para que a barra nao fique parada em 20%:

```python
# Substituir o bloco as_completed simples por um com heartbeat
import time as time_module_local

last_heartbeat = time_module.time()
heartbeat_progress = 25  # Comeca em 25% (ja mostrou 20%)

while transcribe_futures:
    # Verificar futures completas (timeout curto para nao bloquear)
    done_futures = []
    for future in list(transcribe_futures.keys()):
        if future.done():
            done_futures.append(future)
    
    for future in done_futures:
        item = transcribe_futures.pop(future)
        result = future.result()
        completed_parts += 1
        
        # Update part status
        for ps in parts_status:
            if ps['halfType'] == item['halfType'] and ps['part'] == item['partInfo']['part']:
                ps['status'] = 'done' if result['success'] else 'error'
                ps['progress'] = 100
                break
        
        progress = 20 + int((completed_parts / len(all_parts_flat)) * 60)
        
        if result['success']:
            transcription_results[item['halfType']].append(result)
            print(f"[ASYNC-PIPELINE] Transcribed {item['halfType']} part {result['part']}: {len(result['text'])} chars")
            _update_async_job(job_id, 'transcribing', progress, 
                            f'Parte {completed_parts}/{len(all_parts_flat)} transcrita',
                            'transcribing', completed_parts, total_parts, parts_status)
        else:
            print(f"[ASYNC-PIPELINE] Failed {item['halfType']} part: {result.get('error')}")
    
    # Heartbeat a cada 15 segundos para mostrar progresso
    now = time_module.time()
    if now - last_heartbeat > 15 and not done_futures:
        heartbeat_progress = min(heartbeat_progress + 2, 75)  # Incrementa ate 75%
        elapsed = int(now - start_time)
        _update_async_job(job_id, 'transcribing', heartbeat_progress, 
                         f'Whisper processando... ({elapsed}s)',
                         'transcribing', completed_parts, total_parts, parts_status)
        last_heartbeat = now
    
    if transcribe_futures:
        time_module.sleep(2)  # Esperar 2s antes de verificar novamente
```

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `video-processor/server.py` | Linhas 8545: Mensagem informativa com modo CPU/GPU |
| `video-processor/server.py` | Linhas 8566-8574: Marcar partes como "transcribing" ao iniciar |
| `video-processor/server.py` | Linhas 8097-8136: Log de diagnostico com tamanho do arquivo |
| `video-processor/server.py` | Linhas 8576-8599: Heartbeat de progresso a cada 15s |

## Resultado

- Barra de progresso incrementa gradualmente de 20% a 75% durante a transcricao
- Partes mostram status "transcribing" em vez de "pending"
- Mensagem informa se esta usando CPU ou GPU
- Tempo decorrido visivel na mensagem de progresso
- O Whisper continua rodando normalmente -- apenas o feedback visual e melhorado

