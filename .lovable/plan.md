
# Corrigir cálculo de minutos: usar segundos absolutos do vídeo e derivar minuto de jogo

## Problema identificado

O gol de Philippe Coutinho aparece como **34 minutos** quando deveria ser **24 minutos**. A causa raiz está na forma como o backend calcula o campo `minute` a partir dos timestamps do SRT/transcrição.

### Fluxo atual (com bug)

Quando o SRT mostra `00:34:18` para o gol:
- `videoSecond = 2058` (correto - posição absoluta no vídeo)
- `minute = 34` (ERRADO - deveria ser 24 se o jogo começa aos ~10 min do vídeo)

O sistema trata o timestamp do SRT como se fosse o minuto de jogo, mas o vídeo pode ter conteúdo pré-jogo (aquecimento, escalação, etc.).

### Causa raiz

Em `video-processor/ai_services.py`, a função `detect_events_by_keywords_from_text()` (linha ~4901):
```text
'minute': game_start_minute + mins + (hours * 60)
'videoSecond': total_seconds
```

E na função `refine_event_timestamp_from_srt()` (linha ~1944):
```text
event['minute'] = best_match['srt_minute']  -- usa minuto do SRT direto
event['videoSecond'] = best_match['srt_seconds']
```

Ambas assumem que minuto 0 do SRT = minuto 0 do jogo, o que nem sempre é verdade.

## Solucao proposta

### 1. Adicionar conceito de "video offset" (offset do início do jogo no vídeo)

O frontend já envia `gameStartMinute` (0 para primeiro tempo, 45 para segundo). Precisamos de um segundo conceito: `video_game_start_second` -- o segundo do vídeo onde o jogo realmente começa.

### 2. Calcular minute como: `(videoSecond - video_game_start_second) / 60 + game_start_minute`

Isso garante que:
- `videoSecond` permanece absoluto (para seek no player)
- `minute` reflete o minuto real do jogo

### 3. Arquivos a modificar

| Arquivo | Alteracao |
|---------|-----------|
| `video-processor/ai_services.py` | Corrigir `detect_events_by_keywords_from_text()` e `refine_event_timestamp_from_srt()` para calcular `minute` a partir de `videoSecond` menos offset |
| `video-processor/server.py` | Passar o offset do vídeo (detectado automaticamente ou informado pelo usuário) para as funções de análise |
| `video-processor/event_detector.py` | Adicionar extração de timestamp dos candidatos (linha do texto -> posição no SRT) |

### 4. Detalhes da correção em `ai_services.py`

Na função `detect_events_by_keywords_from_text()`:
```text
# ANTES (bugado):
'minute': game_start_minute + mins + (hours * 60)

# DEPOIS (correto):
video_second = hours * 3600 + mins * 60 + secs
game_second = max(0, video_second - video_game_start_second)
'minute': game_start_minute + (game_second // 60)
'second': game_second % 60
'videoSecond': video_second  # mantém absoluto
```

Na função `refine_event_timestamp_from_srt()`:
```text
# ANTES (bugado):
event['minute'] = best_match['srt_minute']

# DEPOIS (correto):
game_second = max(0, best_match['srt_seconds'] - video_game_start_second)
event['minute'] = game_start_minute + (game_second // 60)
event['second'] = game_second % 60
event['videoSecond'] = best_match['srt_seconds']  # mantém absoluto
```

### 5. Detecção automática do offset

Se o usuário não informar o offset, o sistema pode:
- Usar o campo `start_minute` da tabela `videos` (se preenchido corretamente)
- Ou assumir offset 0 (comportamento atual para vídeos sem pré-jogo)

### 6. Impacto no frontend

Nenhuma mudança necessária no frontend. O campo `minute` já é usado para exibição e `videoSecond` para seek no player. A correção é 100% no backend.

## Resultado esperado

- Gol de Coutinho exibido como **24'** (minuto de jogo correto)
- Player de vídeo ainda posiciona no segundo correto do vídeo
- Todos os outros eventos também terão minutos de jogo corrigidos
