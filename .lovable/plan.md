

# Ajustar Timestamp de Gols: Primeiro Bloco - 3 Segundos

## Problema Atual

A funcao `detect_goals_by_sliding_window` usa o bloco **central** da janela como referencia de timestamp (linha 2608). Isso resulta em timestamps atrasados porque o narrador celebra por varios segundos apos o lance real. O bloco central esta ~5-10s depois do gol efetivo.

## Proposta do Usuario

Para gols detectados por sliding window (3+ mencoes de "gol" em blocos consecutivos):
- Usar o timestamp do **primeiro bloco** da janela que contem a keyword "gol"
- Subtrair 3 segundos para compensar o atraso natural da locucao

## Mudanca Tecnica

**Arquivo**: `video-processor/ai_services.py`, funcao `detect_goals_by_sliding_window` (linhas 2607-2613)

### Antes (codigo atual):
```python
# E um gol real! Usar bloco central para timestamp
center_block = srt_blocks[i]
_, hours, minutes, seconds, _, text = center_block
timestamp_seconds = hours * 3600 + minutes * 60 + seconds
game_minute = segment_start_minute + minutes + (hours * 60)
```

### Depois (codigo proposto):
```python
# Encontrar o PRIMEIRO bloco da janela que contem "gol"
first_goal_block = None
for wb in window:
    wb_text = wb[5].lower()
    if re.search(r'\bgol\b(?!eiro)', wb_text, re.IGNORECASE):
        first_goal_block = wb
        break

# Se nao encontrou (improvavel), usar bloco central como fallback
if not first_goal_block:
    first_goal_block = srt_blocks[i]

_, hours, minutes, seconds, _, text = first_goal_block
# Subtrair 3 segundos para compensar atraso da locucao
timestamp_seconds = max(0, hours * 3600 + minutes * 60 + seconds - 3)

# Recalcular minuto/segundo ajustados
adjusted_total = hours * 3600 + minutes * 60 + seconds - 3
if adjusted_total < 0:
    adjusted_total = 0
adj_minutes = (adjusted_total % 3600) // 60
adj_seconds = adjusted_total % 60
game_minute = segment_start_minute + adj_minutes + ((adjusted_total // 3600) * 60)
```

### Campos do evento atualizados:
```python
goal_event = {
    ...
    'minute': adj_minutes,
    'second': adj_seconds,
    'videoSecond': timestamp_seconds,
    'game_minute': game_minute,
    ...
    'detection_method': 'sliding_window_first_block',
    'narration_offset': -3,
}
```

## Impacto

- Apenas a funcao `detect_goals_by_sliding_window` eh modificada
- Nenhuma mudanca no frontend
- Fallback mantido (se nao achar bloco com "gol", usa o central)
- O campo `narration_offset: -3` registra o ajuste aplicado para auditoria

