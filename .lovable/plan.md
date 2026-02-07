
# Pipeline Async do Smart Import: Etapas Faltantes

## Diagnostico

O pipeline async (`_process_match_pipeline(job_id, data)` no `server.py`) esta incompleto em comparacao ao pipeline padrao. Quando a transcricao e fornecida pelo Smart Import, o sistema pula a chamada `transcribe_large_video()`, que era responsavel por:

1. **Extrair audio** do video (FFmpeg -> `audio/{half}_audio.mp3`)
2. **Gerar SRT** formatado com timestamps (via Gemini/Whisper)
3. **Salvar audio na pasta correta** (`storage/{match_id}/audio/`)

Alem disso, o pipeline async tem outros problemas:

4. **Eventos sem `videoSecond`**: Os eventos sao salvos sem calcular o campo `videoSecond` nos metadados, impedindo que o `extract_event_clips_auto` encontre o ponto correto no video
5. **Usa `metadata` em vez de `event_metadata`**: O campo correto no modelo e `event_metadata`, mas o async usa `metadata`
6. **Sem `second` no evento**: O pipeline padrao salva o campo `second`, o async nao
7. **Sem `clip_pending = True`**: O pipeline padrao marca eventos para geracao de clips

## Solucao

Modificar a funcao `_process_match_pipeline(job_id, data)` no `video-processor/server.py` para incluir as etapas faltantes:

### Mudanca 1: Extrair audio do video (nova fase entre preparacao e transcricao)

Apos baixar/linkar o video, extrair o audio usando FFmpeg e salvar em `storage/{match_id}/audio/`:

```text
ffmpeg -y -i video.mp4 -vn -acodec libmp3lame -ab 128k audio.mp3
```

O audio extraido sera salvo como `first_audio.mp3` ou `full_audio.mp3` na pasta `audio/`.

### Mudanca 2: Gerar SRT a partir da transcricao texto

Quando a transcricao e fornecida como texto puro (sem formato SRT), gerar um SRT sintetico distribuindo o texto proporcionalmente a duracao do video. Isso garante que a pasta `srt/` tenha arquivos usaveis para legendas e sincronia visual.

### Mudanca 3: Corrigir salvamento de eventos

Alinhar o salvamento de eventos com o pipeline padrao:
- Usar `event_metadata` em vez de `metadata`
- Calcular `videoSecond` para cada evento
- Salvar campo `second`
- Marcar `clip_pending = True`

### Mudanca 4: Garantir que clips e thumbnails sejam gerados

Com `videoSecond` corretamente calculado, o `extract_event_clips_auto` podera encontrar o ponto exato no video. A funcao ja gera thumbnails automaticamente para cada clip extraido, entao corrigir o `videoSecond` resolve tanto clips quanto imagens.

## Arquivo Modificado

| Arquivo | Mudanca |
|---------|---------|
| `video-processor/server.py` | Adicionar extracao de audio, geracao de SRT, corrigir salvamento de eventos no pipeline async |

## Detalhes Tecnicos

### Extracao de Audio (entre linhas ~7970-8005)

Inserir apos a fase de "splitting" e antes da transcricao:

```text
Para cada video em video_paths:
  1. Obter duracao via ffprobe
  2. Extrair audio: ffmpeg -y -i video.mp4 -vn -acodec libmp3lame -ab 128k tmpdir/audio_{half}.mp3
  3. Copiar para storage/{match_id}/audio/{half}_audio.mp3
```

### Geracao de SRT Sintetico (apos salvar transcricao, ~linhas 8138-8164)

Quando a transcricao pre-carregada nao esta em formato SRT:

```text
1. Obter duracao do video (via video_paths)
2. Dividir texto em blocos de ~10 palavras
3. Distribuir proporcionalmente pela duracao
4. Gerar formato SRT (numero, timestamp --> timestamp, texto)
5. Salvar em storage/{match_id}/srt/{half}_half.srt
```

### Correcao do Salvamento de Eventos (linhas ~8200-8270)

Para o primeiro tempo (e equivalente para o segundo):

```text
Para cada evento:
  1. raw_minute = evento.minute
  2. Se segundo tempo e minuto < 45: raw_minute += 45
  3. second = evento.second ou 0
  4. video_second = (raw_minute - segment_start) * 60 + second
  5. Criar MatchEvent com:
     - event_metadata (nao metadata)
     - second = second
     - clip_pending = True
     - event_metadata inclui videoSecond e eventMs
```

## Resultado Esperado

Apos a implementacao, a estrutura de pastas sera preenchida completamente:

```text
storage/{match_id}/
  audio/        -> first_audio.mp3 (extraido do video)
  clips/        -> clips de cada evento (gerados pelo extract_event_clips_auto)
  images/       -> thumbnails de cada clip (gerados automaticamente)
  json/         -> detected_events_first.json (ja funciona)
  srt/          -> first_half.srt (gerado sinteticamente ou real)
  texts/        -> first_half_transcription.txt (ja funciona)
  videos/       -> video original (ja funciona)
```
