

# Plano: Transcrição Whisper Local Robusta e Segmentada

## Problema Identificado

Atualmente existem **dois sistemas de segmentação paralelos** que não estão integrados:

| Sistema | Local | Status |
|---------|-------|--------|
| `audio_processor.py` | `data/uploads/{id}/audio/segments/` | Cria segmentos, **mas não transcreve** |
| `ai_services.py` | `{audio_dir}/chunks/` | Transcreve com checkpoints, **mas não usa segmentos do upload** |

**Resultado**: O chunked upload termina em `ready_for_transcription` e para. A transcrição nunca acontece de forma segmentada!

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                     FLUXO ATUAL (INTERROMPIDO)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Upload chunks ──► 2. Assembly ──► 3. Conversão MP4 ──► 4. Extrai    │
│       ✓                   ✓                ✓               áudio ✓     │
│                                                                         │
│  5. Segmenta áudio ──► 6. ready_for_transcription ──► 7. ???           │
│       ✓ (45s cada)           ✓ (para aqui!)              NUNCA RODA    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Solução Proposta

Unificar os sistemas criando uma função robusta que:

1. **Transcreve segmentos já criados** pelo `audio_processor`
2. **Salva checkpoint por segmento** (retomável)
3. **Não para em caso de erro** - registra e continua
4. **Atualiza progresso em tempo real** no banco

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                      FLUXO CORRIGIDO                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  6. ready_for_transcription ──► 7. transcribe_upload_segments()        │
│                                      │                                  │
│                                      ▼                                  │
│                          ┌───────────────────────┐                      │
│                          │ Para cada segmento:   │                      │
│                          │  • Carrega checkpoint │                      │
│                          │  • Whisper.transcribe │                      │
│                          │  • Salva checkpoint   │ ◄── retomável!       │
│                          │  • Atualiza progresso │                      │
│                          └───────────────────────┘                      │
│                                      │                                  │
│                                      ▼                                  │
│                          8. Merge SRT ──► 9. Salva arquivos finais     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

### 1. `video-processor/ai_services.py`

**Adicionar nova função**: `transcribe_upload_segments()`

```python
def transcribe_upload_segments(
    upload_id: str,
    manifest_path: str,
    match_id: str = None,
    max_retries: int = 3,
    progress_callback: callable = None
) -> Dict[str, Any]:
    """
    Transcreve segmentos de áudio criados pelo audio_processor.
    
    ROBUSTO:
    - Carrega checkpoint de cada segmento (retomável)
    - Continua em caso de erro (registra e pula)
    - Salva progresso após cada segmento
    
    Args:
        upload_id: ID do upload (para checkpoints)
        manifest_path: Caminho para manifest.json dos segmentos
        match_id: ID da partida (para metadados)
        max_retries: Tentativas por segmento
        progress_callback: Função chamada com (current, total, segment_text)
    
    Returns:
        Dict com 'success', 'text', 'srtContent', 'segments'
    """
    # Carregar manifest
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)
    
    segments = manifest['segments']
    total = len(segments)
    all_transcripts = []
    errors = []
    
    for i, seg in enumerate(segments):
        # 1. Verificar checkpoint existente
        checkpoint = load_segment_checkpoint(upload_id, i)
        if checkpoint:
            print(f"[Whisper] ⏩ Segmento {i+1}/{total} já transcrito (checkpoint)")
            all_transcripts.append(checkpoint)
            continue
        
        # 2. Transcrever com retries
        for retry in range(max_retries):
            try:
                result = _transcribe_single_segment(seg['path'])
                
                # 3. Salvar checkpoint imediatamente
                save_segment_checkpoint(
                    upload_id, i,
                    text=result['text'],
                    start_ms=seg['startMs'],
                    end_ms=seg['endMs'],
                    word_timestamps=result.get('words')
                )
                
                all_transcripts.append({
                    'text': result['text'],
                    'startMs': seg['startMs'],
                    'endMs': seg['endMs']
                })
                
                print(f"[Whisper] ✓ Segmento {i+1}/{total}")
                break
                
            except Exception as e:
                if retry == max_retries - 1:
                    errors.append(f"Seg {i}: {e}")
                    print(f"[Whisper] ❌ Segmento {i+1} falhou: {e}")
                else:
                    print(f"[Whisper] ⚠ Retry {retry+1} para segmento {i+1}")
        
        # 4. Atualizar progresso
        if progress_callback:
            progress_callback(i + 1, total, result.get('text', '')[:50])
    
    # 5. Gerar SRT final
    srt_content = merge_segments_to_srt(all_transcripts)
    full_text = ' '.join(t['text'] for t in all_transcripts)
    
    return {
        'success': True,
        'text': full_text,
        'srtContent': srt_content,
        'segments': all_transcripts,
        'errors': errors,
        'provider': 'local_whisper'
    }
```

---

### 2. `video-processor/audio_processor.py`

**Adicionar função**: `complete_transcription()` que é chamada após segmentação:

```python
def complete_transcription(upload_id: str) -> Dict[str, Any]:
    """
    Executa transcrição de todos os segmentos e atualiza job.
    Chamado automaticamente após segmentação.
    """
    from ai_services import transcribe_upload_segments
    from chunked_upload import get_upload_dir
    
    def update_progress(current, total, text):
        with get_db_session() as session:
            job = session.query(UploadJob).filter_by(id=upload_id).first()
            if job:
                job.transcription_segment_current = current
                job.transcription_progress = int((current / total) * 100)
                session.commit()
    
    # Caminho do manifest
    manifest_path = get_upload_dir(upload_id) / 'audio' / 'segments' / 'manifest.json'
    
    # Transcrever
    result = transcribe_upload_segments(
        upload_id=upload_id,
        manifest_path=str(manifest_path),
        progress_callback=update_progress
    )
    
    # Salvar SRT final
    if result.get('success'):
        srt_path = get_upload_dir(upload_id) / 'transcript' / 'final.srt'
        srt_path.write_text(result['srtContent'], encoding='utf-8')
        
        # Atualizar job
        with get_db_session() as session:
            job = session.query(UploadJob).filter_by(id=upload_id).first()
            job.status = 'complete'
            job.srt_path = str(srt_path)
            session.commit()
    
    return result
```

---

### 3. `video-processor/audio_processor.py` - Atualizar `process_upload_media()`

**Modificar** a função existente para chamar transcrição automaticamente:

```python
# Após linha 500 (depois de segmentar):
update_job({
    'status': 'transcribing',  # ← Mudar de ready_for_transcription
    'stage': 'transcribing_segments',
})
add_event('Iniciando transcrição com Whisper Local...')

# Chamar transcrição
transcription_result = complete_transcription(upload_id)

if transcription_result.get('success'):
    add_event(f'Transcrição completa: {len(transcription_result.get("text", ""))} caracteres')
else:
    add_event(f'Erro na transcrição: {transcription_result.get("errors", [])}')
```

---

## Resultado Final

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Segmentos do upload | Criados mas não usados | Transcritos automaticamente |
| Checkpoints | Só em `ai_services.py` | Por segmento (100% retomável) |
| Erros | Param todo processo | Registrados, continua |
| Progresso | Não atualizado | Tempo real no banco |
| Duração máxima | Sem limite | 500 segmentos (~6h) |

---

## Fluxo de Resiliência

```text
Cenário: Upload de 2GB, transcrição falha no segmento 45 de 120

┌─────────────────────────────────────────────────────────────────────────┐
│  ANTES: Precisa recomeçar do zero                                       │
│  DEPOIS:                                                                │
│    1. Usuário reinicia o processo                                       │
│    2. Sistema lê checkpoints 1-44 do disco                              │
│    3. Continua do segmento 45                                           │
│    4. Progresso: 37% → 100% (não perde trabalho)                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Nova função `transcribe_upload_segments()` |
| `video-processor/audio_processor.py` | Nova função `complete_transcription()` + modificar `process_upload_media()` |

