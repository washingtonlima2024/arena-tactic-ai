
# Plano: Corrigir Eventos Duplicados, Placar Errado e Clips Repetidos

## Problemas Identificados

### 1. **Placar Invertido: Argentina 1 x 0 Brasil (deveria ser Brasil 2 x 0)**

**Causa Raiz**: A função `detect_team_from_text()` em `ai_services.py` (linhas 450-471) usa uma lógica fraca para detectar o time:

```python
# PROBLEMA: Default para 'home' quando nenhum time identificado
else:
    return 'unknown'  # ← O frontend depois assume 'home' por default
```

Porém, na versão de fallback por keywords (linhas 2797-2802):
```python
team = 'home'  # ← DEFAULT É SEMPRE 'home'
if away_team.lower() in line_lower:
    team = 'away'
elif home_team.lower() in line_lower:
    team = 'home'
```

O problema é que:
1. A IA pode não detectar o nome do time na transcrição
2. Quando `team='unknown'`, o placar no `server.py` (linha 3800-3803) assume **home**:
   ```python
   else:
       # Last resort: default to home
       home_score += 1
   ```
3. Os gols do Brasil podem estar sendo atribuídos à Argentina (posições invertidas)

### 2. **Eventos Duplicados (mesmo gol 3 vezes)**

**Causa Raiz**: A função `deduplicate_events()` (linhas 474-520) usa `threshold_seconds=30`, mas:

1. **Problema de videoSecond**: Se o `videoSecond` calculado estiver errado, dois eventos do mesmo gol podem ter tempos muito diferentes (ex: 180s vs 1485s)
2. **Fallback cria duplicatas**: Quando o Ollama falha e o fallback por keywords entra, ele pode não ter o `videoSecond` correto, causando eventos duplicados
3. **Não há deduplicação na DB**: Ao salvar, o código deleta eventos anteriores do half, mas se dois half-types diferentes tiverem o mesmo gol, não são deduplicados

### 3. **Tempo do Gol Errado no Vídeo**

**Causa Raiz**: O cálculo de `videoSecond` (linha 3864):
```python
video_second = (original_minute - segment_start_minute) * 60 + event_second
```

Problemas:
1. Se `segment_start_minute` estiver errado, o cálculo fica fora
2. O fallback de keywords pode usar `current_minute` em vez do timestamp real do SRT
3. Se a transcrição não tiver timestamps precisos, o sistema usa inferência

---

## Soluções Propostas

### Correção 1: Melhorar Detecção de Time com Aliases

**Arquivo**: `video-processor/ai_services.py`

```python
def detect_team_from_text(text: str, home_team: str, away_team: str) -> str:
    """
    Detect which team is mentioned in the text.
    Returns 'home', 'away', or 'unknown'.
    
    IMPROVED: Uses aliases and partial matching for better accuracy.
    """
    text_upper = text.upper()
    home_upper = home_team.upper()
    away_upper = away_team.upper()
    
    # Get all words from team names (length > 2)
    home_words = [w for w in home_upper.split() if len(w) > 2]
    away_words = [w for w in away_upper.split() if len(w) > 2]
    
    # Add aliases from TEAM_ALIASES dictionary
    for key, aliases in TEAM_ALIASES.items():
        if key.upper() in home_upper or home_upper in key.upper():
            home_words.extend([a.upper() for a in aliases])
        if key.upper() in away_upper or away_upper in key.upper():
            away_words.extend([a.upper() for a in aliases])
    
    # Check for any word match
    home_found = any(w in text_upper for w in home_words if len(w) > 3) or home_upper in text_upper
    away_found = any(w in text_upper for w in away_words if len(w) > 3) or away_upper in text_upper
    
    if home_found and not away_found:
        return 'home'
    elif away_found and not home_found:
        return 'away'
    else:
        return 'unknown'
```

### Correção 2: Deduplicação Melhorada (por minuto E time)

**Arquivo**: `video-processor/ai_services.py`

```python
def deduplicate_events(events: List[Dict], threshold_seconds: int = 60) -> List[Dict]:
    """
    Remove duplicate events of the SAME TYPE and SAME TEAM that are too close.
    
    IMPROVED: 
    - Increased threshold to 60s (narradores repetem gols por ~1min)
    - Also considers 'team' field to avoid removing goals from different teams
    """
    if not events:
        return []
    
    # Sort by timestamp
    sorted_events = sorted(events, key=lambda e: e.get('videoSecond', e.get('minute', 0) * 60))
    
    result = []
    
    for event in sorted_events:
        event_type = event.get('event_type')
        event_team = event.get('team', 'unknown')
        event_time = event.get('videoSecond', event.get('minute', 0) * 60)
        
        # Check if there's already an event of the SAME TYPE AND TEAM too close
        is_duplicate = False
        
        for existing in result:
            if (existing.get('event_type') == event_type and 
                existing.get('team', 'unknown') == event_team):
                
                existing_time = existing.get('videoSecond', existing.get('minute', 0) * 60)
                time_diff = abs(event_time - existing_time)
                
                if time_diff < threshold_seconds:
                    is_duplicate = True
                    # Keep the one with higher confidence
                    if event.get('confidence', 0) > existing.get('confidence', 0):
                        result.remove(existing)
                        result.append(event)
                    break
        
        if not is_duplicate:
            result.append(event)
    
    return result
```

### Correção 3: Deduplicação na DB Antes de Salvar

**Arquivo**: `video-processor/server.py`

Adicionar verificação antes de salvar cada evento:

```python
# Em analyze_match() antes do loop de salvamento:
# Verificar eventos existentes para evitar duplicatas cross-half
existing_events = session.query(MatchEvent).filter_by(match_id=match_id).all()

for event_data in events:
    # Check for duplicate in ANY half
    is_duplicate = False
    for existing in existing_events:
        if (existing.event_type == event_data.get('event_type') and
            abs(existing.minute - event_data.get('minute', 0)) <= 2):
            is_duplicate = True
            print(f"[ANALYZE] ⚠ Evento duplicado ignorado: {event_data.get('event_type')} {event_data.get('minute')}'")
            break
    
    if is_duplicate:
        continue
    
    # ... resto do salvamento
```

### Correção 4: Fallback por Keywords com VideoSecond do SRT

**Arquivo**: `video-processor/ai_services.py`

Na função `detect_events_by_keywords()` (versão do texto), adicionar cálculo correto de `videoSecond`:

```python
# Linha ~2813
event = {
    'minute': current_minute,
    'second': current_second,
    'event_type': event_type,
    'team': team,
    # ADICIONAR: videoSecond correto do timestamp SRT
    'videoSecond': current_minute * 60 + current_second,  # Posição absoluta no vídeo
    'description': line[:150],
    'confidence': 0.6,
    'is_highlight': event_type in ['goal', 'yellow_card', 'red_card', 'penalty'],
    'isOwnGoal': False,
    'source': 'keyword_fallback'
}
```

### Correção 5: Log Detalhado de Atribuição de Time

**Arquivo**: `video-processor/server.py`

No cálculo do placar (linha ~3770), adicionar logs:

```python
for goal in goal_events:
    team = goal.get('team', 'unknown')
    description = (goal.get('description') or '')[:60]
    
    print(f"[SCORE] 🔍 Analisando gol:")
    print(f"[SCORE]   team field: '{team}'")
    print(f"[SCORE]   description: '{description}'")
    print(f"[SCORE]   isOwnGoal: {goal.get('isOwnGoal', False)}")
    
    # ... resto da lógica de placar
```

---

## Arquivos a Modificar

| Arquivo | Alteração | Prioridade |
|---------|-----------|------------|
| `video-processor/ai_services.py` | Melhorar `detect_team_from_text()` com aliases | Alta |
| `video-processor/ai_services.py` | Aumentar threshold de dedup para 60s e considerar team | Alta |
| `video-processor/ai_services.py` | Adicionar `videoSecond` no fallback por keywords | Alta |
| `video-processor/server.py` | Deduplicação cross-half antes de salvar na DB | Alta |
| `video-processor/server.py` | Logs detalhados de atribuição de placar | Média |

---

## Fluxo Corrigido

```text
1. Transcrição processada
   ↓
2. Detecção de eventos (Ollama/Keywords)
   ↓
3. detect_team_from_text() com aliases → 'home'/'away' preciso
   ↓
4. deduplicate_events() com threshold=60s e verificação de team
   ↓
5. Deduplicação cross-half na DB (verifica ±2 minutos)
   ↓
6. Salvamento com videoSecond correto
   ↓
7. Cálculo de placar com logs detalhados
```

---

## Teste Recomendado

Após implementação, rodar re-análise da partida Brasil x Argentina:
1. Verificar logs para ver atribuição de time em cada gol
2. Confirmar que `team` está 'home' (Brasil) ou 'away' (Argentina) correto
3. Verificar que não há duplicatas (mesmo gol só aparece 1x)
4. Confirmar placar final: Brasil 2 x 0 Argentina
