
# Plano: Regra de Proximidade + Cores dos Times para Atribuição Correta

## Problema Atual

1. **Função `detect_team_from_text()`** retorna `'unknown'` quando ambos os times são mencionados
2. **Fallback para `'home'`** causa atribuição errada
3. **Não usamos YOLO** - usamos Gemini Vision (mas cores não são aproveitadas)

---

## Solução em 2 Partes

### Parte 1: Regra de Proximidade Textual (Prioridade)

Nova função `detect_goal_author()` que analisa PROXIMIDADE ao padrão "gol":

```python
def detect_goal_author(window_text: str, home_team: str, away_team: str) -> str:
    """
    Detecta o AUTOR do gol usando análise de proximidade.
    
    Prioridades:
    1. Padrão "gol do/de [TEAM]" - certeza absoluta
    2. Padrão "[TEAM] marca/marcou gol"
    3. Proximidade: time mencionado mais perto de "gol"
    4. Contagem: time mais mencionado
    """
```

**Exemplo:**
```
"Gol do Brasil! Brasil vence a Argentina por 2 a 0!"

1. Encontra "gol do Brasil" → BRASIL (padrão direto)
2. Ignora "Argentina" (está a 7+ palavras do "gol")
3. Resultado: 'home' (Brasil)
```

### Parte 2: Cores dos Times para Validação Visual (Opcional)

Passar cores cadastradas para a detecção visual:

```python
def detect_goal_author_with_colors(
    window_text: str,
    home_team: str,
    away_team: str,
    home_color: str = None,  # "#FFFF00" (amarelo Brasil)
    away_color: str = None,  # "#75AADB" (azul Argentina)
    video_frame: str = None  # Base64 do frame
) -> Dict[str, Any]:
    """
    Combina análise textual + visual para atribuição.
    """
```

Se houver frame de vídeo disponível, pode usar Gemini Vision para validar:
- Qual time está comemorando?
- Qual uniforme está mais próximo do gol?

---

## Implementação Detalhada

### Nova Função `detect_goal_author()`

```python
def detect_goal_author(
    window_text: str,
    home_team: str,
    away_team: str,
    home_color: str = None,
    away_color: str = None
) -> Dict[str, Any]:
    """
    Detecta o AUTOR do gol usando análise de proximidade textual.
    
    Returns:
        {
            'team': 'home' | 'away' | 'unknown',
            'confidence': 0.0-1.0,
            'method': 'pattern' | 'proximity' | 'count' | 'fallback',
            'details': str
        }
    """
    text_lower = window_text.lower()
    
    home_variants = get_team_variants(home_team)
    away_variants = get_team_variants(away_team)
    
    # ═══════════════════════════════════════════════════════════════
    # PRIORIDADE 1: Padrão "gol do/de [TEAM]"
    # Certeza absoluta - o time logo após "gol do" é o autor
    # ═══════════════════════════════════════════════════════════════
    gol_de_pattern = r'go+l\s+(?:d[eo]|da|dos|das)\s+(\w+(?:\s+\w+)?)'
    match = re.search(gol_de_pattern, text_lower)
    if match:
        team_mentioned = match.group(1).strip()
        
        for variant in home_variants:
            if variant in team_mentioned or team_mentioned in variant:
                return {
                    'team': 'home',
                    'confidence': 1.0,
                    'method': 'pattern',
                    'details': f'Matched "gol do {team_mentioned}" → home'
                }
        
        for variant in away_variants:
            if variant in team_mentioned or team_mentioned in variant:
                return {
                    'team': 'away',
                    'confidence': 1.0,
                    'method': 'pattern',
                    'details': f'Matched "gol do {team_mentioned}" → away'
                }
    
    # ═══════════════════════════════════════════════════════════════
    # PRIORIDADE 2: Padrão "[TEAM] marca/marcou/faz/fez gol"
    # ═══════════════════════════════════════════════════════════════
    for variant in home_variants:
        pattern = rf'\b{re.escape(variant)}\b\s+(?:marca|marcou|faz|fez|anota|anotou)'
        if re.search(pattern, text_lower):
            return {
                'team': 'home',
                'confidence': 0.95,
                'method': 'pattern',
                'details': f'{variant} marca/faz → home'
            }
    
    for variant in away_variants:
        pattern = rf'\b{re.escape(variant)}\b\s+(?:marca|marcou|faz|fez|anota|anotou)'
        if re.search(pattern, text_lower):
            return {
                'team': 'away',
                'confidence': 0.95,
                'method': 'pattern',
                'details': f'{variant} marca/faz → away'
            }
    
    # ═══════════════════════════════════════════════════════════════
    # PRIORIDADE 3: Proximidade textual ao "gol"
    # O time mencionado MAIS PERTO de "gol" é o autor
    # ═══════════════════════════════════════════════════════════════
    words = text_lower.split()
    gol_indices = [i for i, w in enumerate(words) if re.match(r'go+l', w)]
    
    if gol_indices:
        gol_pos = gol_indices[0]
        
        home_distance = float('inf')
        away_distance = float('inf')
        
        for i, word in enumerate(words):
            for variant in home_variants:
                if variant in word or word in variant:
                    home_distance = min(home_distance, abs(i - gol_pos))
                    break
        
        for i, word in enumerate(words):
            for variant in away_variants:
                if variant in word or word in variant:
                    away_distance = min(away_distance, abs(i - gol_pos))
                    break
        
        # Se um está significativamente mais perto (2+ palavras de diferença)
        if home_distance < away_distance and (away_distance - home_distance) >= 2:
            return {
                'team': 'home',
                'confidence': 0.85,
                'method': 'proximity',
                'details': f'home_dist={home_distance}, away_dist={away_distance}'
            }
        if away_distance < home_distance and (home_distance - away_distance) >= 2:
            return {
                'team': 'away',
                'confidence': 0.85,
                'method': 'proximity',
                'details': f'away_dist={away_distance}, home_dist={home_distance}'
            }
    
    # ═══════════════════════════════════════════════════════════════
    # PRIORIDADE 4: Contagem - time mais mencionado
    # ═══════════════════════════════════════════════════════════════
    home_count = sum(1 for v in home_variants if v in text_lower)
    away_count = sum(1 for v in away_variants if v in text_lower)
    
    if home_count > away_count:
        return {
            'team': 'home',
            'confidence': 0.7,
            'method': 'count',
            'details': f'home_count={home_count}, away_count={away_count}'
        }
    if away_count > home_count:
        return {
            'team': 'away',
            'confidence': 0.7,
            'method': 'count',
            'details': f'away_count={away_count}, home_count={home_count}'
        }
    
    # ═══════════════════════════════════════════════════════════════
    # PRIORIDADE 5: Unknown (SEM fallback arbitrário)
    # ═══════════════════════════════════════════════════════════════
    return {
        'team': 'unknown',
        'confidence': 0.0,
        'method': 'fallback',
        'details': 'Could not determine team'
    }
```

---

## Integração com Cores (Fase 2 - Opcional)

Se o usuário quiser validação visual, podemos usar as cores cadastradas:

```python
def validate_goal_author_with_vision(
    frame_base64: str,
    home_color: str,
    away_color: str
) -> Dict[str, Any]:
    """
    Usa Gemini Vision para validar qual time marcou o gol
    baseado nas cores do uniforme e comemoração.
    """
    prompt = f"""Analise esta imagem de um gol de futebol.

Os times são:
- Time da casa: uniforme cor {home_color}
- Time visitante: uniforme cor {away_color}

Qual time está comemorando o gol? 
Qual time está com a bola próxima ao gol?

Responda apenas: HOME ou AWAY"""
    
    result = detect_players_in_frame(image_data=frame_base64)
    # Analisar homeTeamColor vs awayTeamColor retornado
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Adicionar `detect_goal_author()` |
| `video-processor/ai_services.py` | Modificar `detect_goals_by_sliding_window()` para usar nova função |
| `video-processor/ai_services.py` | Remover fallback `'home'` para `'unknown'` |
| `video-processor/server.py` | Passar cores dos times para a análise |

---

## Resultado Esperado

**Antes:**
```
"Gol do Brasil! Brasil vence Argentina"
→ detect_team_from_text() → 'unknown' (ambos mencionados)
→ fallback → 'home'
→ Se home=Argentina → ERRO
```

**Depois:**
```
"Gol do Brasil! Brasil vence Argentina"
→ detect_goal_author() encontra "gol do Brasil"
→ Brasil está em home_variants? SIM
→ return 'home' com confidence=1.0
→ CORRETO ✓
```

---

## Sobre YOLO

Atualmente **não usamos YOLO**. A detecção de jogadores usa **Gemini Vision** (`detect_players_in_frame()`).

**Vantagens de adicionar YOLO:**
- Detecção offline (sem API)
- Mais rápido para múltiplos frames
- Tracking de jogadores entre frames

**Desvantagens:**
- Requer instalação de ultralytics/PyTorch
- Não identifica times (só detecta pessoas)
- Precisa de modelo treinado para futebol

Se quiser, podemos integrar YOLO para detecção de jogadores + cores do uniforme para identificar times. Isso seria uma melhoria significativa para animações táticas.
