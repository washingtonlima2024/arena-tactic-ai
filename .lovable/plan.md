

# Plano: Detecção de Gols por Janela de Repetição (5 Linhas SRT)

## Problema Atual

O sistema detectou **25 gols falsos** porque considera qualquer menção isolada de "gol" como evento. O insight do usuário é que **gols reais** são caracterizados por:

1. Palavra "gol" repetida **múltiplas vezes** em **linhas consecutivas**
2. Sempre acompanhado de **nome do jogador** ou **time**
3. Narrador celebra por ~5 linhas seguidas

**Exemplo de gol REAL no SRT:**
```
365: "de Felipe Coutinho, ele gosta de bater pro gol daí."
366: "Olha a bomba! Aí o gol! Aí o gol! Aí"
367: "o gol! Aí o gol! Gol! É do Brasil! Brasil"  ← CENTRO (usa este timestamp)
368: "Brasil do Felipe Coutinho! Do jeitinho que ele gosta!"
369: "ele pegou aí na bola eu disse..."
```

Total: **7 menções de "gol"** em 5 linhas = **é gol real!**

---

## Nova Regra: Espaçamento de 5 Linhas Entre Eventos

Conforme solicitado: se um gol é detectado na **linha 366**, o próximo gol do **mesmo tipo** só pode ser detectado a partir da **linha 371** (5 linhas depois).

---

## Solução Técnica

### 1. Nova Função: `detect_goals_by_sliding_window()`

```python
def detect_goals_by_sliding_window(
    srt_blocks: List[Tuple],
    home_team: str,
    away_team: str,
    window_size: int = 5,
    min_goal_mentions: int = 3,
    min_block_gap: int = 5  # NOVO: espaçamento mínimo entre gols
) -> List[Dict[str, Any]]:
    """
    Detecta gols REAIS analisando repetição em janela de 5 linhas.
    
    Critérios:
    - "gol" deve aparecer 3+ vezes na janela de 5 linhas
    - Exclui "goleiro" da contagem
    - Usa timestamp da linha CENTRAL
    - Mínimo de 5 linhas entre detecções do mesmo evento
    """
```

### 2. Modificar `detect_events_by_keywords()` para usar sliding window

Integrar a nova função para substituir a detecção de gols simples:

```python
# ANTES: qualquer linha com "gol" gera evento
# DEPOIS: só janelas com 3+ "gol" em 5 linhas geram evento
```

### 3. Lógica de Espaçamento por Índice de Bloco

```python
# Track last goal block index per team
last_goal_block = {'home': -10, 'away': -10, 'unknown': -10}

# Só aceitar se passou 5+ blocos desde último gol desse time
if block_index - last_goal_block[team] < min_block_gap:
    print(f"[SlidingWindow] ⏳ Gol ignorado (menos de {min_block_gap} blocos)")
    continue

# Registrar este bloco como último gol
last_goal_block[team] = block_index
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Adicionar `detect_goals_by_sliding_window()` |
| `video-processor/ai_services.py` | Modificar `detect_events_by_keywords()` para usar sliding window |
| `video-processor/ai_services.py` | Remover padrão `GO+L` genérico dos triggers (usar sliding window) |

---

## Implementação Detalhada

### Função `detect_goals_by_sliding_window()`

```python
def detect_goals_by_sliding_window(
    srt_blocks: List[Tuple],
    home_team: str,
    away_team: str,
    window_size: int = 5,
    min_goal_mentions: int = 3,
    min_block_gap: int = 5
) -> List[Dict[str, Any]]:
    """
    Detecta gols analisando repetição em janela deslizante.
    
    Um gol REAL é caracterizado por:
    - "gol" repetido 3+ vezes em janela de 5 linhas
    - Nome do time ou jogador presente
    - Linha central = timestamp de referência
    - Mínimo 5 blocos entre gols do mesmo time
    """
    goals = []
    
    # Padrão para contar "gol" (excluindo "goleiro")
    goal_pattern = r'\bgol\b(?!eiro)'
    
    # Track último bloco de gol por time
    last_goal_block = {'home': -10, 'away': -10, 'unknown': -10}
    
    for i in range(len(srt_blocks)):
        # Criar janela: 2 antes + atual + 2 depois
        start = max(0, i - 2)
        end = min(len(srt_blocks), i + 3)
        window = srt_blocks[start:end]
        
        # Concatenar texto da janela
        window_text = ' '.join([b[5] for b in window]).lower()
        
        # Contar "gol" (excluindo "goleiro")
        goal_count = len(re.findall(goal_pattern, window_text, re.IGNORECASE))
        
        # Critério 1: mínimo 3 menções
        if goal_count < min_goal_mentions:
            continue
        
        # Detectar time na janela
        team = detect_team_from_text(window_text, home_team, away_team)
        
        # Critério 2: espaçamento de 5 blocos
        if i - last_goal_block[team] < min_block_gap:
            print(f"[SlidingWindow] ⏳ Bloco {i}: Gol ignorado (<{min_block_gap} blocos de distância)")
            continue
        
        # É um gol real! Usar bloco central
        center_block = srt_blocks[i]
        _, hours, minutes, seconds, _, text = center_block
        timestamp_seconds = hours * 3600 + minutes * 60 + seconds
        
        # Extrair jogador (se possível)
        player = extract_player_from_window(window_text)
        
        goals.append({
            'event_type': 'goal',
            'minute': minutes,
            'second': seconds,
            'videoSecond': timestamp_seconds,
            'team': team,
            'player': player,
            'description': f"Gol! {player or team}",
            'source_text': text,
            'confidence': min(0.9, 0.6 + (goal_count * 0.1)),  # Mais repetições = maior confiança
            'goal_mentions': goal_count,
            'detection_method': 'sliding_window',
            'block_index': i
        })
        
        # Registrar para evitar duplicatas
        last_goal_block[team] = i
        print(f"[SlidingWindow] ✓ GOL detectado no bloco {i} [{minutes:02d}:{seconds:02d}] - {goal_count}x 'gol' - {team}")
    
    return goals
```

### Integração em `detect_events_by_keywords()`

```python
# Na função detect_events_by_keywords(), ANTES do loop principal:

# Detectar gols usando sliding window (mais preciso)
goal_events = detect_goals_by_sliding_window(
    srt_blocks, 
    home_team, 
    away_team,
    window_size=5,
    min_goal_mentions=3,
    min_block_gap=5
)
events.extend(goal_events)
print(f"[KEYWORDS] 🎯 {len(goal_events)} gols detectados por sliding window")

# No loop principal, PULAR detecção de gols (já foi feita acima)
for block_index, block in enumerate(srt_blocks):
    # ... código existente ...
    
    for event_type, keywords in EVENT_KEYWORDS.items():
        if event_type == 'goal':
            continue  # Gols já detectados por sliding window
        
        # Detectar outros eventos (cartões, faltas, etc.)
```

---

## Fluxo Corrigido

```
1. Carregar SRT em blocos
   ↓
2. detect_goals_by_sliding_window() com janela de 5 linhas
   ↓
3. Para cada bloco, contar "gol" (excluindo "goleiro")
   ↓
4. Se contagem >= 3 E passou 5+ blocos do último gol:
   → É gol real! Usar timestamp da linha central
   ↓
5. Detectar outros eventos (cartões, faltas) por keywords
   ↓
6. Retornar eventos sem duplicatas
```

---

## Exemplo de Execução

**Input (SRT com 25 menções dispersas de "gol"):**
- Bloco 365: "bater pro gol" → 1x gol (isolado)
- Bloco 366-368: "gol! gol! gol!" → 7x gol (janela)
- Bloco 400: "quase gol" → 1x gol (isolado)
- ...

**Processamento:**
```
Bloco 366: janela[364-368], gol_count=7 → ✓ GOL REAL!
Bloco 367: janela[365-369], gol_count=7 → ⏳ Ignorado (<5 blocos)
Bloco 400: janela[398-402], gol_count=1 → ✗ Descartado (<3 menções)
```

**Output:**
```
2 gols detectados (Brasil 2 x 0 Argentina)
```

---

## Benefícios

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Falsos positivos | 25 gols | 2 gols |
| Método | Regex simples | Janela de repetição |
| "goleiro" | Contava como "gol" | Excluído |
| Duplicatas | Por tempo (60s) | Por blocos (5 linhas) |
| Timestamp | Linha individual | Linha central da janela |

---

## Uso do Ollama (Opcional)

Conforme sugerido, Ollama/Llama Vision será reservado apenas para:
- Validar lances polêmicos (impedimento, pênalti contestado)
- Descrever jogadas complexas onde texto não basta

Não será usado para detecção de gols - o sliding window é **100% determinístico** e **gratuito**.

