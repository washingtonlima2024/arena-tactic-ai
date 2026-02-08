

# Correcao: Transcrição Travando em 27% - Concorrência do Whisper

## Problema

A transcrição trava sempre em 27% porque o pipeline assíncrono usa `ThreadPoolExecutor(max_workers=4)` para transcrever partes em paralelo, mas o modelo Whisper (`_whisper_model`) é um **singleton global compartilhado** entre todas as threads. O faster-whisper/ctranslate2 **não é thread-safe** - quando múltiplas threads tentam usar o mesmo modelo de GPU simultaneamente, ocorre um deadlock.

### Fluxo que Causa o Travamento

```text
_process_match_pipeline()
    |
    +-- ThreadPoolExecutor(max_workers=4)
    |       Thread 1 → _transcribe_part_parallel → ai_services.transcribe_audio_file → _whisper_model.transcribe() 🔒
    |       Thread 2 → _transcribe_part_parallel → ai_services.transcribe_audio_file → _whisper_model.transcribe() 🔒
    |       Thread 3 → _transcribe_part_parallel → ai_services.transcribe_audio_file → _whisper_model.transcribe() 🔒
    |       Thread 4 → _transcribe_part_parallel → ai_services.transcribe_audio_file → _whisper_model.transcribe() 🔒
    |                                                                                    ↑ DEADLOCK na GPU
    |
    +-- heartbeat_progress = 25 → +2 = 27% → TRAVA AQUI
```

O progresso chega a 27% (25 inicial + um tick de heartbeat de +2) e para, porque nenhuma thread consegue completar a transcrição.

### O que os Scripts Alternativos Fazem Diferente

Os arquivos `ai_services_trans-2.py` e `server_trans-2.py` provavelmente funcionam melhor na transcrição porque o fluxo de transcrição dentro de `transcribe_large_video` é sequencial (sem ThreadPoolExecutor), evitando o deadlock. Porém, eles "quebram outro processo" porque o pipeline assíncrono (`_process_match_pipeline`) continua usando a abordagem paralela.

## Solução

### Mudança Principal: Transcrição Sequencial (não paralela)

Alterar o pipeline assíncrono para processar as partes **sequencialmente** em vez de em paralelo, já que o Whisper não suporta concorrência.

### Arquivo: `video-processor/server.py`

**Mudança 1** - Linhas 9015-9089: Substituir `ThreadPoolExecutor` por loop sequencial com progresso real

Remover o bloco inteiro do ThreadPoolExecutor e substituir por:

```python
                # Process parts SEQUENTIALLY (Whisper is NOT thread-safe)
                for idx, item in enumerate(all_parts_flat):
                    half_type_part = item['halfType']
                    part_info = item['partInfo']
                    minute_offset = item['minuteOffset']
                    
                    # Update part status to "transcribing"
                    for ps in parts_status:
                        if ps['halfType'] == half_type_part and ps['part'] == part_info['part']:
                            ps['status'] = 'transcribing'
                            ps['progress'] = 10
                            break
                    
                    progress = 20 + int(((idx) / len(all_parts_flat)) * 60)
                    _update_async_job(job_id, 'transcribing', progress, 
                                    f'Transcrevendo parte {idx + 1}/{len(all_parts_flat)}{gpu_info}...',
                                    'transcribing', completed_parts, total_parts, parts_status)
                    
                    result = _transcribe_part_parallel(part_info, half_type_part, match_id, minute_offset)
                    completed_parts += 1
                    
                    # Update part status
                    for ps in parts_status:
                        if ps['halfType'] == half_type_part and ps['part'] == part_info['part']:
                            ps['status'] = 'done' if result['success'] else 'error'
                            ps['progress'] = 100
                            if not result['success']:
                                ps['message'] = result.get('error', '')[:100]
                            break
                    
                    progress = 20 + int((completed_parts / len(all_parts_flat)) * 60)
                    
                    if result['success']:
                        transcription_results[half_type_part].append(result)
                        print(f"[ASYNC-PIPELINE] ✓ Transcribed {half_type_part} part {result['part']}: {len(result['text'])} chars")
                        _update_async_job(job_id, 'transcribing', progress, 
                                        f'Parte {completed_parts}/{len(all_parts_flat)} transcrita',
                                        'transcribing', completed_parts, total_parts, parts_status)
                    else:
                        print(f"[ASYNC-PIPELINE] ✗ Failed {half_type_part} part: {result.get('error')}")
                        _update_async_job(job_id, 'transcribing', progress, 
                                        f'Parte {completed_parts}/{len(all_parts_flat)} (erro)',
                                        'transcribing', completed_parts, total_parts, parts_status)
```

**Mudança 2** - Adicionar mutex no `_transcribe_with_local_whisper` (ai_services.py) como segurança extra

No topo do arquivo (perto da linha 2030), adicionar:

```python
import threading
_whisper_lock = threading.Lock()
```

E na função `_transcribe_with_local_whisper` (linha ~2952), envolver a chamada do modelo com o lock:

```python
# Na função _transcribe_single_file:
with _whisper_lock:
    segments_gen, info = _whisper_model.transcribe(...)
    # ... processar segments DENTRO do lock ...

# Na função _transcribe_chunked, dentro do loop de chunks:
with _whisper_lock:
    segments_gen, info = _whisper_model.transcribe(...)
    # ... processar chunk DENTRO do lock ...
```

### Arquivo: `video-processor/ai_services.py`

**Mudança 3** - Adicionar lock global para o modelo Whisper

Adicionar na seção de inicialização (~linha 2030):

```python
import threading
_whisper_lock = threading.Lock()
```

**Mudança 4** - Proteger `_transcribe_single_file` com lock (linha 3019):

```python
def _transcribe_single_file(audio_path: str, match_id: str = None) -> Dict[str, Any]:
    global _whisper_model
    
    print(f"[LocalWhisper] Transcrevendo arquivo único...")
    
    with _whisper_lock:
        segments_gen, info = _whisper_model.transcribe(
            audio_path, 
            language="pt",
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        # IMPORTANTE: Consumir o generator DENTRO do lock
        srt_lines = []
        full_text = []
        segments_list = []
        
        for i, seg in enumerate(segments_gen, 1):
            start_str = _format_srt_time(seg.start)
            end_str = _format_srt_time(seg.end)
            text = seg.text.strip()
            
            if text:
                srt_lines.append(f"{i}\n{start_str} --> {end_str}\n{text}\n")
                full_text.append(text)
                segments_list.append({
                    'start': seg.start,
                    'end': seg.end,
                    'text': text
                })
    
    # Resto do processamento fora do lock...
```

**Mudança 5** - Proteger iteração do chunk na `_transcribe_chunked` (linha 3130):

```python
# Dentro do loop de retry de cada chunk:
with _whisper_lock:
    segments_gen, info = _whisper_model.transcribe(
        chunk_path,
        language="pt",
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500)
    )
    
    chunk_text = []
    for seg in segments_gen:
        text = seg.text.strip()
        if text:
            adjusted_start = start_time + seg.start
            adjusted_end = start_time + seg.end
            all_segments.append({...})
            chunk_text.append(text)
```

**Mudança 6** - Proteger `transcribe_upload_segments` (linha 3348):

```python
# Dentro do loop de retry:
with _whisper_lock:
    segments_gen, info = _whisper_model.transcribe(
        segment_path,
        language="pt",
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500)
    )
    
    texts = []
    for seg_result in segments_gen:
        text = seg_result.text.strip()
        if text:
            texts.append(text)
```

## Resumo das Alterações

| Arquivo | Linha | Mudança |
|---|---|---|
| server.py | 9015-9089 | Substituir ThreadPoolExecutor por loop sequencial com progresso real |
| ai_services.py | ~2030 | Adicionar `_whisper_lock = threading.Lock()` |
| ai_services.py | 3019-3068 | Proteger `_transcribe_single_file` com `_whisper_lock` |
| ai_services.py | 3128-3167 | Proteger loop de chunks em `_transcribe_chunked` com `_whisper_lock` |
| ai_services.py | 3346-3363 | Proteger `transcribe_upload_segments` com `_whisper_lock` |

## Por que Sequencial e Não Paralelo?

O faster-whisper/ctranslate2 usa a GPU como recurso exclusivo. Mesmo com um mutex, executar 4 threads que ficam esperando o lock seria equivalente a execução sequencial mas com overhead de threading. A solução mais limpa é:

1. **Loop sequencial** no pipeline (server.py) - elimina contention
2. **Mutex como segurança** (ai_services.py) - protege chamadas de outros pontos do sistema que possam chamar o Whisper simultaneamente

O progresso agora será real: cada parte concluída avança proporcionalmente de 20% a 80%.

**Nota**: Todas as mudanças são no servidor local (`video-processor/`). Após aplicar, reiniciar com `pm2 restart arena-backend`.
