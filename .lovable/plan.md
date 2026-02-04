
# Plano: Correção das Funções de Detecção de Eventos

## Problemas Identificados

### ❌ Erro Crítico 1: Função `detect_events_by_keywords_from_text` não existe

A função está sendo **chamada** em 2 lugares mas **nunca foi definida**:

```python
# Linha 4094 - Chamada sem definição
keyword_events = detect_events_by_keywords_from_text(
    transcription=transcription,
    home_team=home_team,
    ...
)

# Linha 4162 - Mesma situação
keyword_events = detect_events_by_keywords_from_text(...)
```

**Resultado:** O código irá falhar com `NameError: name 'detect_events_by_keywords_from_text' is not defined` quando o fallback de keywords for acionado.

---

### ⚠️ Erro 2: Função `detect_events_by_keywords` está duplicada

Existem **duas definições** com o mesmo nome no arquivo:
- **Linha 1354:** Primeira versão
- **Linha 3666:** Segunda versão (sobrescreve a primeira)

**Resultado:** Comportamento inconsistente - a segunda definição sobrescreve a primeira.

---

### ⚠️ Erro 3: `validate_event_timestamps` não está sendo chamada

A função existe (linha 3570) mas **nunca é invocada** no fluxo de detecção.

**Resultado:** Eventos com timestamp zero não são filtrados nem corrigidos.

---

## Correções Necessárias

### Correção 1: Criar a função `detect_events_by_keywords_from_text`

Adicionar a função que processa **texto bruto** (não SRT) com mapeamento de proximidade de timestamps:

```python
def detect_events_by_keywords_from_text(
    transcription: str,
    home_team: str,
    away_team: str,
    game_start_minute: int = 0,
    video_duration: float = None
) -> List[Dict[str, Any]]:
    """
    Detecta eventos por keywords em texto bruto (não-SRT).
    
    MELHORADO: Usa mapa de timestamps para associar keywords ao tempo correto.
    
    Args:
        transcription: Texto bruto da transcrição
        home_team: Time da casa
        away_team: Time visitante
        game_start_minute: Minuto inicial (0 ou 45)
        video_duration: Duração do vídeo em segundos (para validação)
    
    Returns:
        Lista de eventos detectados com timestamps
    """
    events = []
    
    # 1. Criar mapa de timestamps encontrados no texto
    timestamp_pattern = r'(\d{2}):(\d{2}):(\d{2})'
    timestamp_map = {}
    
    for match in re.finditer(timestamp_pattern, transcription):
        position = match.start()
        hours, mins, secs = match.groups()
        total_seconds = int(hours) * 3600 + int(mins) * 60 + int(secs)
        timestamp_map[position] = {
            'minute': game_start_minute + int(mins) + int(hours) * 60,
            'second': int(secs),
            'videoSecond': total_seconds
        }
    
    print(f"[Keywords-Text] Mapa de timestamps: {len(timestamp_map)} encontrados")
    
    # 2. Padrões de eventos
    patterns = {
        'goal': [r'go+l', r'golaço', r'bola na rede', r'abre o placar', r'empata'],
        'yellow_card': [r'cartão amarelo', r'amarelou'],
        'red_card': [r'cartão vermelho', r'expuls'],
        'penalty': [r'pênalti', r'penalidade'],
        'save': [r'grande defesa', r'salvou', r'espalmou'],
    }
    
    # 3. Para cada keyword encontrada, associar ao timestamp mais próximo
    for event_type, keyword_list in patterns.items():
        for pattern in keyword_list:
            for match in re.finditer(pattern, transcription, re.IGNORECASE):
                keyword_pos = match.start()
                
                # Encontrar timestamp mais próximo (antes OU depois)
                closest_ts = None
                min_distance = float('inf')
                
                for ts_pos, ts_data in timestamp_map.items():
                    distance = abs(keyword_pos - ts_pos)
                    if distance < min_distance:
                        min_distance = distance
                        closest_ts = ts_data
                
                if closest_ts:
                    # Usar detect_goal_author para gols
                    if event_type == 'goal':
                        window_text = transcription[max(0, keyword_pos-200):keyword_pos+200]
                        author = detect_goal_author(window_text, home_team, away_team)
                        team = author['team']
                        confidence = author['confidence']
                    else:
                        team = detect_team_from_text(
                            transcription[max(0, keyword_pos-100):keyword_pos+100],
                            home_team, away_team
                        )
                        confidence = 0.8
                    
                    event = {
                        'minute': closest_ts['minute'],
                        'second': closest_ts['second'],
                        'videoSecond': closest_ts['videoSecond'],
                        'event_type': event_type,
                        'team': team,
                        'description': match.group()[:50],
                        'confidence': confidence,
                        'detection_method': 'keyword_text',
                        'timestampSource': 'proximity_map'
                    }
                    events.append(event)
                    print(f"[Keywords-Text] ✓ {event_type} em {closest_ts['minute']}:{closest_ts['second']:02d}")
                    break  # Uma detecção por padrão
    
    # 4. Validar timestamps (remover zeros inválidos)
    events = validate_event_timestamps(events, video_duration)
    
    # 5. Deduplicar
    events = deduplicate_events(events, threshold_seconds=30)
    
    print(f"[Keywords-Text] Total: {len(events)} eventos detectados")
    return events
```

---

### Correção 2: Remover função duplicada

Remover a segunda definição de `detect_events_by_keywords` (linhas 3666-3868) que é uma duplicata.

---

### Correção 3: Chamar `validate_event_timestamps` no fluxo principal

Adicionar chamada à função de validação após a detecção de eventos:

```python
# Em _analyze_events_with_ollama, após detectar eventos:
events = validate_event_timestamps(events, video_duration=None)
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Adicionar função `detect_events_by_keywords_from_text()` |
| `video-processor/ai_services.py` | Remover função duplicada (linhas 3666-3868) |
| `video-processor/ai_services.py` | Adicionar chamada a `validate_event_timestamps()` no fluxo |

---

## Resultado Esperado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Fallback de keywords | ❌ `NameError` | ✅ Funciona com mapa de proximidade |
| Funções duplicadas | ⚠️ 2 definições | ✅ 1 definição apenas |
| Validação de timestamps | ❌ Não chamada | ✅ Filtra zeros inválidos |
| Clips com tempo zero | ❌ Gerados errados | ✅ Rejeitados ou distribuídos |

---

## Detalhes da Implementação

A nova função `detect_events_by_keywords_from_text`:

1. **Mapeia todos os timestamps** encontrados no texto ANTES de procurar keywords
2. **Associa cada keyword** ao timestamp mais próximo (não só linha por linha)
3. **Usa `detect_goal_author`** para atribuição precisa de times em gols
4. **Valida timestamps** no final para rejeitar zeros inválidos
5. **Adiciona metadado `timestampSource`** para debug
