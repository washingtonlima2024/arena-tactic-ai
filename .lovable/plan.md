

# Plano: Filtro Anti-Times-Externos + Regras Avançadas para Outros Eventos

## Insight do Usuário

Como sabemos quais times estão jogando pelo cadastro da partida, qualquer menção a **outro time** durante a narração é provavelmente um comentário sobre outro jogo - não um evento real desta partida.

**Exemplo de falso positivo:**
```srt
"E no outro jogo, o Flamengo marcou! Gol do Flamengo!"
```
Se a partida é Sport x Novorizontino, este "gol" é de OUTRA partida e deve ser **ignorado**.

---

## Solução: 3 Camadas de Filtro

### Camada 1: Filtro Global Anti-Times-Externos

Aplicar a TODOS os eventos (gols, cartões, faltas, etc.):

```python
def is_other_team_commentary(text: str, home_team: str, away_team: str) -> bool:
    """
    Detecta se o texto menciona um time que NÃO está jogando.
    Se mencionar time externo = provavelmente é comentário sobre outro jogo.
    """
    detected_teams = detect_teams_in_text(text)
    
    # Se não detectou nenhum time, aceitar o evento
    if not detected_teams:
        return False
    
    # Verificar se algum time detectado é dos times da partida
    home_variants = get_team_variants(home_team)
    away_variants = get_team_variants(away_team)
    
    for team in detected_teams:
        # Se encontrou time que NÃO é home nem away = outro jogo
        if team not in home_variants and team not in away_variants:
            return True  # É comentário sobre outro time
    
    return False
```

### Camada 2: Phrases de "Outro Jogo"

Detectar frases que indicam claramente que é outro jogo:

```python
OTHER_GAME_PHRASES = [
    "em outro jogo", "no outro jogo", "na outra partida",
    "na rodada", "nesta rodada", "placar parcial",
    "tabela", "classificação", "mostramos os gols",
    "gols continuam saindo", "gols na rodada",
    "enquanto isso", "e lá no outro", "lá no maracanã",
    "lá no mineirão", "lá em são paulo"
]
```

### Camada 3: Regras Específicas por Tipo de Evento

| Evento | Regra Atual | Regra Proposta |
|--------|-------------|----------------|
| **Gol** | Sliding window + 3 menções | + Filtro de times externos |
| **Cartão Amarelo** | Keyword simples | + Nome de jogador próximo + time da partida |
| **Cartão Vermelho** | Keyword simples | + Nome de jogador + "expulso" + time da partida |
| **Pênalti** | Keyword simples | + Intensity score (emoção) + time da partida |
| **Falta** | Keyword simples | Manter simples (muito frequente) |
| **Escanteio** | Keyword simples | Manter simples (muito frequente) |

---

## Implementação

### Novas Funções

#### 1. `detect_teams_in_text()`
```python
def detect_teams_in_text(text: str) -> List[str]:
    """
    Detecta todos os times mencionados em um texto.
    Usa KNOWN_TEAMS + TEAM_ALIASES.
    """
    text_lower = text.lower()
    found = []
    
    for team in KNOWN_TEAMS:
        if re.search(r'\b' + re.escape(team) + r'\b', text_lower):
            found.append(team)
    
    for key, aliases in TEAM_ALIASES.items():
        for alias in aliases:
            if re.search(r'\b' + re.escape(alias) + r'\b', text_lower):
                if key not in found:
                    found.append(key)
    
    return found
```

#### 2. `get_team_variants()`
```python
def get_team_variants(team_name: str) -> Set[str]:
    """
    Retorna todas as variações de um nome de time.
    Ex: "Sport" → {"sport", "leão", "sport recife", ...}
    """
    variants = {team_name.lower()}
    
    for key, aliases in TEAM_ALIASES.items():
        if key in team_name.lower() or team_name.lower() in key:
            variants.add(key)
            variants.update(a.lower() for a in aliases)
    
    return variants
```

#### 3. `is_other_game_commentary()`
```python
def is_other_game_commentary(
    window_text: str, 
    home_team: str, 
    away_team: str
) -> bool:
    """
    Verifica se o texto é comentário sobre OUTRO jogo.
    """
    text_lower = window_text.lower()
    
    # Checar frases explícitas de outro jogo
    for phrase in OTHER_GAME_PHRASES:
        if phrase in text_lower:
            return True
    
    # Checar se menciona time que não está jogando
    detected = detect_teams_in_text(text_lower)
    if not detected:
        return False
    
    home_variants = get_team_variants(home_team)
    away_variants = get_team_variants(away_team)
    valid_teams = home_variants | away_variants
    
    for team in detected:
        if team.lower() not in valid_teams:
            return True  # Time externo mencionado
    
    return False
```

#### 4. `validate_card_event()`
```python
def validate_card_event(
    text: str, 
    window_text: str,
    card_type: str,  # 'yellow_card' ou 'red_card'
    home_team: str,
    away_team: str
) -> Dict[str, Any]:
    """
    Valida se é um cartão REAL com regras avançadas.
    """
    # Filtro 1: Não pode ser sobre outro time
    if is_other_game_commentary(window_text, home_team, away_team):
        return {'is_valid': False, 'reason': 'other_game'}
    
    # Filtro 2: Deve ter nome de jogador próximo
    has_player = bool(re.search(r'PARA\s+[A-Z][a-z]+', window_text, re.IGNORECASE))
    
    # Filtro 3: Para vermelho, deve ter "expulso"
    if card_type == 'red_card':
        has_expulso = 'expuls' in window_text.lower()
        if not has_expulso:
            return {'is_valid': False, 'reason': 'no_expulsion_context'}
    
    return {'is_valid': True, 'confidence': 0.9 if has_player else 0.7}
```

#### 5. `validate_penalty_event()`
```python
def validate_penalty_event(
    text: str,
    window_text: str,
    home_team: str,
    away_team: str
) -> Dict[str, Any]:
    """
    Valida se é um pênalti REAL com regras avançadas.
    """
    # Filtro 1: Não pode ser sobre outro time
    if is_other_game_commentary(window_text, home_team, away_team):
        return {'is_valid': False, 'reason': 'other_game'}
    
    # Filtro 2: Deve ter emoção/intensidade
    intensity = intensity_score(window_text)
    if intensity < 1:
        return {'is_valid': False, 'reason': 'low_intensity'}
    
    # Filtro 3: Não pode ser "perdeu o pênalti" sem contexto positivo
    if 'perdeu' in window_text.lower() and 'mas' not in window_text.lower():
        return {'is_valid': False, 'reason': 'penalty_missed_context'}
    
    return {'is_valid': True, 'confidence': min(0.95, 0.7 + intensity * 0.1)}
```

---

## Integração em `detect_events_by_keywords()`

```python
# No loop de detecção de outros eventos:
for event_type, keywords in EVENT_KEYWORDS.items():
    if event_type == 'goal':
        continue  # Já processado por sliding window
    
    for keyword in keywords:
        if re.search(keyword, text_upper, re.IGNORECASE):
            # NOVO: Obter contexto da janela
            window_text = get_window_text(srt_blocks, block_index, window=2)
            
            # NOVO: Validar que não é sobre outro jogo
            if is_other_game_commentary(window_text, home_team, away_team):
                print(f"[KEYWORDS] ⚠️ {event_type} ignorado (outro time mencionado)")
                continue
            
            # NOVO: Validações específicas por tipo
            if event_type in ['yellow_card', 'red_card']:
                validation = validate_card_event(text, window_text, event_type, home_team, away_team)
                if not validation['is_valid']:
                    print(f"[KEYWORDS] ⚠️ {event_type} ignorado ({validation['reason']})")
                    continue
            
            if event_type == 'penalty':
                validation = validate_penalty_event(text, window_text, home_team, away_team)
                if not validation['is_valid']:
                    print(f"[KEYWORDS] ⚠️ {event_type} ignorado ({validation['reason']})")
                    continue
            
            # Evento válido!
            event = { ... }
            events.append(event)
```

---

## Modificar `detect_goals_by_sliding_window()`

Adicionar filtro anti-times-externos:

```python
# Antes de confirmar o gol:
if is_other_game_commentary(window_text, home_team, away_team):
    print(f"[SlidingWindow] ⚠️ Bloco {i}: Gol ignorado (menciona time externo)")
    continue
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Adicionar `OTHER_GAME_PHRASES` |
| `video-processor/ai_services.py` | Adicionar `detect_teams_in_text()` |
| `video-processor/ai_services.py` | Adicionar `get_team_variants()` |
| `video-processor/ai_services.py` | Adicionar `is_other_game_commentary()` |
| `video-processor/ai_services.py` | Adicionar `validate_card_event()` |
| `video-processor/ai_services.py` | Adicionar `validate_penalty_event()` |
| `video-processor/ai_services.py` | Modificar `detect_goals_by_sliding_window()` |
| `video-processor/ai_services.py` | Modificar `detect_events_by_keywords()` |

---

## Fluxo de Validação

```text
Evento detectado por keyword
        ↓
[Filtro 1] É sobre outro jogo/time?
        ├── SIM → REJEITAR
        └── NÃO ↓
        
[Filtro 2] Regras específicas do tipo
        ├── Cartão: tem nome de jogador? expulso?
        ├── Pênalti: tem intensidade? não é "perdeu"?
        ├── Gol: sliding window + 3 menções
        └── Falta/Escanteio: manter simples
        ↓
[Filtro 3] Deduplicação (60s, mesmo tipo, mesmo time)
        ↓
Evento confirmado!
```

---

## Resultado Esperado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Gols de outros jogos | Detectados como eventos | Filtrados |
| Cartões sem contexto | Falsos positivos | Exigem jogador |
| Pênaltis sem emoção | Falsos positivos | Exigem intensidade |
| Comentários sobre tabela | Podem gerar eventos | Filtrados |

---

## Exemplo Prático

**Partida:** Sport x Novorizontino

**SRT:**
```
"Gol do Flamengo lá no Maracanã! 1 a 0 para o Mengão!"
```

**Processamento:**
1. `detect_teams_in_text()` → ["flamengo"]
2. `get_team_variants("Sport")` → {"sport", "leão", ...}
3. `get_team_variants("Novorizontino")` → {"novorizontino", "tigre", ...}
4. "flamengo" NOT IN {"sport", "leão", "novorizontino", "tigre"}
5. **REJEITAR** → é comentário sobre outro jogo

