
# Pipeline Async do Smart Import: Etapas Faltantes ✅ IMPLEMENTADO

## Mudanças Realizadas em `video-processor/server.py`

### ✅ Mudança 1: Extração de áudio (Phase 2.5)
- FFmpeg extrai áudio de cada vídeo como `{half}_audio.mp3`
- Salva em `storage/{match_id}/audio/`
- Coleta duração real via `get_video_duration_seconds()` para uso posterior

### ✅ Mudança 2: Geração de SRT sintético (Phase 3.5)
- Quando transcrição é texto puro (não SRT), gera `.srt` distribuindo blocos de ~10 palavras
- Timestamps proporcionais à duração real do vídeo
- Salva em `storage/{match_id}/srt/{half}_half.srt`

### ✅ Mudança 3: Correção do salvamento de eventos
- Usa `event_metadata` (não `metadata`) 
- Calcula `videoSecond` para cada evento
- Aplica correção proporcional quando `videoSecond > duração do vídeo`
- Salva campo `second`
- Marca `clip_pending = True`
- Inclui `eventMs` nos metadados

### ✅ Mudança 4: Clips e thumbnails
- Com `videoSecond` correto, `extract_event_clips_auto` já existente encontra os pontos certos
- Thumbnails são gerados automaticamente pelo mesmo processo
