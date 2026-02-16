

# Corrigir Deteccao de Eventos: Propagar Boundaries + Filtrar Pre-Jogo

## Problema

Tres regressoes criticas em relacao aos scripts antigos:

1. **Falso positivo no minuto 0**: `detect_goals_by_sliding_window` e `detect_events_by_keywords` nao recebem `boundaries`, entao processam blocos SRT do pre-jogo como se fossem lance real.
2. **Timestamp matching muito amplo** (linha 6245-6247): O filtro `e.get('minute', 0) in (0, game_start_minute) and e.get('videoSecond', 0) == 0` tenta reatribuir timestamps de TODOS os tipos de evento, nao apenas gols. Nos scripts antigos, so gols com `minute=0` eram corrigidos.
3. **Calculo de game_minute errado**: Usa `segment_start_minute + minutes` sem descontar `game_start_second`, gerando offset em todos os eventos.

## Mudancas Tecnicas

**Arquivo unico**: `video-processor/ai_services.py`

### Mudanca 1: Adicionar `boundaries` a `detect_goals_by_sliding_window` (linha 2504)

Adicionar parametro `boundaries: dict = None` na assinatura. No inicio da funcao, extrair `game_start_second`. Dentro do loop (linha 2559), filtrar blocos antes de `game_start_second`:

```python
def detect_goals_by_sliding_window(
    srt_blocks, home_team, away_team,
    segment_start_minute=0, half='first',
    window_size=5, min_goal_mentions=3, min_block_gap=5,
    boundaries: dict = None
):
    game_start_second = 0
    if boundaries and boundaries.get('game_start_second') is not None:
        game_start_second = boundaries['game_start_second']
        print(f"[SlidingWindow] Filtrando blocos antes de {game_start_second}s")

    # ... codigo existente ...

    for i in range(len(srt_blocks)):
        # NOVO: Ignorar blocos antes do inicio do jogo
        _, hours, minutes, seconds, _, _ = srt_blocks[i]
        block_time = hours * 3600 + minutes * 60 + seconds
        if block_time < game_start_second:
            continue

        # ... resto do loop ...
```

No calculo final de timestamp (linhas 2619-2628), usar `calculate_game_minute` quando boundaries estiver disponivel:

```python
_, hours, minutes, seconds, _, text = first_goal_block
raw_total = hours * 3600 + minutes * 60 + seconds
timestamp_seconds = max(0, raw_total - 3)

if boundaries:
    adj_minutes, adj_seconds = calculate_game_minute(
        timestamp_seconds, boundaries, segment_start_minute
    )
    game_minute = adj_minutes
else:
    adjusted_total = max(0, raw_total - 3)
    adj_minutes = (adjusted_total % 3600) // 60
    adj_seconds = adjusted_total % 60
    game_minute = segment_start_minute + adj_minutes + ((adjusted_total // 3600) * 60)
```

### Mudanca 2: Adicionar `boundaries` a `detect_events_by_keywords` (linha 2702)

Adicionar parametro `boundaries: dict = None` na assinatura. Propagar para `detect_goals_by_sliding_window` (linha 2768):

```python
goal_events = detect_goals_by_sliding_window(
    ...,
    boundaries=boundaries
)
```

No loop de outros eventos (linha 2784), filtrar blocos pre-jogo e usar `calculate_game_minute`:

```python
for block_index, block in enumerate(srt_blocks):
    _, hours, minutes, seconds, _, text = block
    timestamp_seconds = hours * 3600 + minutes * 60 + seconds

    # Ignorar blocos antes do inicio do jogo
    if boundaries and boundaries.get('game_start_second'):
        if timestamp_seconds < boundaries['game_start_second']:
            continue

    # Usar calculate_game_minute quando disponivel
    if boundaries:
        game_minute, _ = calculate_game_minute(
            timestamp_seconds, boundaries, segment_start_minute
        )
    else:
        game_minute = segment_start_minute + minutes + (hours * 60)
```

### Mudanca 3: Restringir timestamp matching para apenas gols (linhas 6244-6247)

**Antes** (atual -- muito amplo):
```python
events_needing_timestamps = [
    e for e in final_events 
    if e.get('minute', 0) in (0, game_start_minute) and e.get('videoSecond', 0) == 0
]
```

**Depois** (como nos scripts antigos -- apenas gols):
```python
events_needing_timestamps = [
    e for e in final_events 
    if e.get('event_type') == 'goal' and e.get('minute', 0) == 0 and e.get('videoSecond', 0) == 0
]
```

Aplicar a mesma restricao na segunda checagem (linhas 6284-6287):
```python
remaining_events = [
    e for e in final_events 
    if e.get('event_type') == 'goal' and e.get('minute', 0) == 0 and e.get('videoSecond', 0) == 0
]
```

### Mudanca 4: Propagar `boundaries` nos 3 chamadores

- **Linha 5889** (Ollama fallback): adicionar `boundaries=boundaries`
- **Linha 6293** (Kakttus SRT enrichment): adicionar `boundaries=boundaries`
- **Linha 6368** (Kakttus fallback obrigatorio): adicionar `boundaries=boundaries`

## Resumo de Impacto

| Problema | Causa | Correcao |
|----------|-------|----------|
| Gol falso no minuto 0 | Blocos pre-jogo processados | Filtro `block_time < game_start_second` |
| Timestamps errados | Sem desconto do pre-jogo | Usar `calculate_game_minute()` |
| Eventos errados reatribuidos | Filtro amplo em todos os tipos | Restringir a `event_type == 'goal'` |

- Nenhuma mudanca no frontend
- Funciona com e sem boundaries (fallback mantido)
- Mantem o offset -3s nos gols (mudanca anterior)

