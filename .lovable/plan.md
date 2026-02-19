
# Corrigir Sobreposicao do 2o Tempo sobre o 1o Tempo

## Problema

O segundo tempo esta sobrepondo o primeiro na timeline. Os eventos do 2T aparecem com minutos 0-45 em vez de 45-90, causando sobreposicao total com o 1T.

## Causa Raiz

No pipeline async (`server.py` linhas 9529-9536), a analise do 2T chama:

```text
analyze_match_events(second_half_text, home_team, away_team, 45, 90,
    video_game_start_second=second_half_offset,
    boundaries=boundaries_2t)
```

O problema: quando o 2T vem de um video separado, o SRT desse video tem timestamps comecando de 0 (inicio do arquivo). A funcao `calculate_game_minute` recebe `boundaries_2t` que tem `game_start_second` proximo de 0 e **nao tem** `second_half_start_second` (porque e um video so do 2T). Resultado: mapeia timestamp 0 para minuto 0 em vez de minuto 45.

Na re-analise isso funciona porque o endpoint `/api/analyze-match` tem a correcao na linha 4116:

```text
if half_type == 'second' and raw_minute < 45:
    raw_minute = raw_minute + 45
```

Mas no pipeline async (linha 9551), a correcao equivalente existe:

```text
if raw_minute < 45:
    raw_minute += 45
```

Porem, o problema real e mais sutil: os `boundaries_2t` para video separado do 2T sao tratados como se fossem um jogo completo comecando do zero, entao `calculate_game_minute` retorna minutos no range 0-45 corretamente para a duracao do video, mas sem o offset de +45.

## Solucao

### Arquivo: `video-processor/server.py`

**Mudanca 1 - Forcar `game_start_minute=45` nos boundaries do 2T (async pipeline):**

Antes de passar `boundaries_2t` para `analyze_match_events`, injetar o campo `game_start_minute_offset` ou ajustar a chamada para que o retorno ja venha com minutos corretos. A forma mais segura e garantir que o `game_start_minute=45` seja respeitado dentro do `analyze_match_events` quando o `match_half == 'second'`.

**Mudanca 2 - Corrigir `calculate_game_minute` para aceitar offset base:**

Atualmente, `calculate_game_minute` recebe `game_start_minute` mas so o usa no fallback (1T). Para o 2T de video separado, precisa somar o `game_start_minute` ao resultado quando `second_half_start_second` nao existe nos boundaries.

Concretamente, no `ai_services.py` funcao `calculate_game_minute` (linha 760-762):

```text
# Evento no 1T (ou sem detecção de halves)
elapsed = max(0, video_second - game_start)
return game_start_minute + int(elapsed // 60), int(elapsed % 60)
```

Este trecho ja usa `game_start_minute` como offset. O problema e que quando o async pipeline chama `analyze_match_events(... game_start_minute=45 ...)`, esse valor **e** passado adiante, mas as funcoes internas de detecao por keyword (`detect_events_by_keywords`) e o pipeline Kakttus podem retornar minutos sem esse offset.

**Mudanca 3 - Garantir offset no pipeline async (correcao principal):**

No pipeline async (`server.py` linhas 9549-9552), a correcao `if raw_minute < 45: raw_minute += 45` so funciona se o evento retornado pelo `analyze_match_events` tem `minute < 45`. Mas se o `analyze_match_events` ja somou o offset internamente (via `game_start_minute=45`), entao a correcao no pipeline duplica o offset (45 vira 90).

A solucao e **padronizar**: `analyze_match_events` deve SEMPRE retornar minutos no range solicitado (`game_start_minute` a `game_end_minute`). E o pipeline async NAO deve re-aplicar o offset.

### Mudancas concretas:

| Arquivo | Mudanca |
|---|---|
| `video-processor/ai_services.py` | Na funcao `_enrich_events`, garantir que o `game_start_minute` seja somado quando os eventos detectados tem minuto < game_start_minute |
| `video-processor/server.py` | No async pipeline (linhas 9549-9552), remover a correcao manual `if raw_minute < 45: raw_minute += 45` pois `analyze_match_events` ja deve retornar minutos corretos com game_start_minute=45. Substituir por validacao: se o minuto ja esta no range 45-90, nao alterar |

### Fluxo corrigido:

```text
Video 2T separado (timestamps SRT: 0:00 a 50:00)
    |
    v
analyze_match_events(text, ..., game_start_minute=45, game_end_minute=90)
    |
    v
calculate_game_minute(video_second=300, boundaries_2t, game_start_minute=45)
    -> elapsed = 300 - 0 = 300s = 5min
    -> return 45 + 5 = minuto 50  (CORRETO)
    |
    v
Pipeline async recebe: minute=50 (ja no range correto)
    -> NAO aplica +45 (ja esta >= 45)
    -> Salva minute=50, match_half='second_half'
```

### Regra do documento O_TEMPO_DO_JOGO.TXT respeitada:

O conceito de `tempo_absoluto` do documento e implementado pelo campo `minute` que e global e crescente. O 1T ocupa minutos 0-45+, o 2T ocupa 45-90+. Nunca ha sobreposicao porque o 2T sempre inicia apos o termino do 1T na timeline unica.

### Impacto:

- Analise inicial: eventos do 2T terao minutos 45+ (sem sobreposicao)
- Re-analise: sem mudanca (ja funciona)
- Clips: `videoSecond` continua relativo ao video individual (para seek correto)
- Timeline UI: agrupamento por fases (`matchPhases.ts`) funcionara corretamente
