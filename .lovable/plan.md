
# Plano: Expandir script Kakttus2 para múltiplos tipos de eventos

## Contexto Atual

O script `analisar_kakttus2_funcionou.py` implementa um pipeline superior de **pré-filtro por janela deslizante** focado **apenas em gols**:
- Usa regex de 8 linhas para encontrar evidências de gols (`gol`, `golaço`, `marcou`)
- Enriquece com contagem de evidência (mínimo 2 linhas com keyword)
- Filtra por stopwords de jogador (reduz false positives)
- Envia apenas trechos candidatos ao Ollama (kakttus), não a transcrição inteira
- Valida placar final (`enforce_score_consistency`)

**Limitação**: a lógica é hardcoded para gols. Não detecta cartões, pênaltis, escanteios, faltas, etc.

## Solução: Framework genérico e extensível

Vamos criar uma arquitetura que **generaliza** o conceito de pré-filtro por janela deslizante para qualquer tipo de evento, mantendo a precisão do original.

### 1. Definir "Event Recipes" (receitas de detecção)

Cada tipo de evento terá uma "receita" que descreve como detectá-lo localmente:

```text
EventRecipe = {
  event_type: str              # 'goal', 'yellow_card', 'penalty', etc
  
  # Regex patterns (case-insensitive)
  primary_patterns: list       # Strong indicators (e.g., 'cartão vermelho', 'expuls')
  secondary_patterns: list     # Weaker indicators (e.g., 'vermelho para X')
  confirmation_patterns: list  # Context clues (e.g., 'direto ao chuveiro')
  
  # Window parameters
  window_size: int             # Lines before/after (default 8 for goals, adjust per event)
  min_evidence_lines: int      # Minimum lines matching pattern (default 2)
  
  # Filtering
  team_extraction: bool        # Extract which team was involved?
  player_extraction: bool      # Extract player name?
  apply_stopwords_filter: bool # Filter out false positives using STOP_PLAYERS?
  
  # Validation
  validation_rule: str         # How to validate: 'consistency' (placar), 'none', etc
}
```

### 2. EventRecipeRegistry

Catálogo centralizado de todas as receitas. Exemplo inicial:

```text
RECIPES = {
  'goal': EventRecipe(
    primary_patterns=[r'GO+L', r'GOLAÇO', r'É GOL'],
    secondary_patterns=[r'PRA DENTRO', r'ENTROU', r'BOLA NA REDE'],
    confirmation_patterns=[r'REDE', r'CELEBRA', r'ABRAÇO'],
    window_size=8,
    min_evidence_lines=2,
    team_extraction=True,
    player_extraction=True,
    apply_stopwords_filter=True,
    validation_rule='consistency'
  ),
  
  'yellow_card': EventRecipe(
    primary_patterns=[r'CARTÃO AMARELO', r'AMARELO PARA'],
    secondary_patterns=[r'RECEBE O AMARELO', r'LEVA AMARELO'],
    confirmation_patterns=[r'SEGUNDA AMARELA', r'PRÓXIMO JOGO'],
    window_size=6,
    min_evidence_lines=1,
    team_extraction=True,
    player_extraction=True,
    apply_stopwords_filter=False,  # Nomes de jogadores são mais relevantes
    validation_rule='none'
  ),
  
  'red_card': EventRecipe(
    primary_patterns=[r'CARTÃO VERMELHO', r'EXPULS'],
    secondary_patterns=[r'VERMELHO PARA', r'FOI EXPULSO'],
    confirmation_patterns=[r'DIRETO AO CHUVEIRO', r'DEU AS COSTAS'],
    window_size=6,
    min_evidence_lines=1,
    team_extraction=True,
    player_extraction=True,
    apply_stopwords_filter=False,
    validation_rule='none'
  ),
  
  'penalty': EventRecipe(
    primary_patterns=[r'PÊNALTI', r'PENALIDADE MÁXIMA'],
    secondary_patterns=[r'MARCA O PÊNALTI', r'VAI COBRAR'],
    confirmation_patterns=[r'BOLA NA MARCA', r'GOLEIRO RECUA'],
    window_size=5,
    min_evidence_lines=1,
    team_extraction=True,
    player_extraction=True,
    apply_stopwords_filter=False,
    validation_rule='none'
  ),
  
  'corner': EventRecipe(
    primary_patterns=[r'ESCANTEIO', r'CÓRNER', r'BATE O ESCANTEIO'],
    secondary_patterns=[r'COBRANÇA DE ESCANTEIO'],
    confirmation_patterns=[r'NA ÁREA', r'CABEÇADA'],
    window_size=5,
    min_evidence_lines=1,
    team_extraction=True,
    player_extraction=False,  # Corner é de time, não jogador
    apply_stopwords_filter=False,
    validation_rule='none'
  ),
  
  'foul': EventRecipe(
    primary_patterns=[r'FALTA DE', r'FALTA PARA', r'COMETEU FALTA'],
    secondary_patterns=[r'FALTA DURA', r'FALTA PERIGOSA'],
    confirmation_patterns=[r'CARTÃO', r'PROTESTA'],
    window_size=5,
    min_evidence_lines=1,
    team_extraction=True,
    player_extraction=True,
    apply_stopwords_filter=False,
    validation_rule='none'
  ),
  
  'shot': EventRecipe(
    primary_patterns=[r'CHUTOU', r'FINALIZOU', r'BATIDA'],
    secondary_patterns=[r'CHUTE', r'TIRO'],
    confirmation_patterns=[r'DEFESA', r'NA TRAVE', r'FORA'],
    window_size=4,
    min_evidence_lines=1,
    team_extraction=True,
    player_extraction=True,
    apply_stopwords_filter=False,
    validation_rule='none'
  ),
  
  'offside': EventRecipe(
    primary_patterns=[r'IMPEDIMENTO', r'IMPEDIDO'],
    secondary_patterns=[r'OFFSIDE'],
    confirmation_patterns=[r'POS', r'ESTAVA NA FRENTE'],
    window_size=4,
    min_evidence_lines=1,
    team_extraction=True,
    player_extraction=True,
    apply_stopwords_filter=False,
    validation_rule='none'
  ),
}
```

### 3. Implementação (novo módulo: `event_detector.py`)

Criar funções genéricas que reutilizam a lógica do kakttus2:

```text
def find_event_candidates(
    transcript_lines: list,
    recipe: EventRecipe,
    home_team: str,
    away_team: str
) -> list:
  """
  Retorna lista de candidatos para um tipo de evento usando a receita.
  Cada candidato tem: start_line, lines_matched, team_hint, player_hint, snippet_text
  """
  candidates = []
  
  for i, line in enumerate(transcript_lines):
    # Contar hits de primary + secondary patterns
    hits = 0
    matched_patterns = []
    
    for pattern in recipe.primary_patterns:
      if re.search(pattern, line, re.IGNORECASE):
        hits += 2  # Primary vale mais
        matched_patterns.append(pattern)
    
    for pattern in recipe.secondary_patterns:
      if re.search(pattern, line, re.IGNORECASE):
        hits += 1
        matched_patterns.append(pattern)
    
    if hits > 0:
      # Extrair janela deslizante
      start = max(0, i - recipe.window_size // 2)
      end = min(len(transcript_lines), i + recipe.window_size // 2 + 1)
      window_text = " ".join(transcript_lines[start:end])
      
      # Verificar mínimo de linhas
      evidence_count = sum(1 for j in range(start, end)
                          if any(re.search(p, transcript_lines[j], re.IGNORECASE)
                                 for p in recipe.primary_patterns + recipe.secondary_patterns))
      
      if evidence_count >= recipe.min_evidence_lines:
        team_hint = detect_team(window_text, home_team, away_team) if recipe.team_extraction else None
        player_hint = detect_player(window_text, recipe.apply_stopwords_filter) if recipe.player_extraction else None
        
        candidates.append({
          'start_line': start,
          'end_line': end,
          'line_index': i,
          'evidence_count': evidence_count,
          'matched_patterns': matched_patterns,
          'window_text': window_text,
          'team_hint': team_hint,
          'player_hint': player_hint,
          'snippet': window_text[:150]  # Para debug
        })
  
  return candidates


def build_multitype_prompt(candidates_by_type: dict, home_team: str, away_team: str) -> tuple:
  """
  Constrói um único prompt que analisa TODOS os tipos de eventos simultaneamente.
  
  Entrada: { 'goal': [candidates...], 'yellow_card': [candidates...], ... }
  Saída: (system_prompt, user_prompt)
  """
  
  # System prompt (instrui a IA sobre todos os tipos)
  system_prompt = """
  Você é a IA Kakttus, especialista em futebol brasileiro.
  Analise os trechos de transcrição fornecidos e extraia eventos.
  
  Para CADA tipo de evento listado abaixo, você receberá trechos candidatos.
  Valide cada candidato e retorne SOMENTE JSON válido, sem texto adicional.
  
  TIPOS DE EVENTOS:
  - goal: Gol marcado. Extraia time e jogador (se possível).
  - yellow_card: Cartão amarelo. Extraia time e jogador.
  - red_card: Cartão vermelho. Extraia time e jogador.
  - penalty: Pênalti marcado. Extraia time.
  - corner: Escanteio. Extraia time.
  - foul: Falta. Extraia time e jogador.
  - shot: Finalização. Extraia time e jogador.
  - offside: Impedimento. Extraia time e jogador.
  
  FORMATO DA RESPOSTA JSON:
  {
    "goal": [
      { "valid": true|false, "confidence": 0.0-1.0, "team": "home|away|unknown", "player": "name|null", "description": "..." }
    ],
    "yellow_card": [ ... ],
    ...
  }
  """
  
  # User prompt (trechos candidatos)
  user_msg_parts = [f"Analise a partida {home_team} vs {away_team}:\n"]
  
  for event_type, candidates in candidates_by_type.items():
    if candidates:
      user_msg_parts.append(f"\n[{event_type.upper()}]")
      for i, candidate in enumerate(candidates):
        user_msg_parts.append(f"\nCandidato {i+1} (linha {candidate['start_line']}):")
        user_msg_parts.append(f"  Time: {candidate['team_hint']}")
        user_msg_parts.append(f"  Jogador: {candidate['player_hint']}")
        user_msg_parts.append(f"  Trecho: {candidate['snippet']}")
  
  user_prompt = "\n".join(user_msg_parts)
  
  return system_prompt, user_prompt


def analyze_with_kakttus_multitype(
    candidates_by_type: dict,
    home_team: str,
    away_team: str,
    ollama_url: str = "http://localhost:11434"
) -> dict:
  """
  Chama Ollama/Kakttus uma única vez com todos os tipos de eventos.
  Retorna dicionário: { 'goal': [...], 'yellow_card': [...], ... }
  """
  
  system_prompt, user_prompt = build_multitype_prompt(candidates_by_type, home_team, away_team)
  
  # Chamar Ollama
  response = requests.post(f"{ollama_url}/api/generate", json={
    'model': 'washingtonlima/kakttus',
    'system': system_prompt,
    'prompt': user_prompt,
    'stream': False,
    'options': {
      'temperature': 0.3,
      'top_p': 0.8,
      'repeat_penalty': 1.2
    }
  })
  
  if response.status_code != 200:
    return {}
  
  # Extrair JSON da resposta
  response_text = response.json().get('response', '')
  
  try:
    # Procurar bloco JSON na resposta
    json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
    if json_match:
      result = json.loads(json_match.group())
      return result
  except:
    pass
  
  return {}
```

### 4. Integração no backend (`video-processor/server.py`)

Atualizar endpoint `/api/analyze` para usar o novo pipeline:

```text
@app.route('/api/analyze', methods=['POST'])
def analyze_match():
  data = request.json
  match_id = data.get('match_id')
  transcript_file = data.get('transcript_path')
  home_team = data.get('home_team', 'Time Casa')
  away_team = data.get('away_team', 'Time Fora')
  score = data.get('score', {'home': 0, 'away': 0})
  
  # Carregar transcrição
  with open(transcript_file, 'r') as f:
    transcript_lines = [line.strip() for line in f if line.strip()]
  
  # Importar novo módulo
  from event_detector import find_event_candidates, analyze_with_kakttus_multitype, RECIPES
  
  # Para CADA tipo de evento na receita
  candidates_by_type = {}
  for event_type, recipe in RECIPES.items():
    candidates = find_event_candidates(transcript_lines, recipe, home_team, away_team)
    if candidates:
      candidates_by_type[event_type] = candidates
  
  # Uma ÚNICA chamada ao Ollama (tudo junto)
  events_by_type = analyze_with_kakttus_multitype(
    candidates_by_type,
    home_team,
    away_team
  )
  
  # Flatten para lista única de eventos
  all_events = []
  for event_type, events in events_by_type.items():
    for event in events:
      event['event_type'] = event_type
      all_events.append(event)
  
  # Aplicar validações específicas
  if 'goal' in events_by_type:
    enforce_score_consistency(events_by_type['goal'], score)
  
  # Salvar no banco
  ...
  
  return jsonify({'success': True, 'events': all_events})
```

## Arquivos a criar/modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `video-processor/event_detector.py` | CRIAR | Novo módulo com `EventRecipe`, `find_event_candidates()`, `build_multitype_prompt()`, `analyze_with_kakttus_multitype()` |
| `video-processor/ai_services.py` | MODIFICAR | Portar funções `detect_team()` e `detect_player()` do script (se não existirem) |
| `video-processor/server.py` | MODIFICAR | Atualizar `/api/analyze` para usar novo pipeline |

## Benefícios desta arquitetura

✅ **Genérica**: Adicionar novo tipo de evento é tão simples quanto adicionar uma entrada em `RECIPES`
✅ **Eficiente**: Uma única chamada ao LLM para todos os tipos (não n-chamadas sequenciais)
✅ **Precisa**: Pré-filtro local reduz ruído, contexto específico melhora confiança
✅ **Reutilizável**: Funções genéricas não duplicam código
✅ **Validável**: Cada receita pode ter regra de validação customizada

## Extensão futura

Para adicionar um novo evento (ex: `substitution`):
1. Criar entrada em `RECIPES` com patterns e config
2. Pronto! Detectará automaticamente no próximo run

Exemplo:
```text
'substitution': EventRecipe(
  primary_patterns=[r'SUBSTITUIÇÃO', r'SAI', r'ENTRA'],
  secondary_patterns=[r'TROCA'],
  ...
)
```
