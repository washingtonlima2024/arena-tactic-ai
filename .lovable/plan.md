
# Aplicar Correções Pendentes no Pipeline Async

## Situação Atual

As mudanças planejadas anteriormente **não foram aplicadas** ao `server.py`. O código atual ainda:

1. Usa transcricao parcial de 5 min como se fosse completa
2. Nao detecta `videoType: 'full'`
3. Analisa apenas range 0-45 min (perde metade do jogo)

O fatiamento de video e audio **ja funciona** -- Phase 2 divide videos grandes e Phase 2.5 extrai audio com 3 metodos fallback. O pipeline nao vai travar por causa disso.

## Mudancas Necessarias (3 arquivos)

### 1. Upload.tsx -- Nao enviar transcricao parcial ao pipeline

**Arquivo:** `src/pages/Upload.tsx` (linha 2936)

A transcricao do Smart Import (5 minutos) serve apenas para detectar times/competicao. Nao deve ser passada como `firstHalfTranscription` ao pipeline async, porque isso faz o Whisper ser pulado.

```text
ANTES (linha 2936):
  firstHalfTranscription: transcription && transcription.length > 50 ? transcription : undefined

DEPOIS:
  // Transcricao do Smart Import e parcial (5 min) - nao usar como transcricao completa
  firstHalfTranscription: undefined
```

Isso forca o pipeline a rodar Whisper no video inteiro (Phase 3, linha 8480+).

### 2. server.py Phase 1 -- Detectar video de jogo completo

**Arquivo:** `video-processor/server.py` (linhas 8168-8170)

Substituir a organizacao simples por deteccao de `videoType: 'full'`:

```text
ANTES:
  first_half_videos = [v for v in videos if v.get('halfType') == 'first']
  second_half_videos = [v for v in videos if v.get('halfType') == 'second']

DEPOIS:
  first_half_videos = []
  second_half_videos = []
  is_full_match_video = False

  for v in videos:
      video_type = v.get('videoType', '')
      half_type = v.get('halfType', 'first')

      if video_type == 'full':
          is_full_match_video = True
          first_half_videos.append(v)
          print(f"[ASYNC-PIPELINE] Video de jogo COMPLETO detectado")
      elif half_type == 'second':
          second_half_videos.append(v)
      else:
          first_half_videos.append(v)
```

### 3. server.py Phase 4 -- Analisar range 0-90 para jogo completo

**Arquivo:** `video-processor/server.py` (linhas 8658-8659)

Quando e jogo completo, a IA precisa analisar 0-90 min em vez de 0-45:

```text
ANTES:
  events = ai_services.analyze_match_events(
      first_half_text, home_team, away_team, 0, 45,
      match_id=match_id,
      ...
  )

DEPOIS:
  game_end = 90 if is_full_match_video else 45
  print(f"[ASYNC-PIPELINE] Analise 1T: range 0-{game_end} min (full_match={is_full_match_video})")
  events = ai_services.analyze_match_events(
      first_half_text, home_team, away_team, 0, game_end,
      match_id=match_id,
      ...
  )
```

### 4. server.py Phase 3 -- Log diagnostico de transcricao

**Arquivo:** `video-processor/server.py` (apos linha 8566, depois de salvar o TXT)

Adicionar log que detecta transcricoes suspeitamente curtas:

```text
  # Diagnostico: chars por segundo
  first_dur = video_durations.get('first', 0)
  if first_dur > 0:
      chars_per_sec = len(first_half_text) / first_dur
      print(f"[ASYNC-PIPELINE] Transcricao 1T: {len(first_half_text)} chars, "
            f"video={first_dur:.0f}s, ratio={chars_per_sec:.1f} chars/s")
      if chars_per_sec < 2 and first_dur > 600:
          print(f"[ASYNC-PIPELINE] ALERTA: Transcricao parece PARCIAL! "
                f"Esperado ~{int(first_dur * 8)} chars, recebido {len(first_half_text)}")
```

## Sobre Fatiamento (Video e Audio)

O pipeline **ja tem** o fatiamento implementado e nao vai travar:

| Phase | O que faz | Status |
|-------|-----------|--------|
| Phase 2 (linha 8226) | Divide video em N partes via FFmpeg se > 300MB | Ja funciona |
| Phase 2.5 (linha 8263) | Extrai audio MP3 com 3 fallbacks (libmp3lame, mono 16kHz, WAV-to-MP3) | Ja funciona |
| Phase 3 (linha 8500) | Transcreve partes em paralelo (4 workers) | Ja funciona |

O unico risco de "parar" seria se o Whisper demorasse muito em videos longos. Para um video de 26 min, a transcricao leva ~3-8 minutos dependendo do hardware. Videos de 90 min podem levar 15-30 min, mas o pipeline mostra progresso em tempo real.

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/Upload.tsx` | Linha 2936: `firstHalfTranscription: undefined` |
| `video-processor/server.py` | Linhas 8168-8170: Detectar `videoType: 'full'` e flag `is_full_match_video` |
| `video-processor/server.py` | Linhas 8658-8659: Usar `game_end = 90` quando jogo completo |
| `video-processor/server.py` | Apos linha 8566: Log diagnostico chars/segundo |

## Resultado

- Whisper roda no video **inteiro** (nao apenas 5 min)
- IA analisa **0-90 min** para jogos compactados (detecta todos os gols)
- Pipeline nao trava -- fatiamento e audio ja funcionam
- Log de chars/s permite detectar problemas rapidamente
