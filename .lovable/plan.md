
# Pipeline de Análise Kakttus - ✅ IMPLEMENTADO

## Visao Geral do Novo Pipeline

O sistema realizara analises em 3 etapas sequenciais usando o modelo `washingtonlima/kakttus`:

```text
+------------------+     +------------------+     +------------------+
|   1o TEMPO       |     |   2o TEMPO       |     |   CONSOLIDACAO   |
|   (0-45 min)     | --> |   (46-90 min)    | --> |   (Partida Full) |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        v                        v                        v
  events_first.json       events_second.json      match_analysis.json
  summary_first.txt       summary_second.txt      - tactical_combined
  tactical_first.txt      tactical_second.txt     - match_summary
                                                  - all_events merged
```

## Estrutura de Arquivos Gerados

Para cada partida (match_id), o novo pipeline gerara:

| Pasta | Arquivo | Descricao |
|-------|---------|-----------|
| json/ | `analysis_first_half.json` | Eventos, resumo e tatica do 1o tempo |
| json/ | `analysis_second_half.json` | Eventos, resumo e tatica do 2o tempo |
| json/ | `match_analysis_full.json` | Consolidacao final da partida |
| json/ | `tactical_analysis.json` | Analise tatica completa (legado) |
| json/ | `match_summary.json` | Resumo executivo (legado) |

## Mudancas no ai_services.py

### 1. Nova Funcao Principal: `analyze_with_kakttus()`

Substitui `_analyze_events_with_ollama()` com prompt simplificado:

```python
def analyze_with_kakttus(
    transcript: str,
    home_team: str,
    away_team: str,
    match_half: str = "first"
) -> Dict[str, Any]:
    """
    Analisa transcricao com modelo Kakttus.
    
    Returns:
        {
            "events": [...],       # Lista de eventos detectados
            "summary": "...",      # Resumo do tempo (1-2 frases)
            "tactical": "..."      # Analise tatica do tempo
        }
    """
    half_desc = "1o Tempo" if match_half == "first" else "2o Tempo"
    
    system = (
        "Voce e a IA Kakttus, especialista em futebol brasileiro. "
        "Use raciocinio tatico e contextual. "
        "Retorne SOMENTE JSON valido, sem texto adicional."
    )
    
    user = f"""Analise esta transcricao de {half_desc}:

Times:
home = {home_team}
away = {away_team}

Transcricao:
{transcript[:25000]}

Retorne neste formato JSON:
{{
  "events": [
    {{
      "event_type": "goal",
      "team": "home" ou "away",
      "minute": 23,
      "second": 45,
      "detail": "Gol de cabeca apos escanteio",
      "confidence": 0.95,
      "isOwnGoal": false
    }}
  ],
  "summary": "Resumo do {half_desc} em 1-2 frases",
  "tactical": "Analise tatica: formacao, pressao, transicoes, destaques"
}}

Tipos de evento: goal, penalty, save, chance, foul, corner, shot, yellow_card, red_card
"""

    raw = ask_kakttus(system, user)
    return extract_json(raw)
```

### 2. Nova Funcao: `consolidate_match_analysis()`

Combina as analises dos dois tempos:

```python
def consolidate_match_analysis(
    first_half_analysis: Dict,
    second_half_analysis: Dict,
    home_team: str,
    away_team: str
) -> Dict[str, Any]:
    """
    Consolida analises de 1o e 2o tempo em uma analise completa.
    Usa Kakttus para gerar visao tatica unificada.
    """
    # Merge events
    all_events = (first_half_analysis.get('events', []) + 
                  second_half_analysis.get('events', []))
    
    # Generate combined tactical analysis
    combined_prompt = f"""
Com base nestas analises parciais, gere uma analise tatica COMPLETA da partida:

1o TEMPO:
{first_half_analysis.get('summary', 'N/A')}
Tatica: {first_half_analysis.get('tactical', 'N/A')}

2o TEMPO:  
{second_half_analysis.get('summary', 'N/A')}
Tatica: {second_half_analysis.get('tactical', 'N/A')}

Retorne JSON:
{{
  "match_summary": "Resumo completo da partida (3-4 frases)",
  "tactical_full": "Analise tatica completa da partida",
  "key_moments": ["Momento 1", "Momento 2", ...],
  "performance": {{
    "home": "Avaliacao do time da casa",
    "away": "Avaliacao do time visitante"
  }}
}}
"""
    
    raw = ask_kakttus(SYSTEM_PROMPT, combined_prompt)
    consolidated = extract_json(raw) or {}
    
    return {
        "events": all_events,
        "first_half": first_half_analysis,
        "second_half": second_half_analysis,
        "consolidated": consolidated,
        "score": calculate_score(all_events, home_team, away_team)
    }
```

### 3. Modificar `analyze_match_events()` 

Nova assinatura que suporta analise por tempo:

```python
def analyze_match_events(
    transcription: str,
    home_team: str,
    away_team: str,
    game_start_minute: int = 0,
    game_end_minute: int = 45,
    match_id: str = None,
    settings: Dict = None
) -> List[Dict[str, Any]]:
    """
    Analisa eventos usando APENAS modelo Kakttus.
    """
    match_half = 'first' if game_start_minute < 45 else 'second'
    
    print(f"[AI] Analisando {match_half} tempo com Kakttus...")
    
    # Analise principal
    result = analyze_with_kakttus(
        transcript=transcription,
        home_team=home_team,
        away_team=away_team,
        match_half=match_half
    )
    
    events = result.get('events', [])
    summary = result.get('summary', '')
    tactical = result.get('tactical', '')
    
    # Salvar analise do tempo
    if match_id:
        save_half_analysis(match_id, match_half, {
            'events': events,
            'summary': summary,
            'tactical': tactical,
            'analyzed_at': datetime.utcnow().isoformat()
        })
    
    # Enriquecer e deduplicar
    enriched = enrich_events(events, game_start_minute, game_end_minute)
    final = deduplicate_goal_events(enriched)
    
    return final
```

## Mudancas no server.py

### 1. Novo Endpoint: `/api/matches/<id>/consolidate`

Chamado apos analise de ambos os tempos:

```python
@app.route('/api/matches/<match_id>/consolidate', methods=['POST'])
def consolidate_match(match_id: str):
    """
    Consolida analises de 1o e 2o tempo em analise completa.
    Deve ser chamado apos analise de ambos os tempos.
    """
    json_path = get_subfolder_path(match_id, 'json')
    
    # Carregar analises parciais
    first_path = json_path / 'analysis_first_half.json'
    second_path = json_path / 'analysis_second_half.json'
    
    if not first_path.exists():
        return jsonify({'error': 'Analise do 1o tempo nao encontrada'}), 400
    
    with open(first_path, 'r') as f:
        first_half = json.load(f)
    
    # 2o tempo e opcional (jogo pode ter sido interrompido)
    second_half = {}
    if second_path.exists():
        with open(second_path, 'r') as f:
            second_half = json.load(f)
    
    # Consolidar
    full_analysis = ai_services.consolidate_match_analysis(
        first_half, second_half, home_team, away_team
    )
    
    # Salvar
    full_path = json_path / 'match_analysis_full.json'
    with open(full_path, 'w') as f:
        json.dump(full_analysis, f, ensure_ascii=False, indent=2)
    
    # Atualizar placar no banco
    update_match_score(match_id, full_analysis['score'])
    
    return jsonify(full_analysis)
```

### 2. Atualizar Pipeline Principal

No `/api/matches/<id>/pipeline`:

```python
# Apos processar todos os videos...

# Se processou ambos os tempos, consolidar automaticamente
has_first = (json_path / 'analysis_first_half.json').exists()
has_second = (json_path / 'analysis_second_half.json').exists()

if has_first and has_second:
    print("[PIPELINE] Consolidando analises dos dois tempos...")
    consolidate_result = consolidate_match(match_id)
    results['consolidated'] = True
elif has_first:
    print("[PIPELINE] Apenas 1o tempo analisado")
    results['consolidated'] = False
```

## Funcoes a Remover (Simplificacao)

Funcoes que serao removidas ou simplificadas:

| Funcao Atual | Acao |
|--------------|------|
| `_analyze_events_with_ollama()` | Substituir por `analyze_with_kakttus()` |
| `_validate_goals_with_context()` | Remover (Kakttus ja valida) |
| `_validate_all_events_with_context()` | Remover |
| Fallbacks para GPT/Gemini | Remover (apenas Kakttus) |
| Deteccao por keywords | Manter como ultimo fallback |

## Fluxo Completo Resumido

```text
1. Usuario envia video do 1o tempo
   -> analyze_match_events(half='first')
   -> Salva analysis_first_half.json

2. Usuario envia video do 2o tempo  
   -> analyze_match_events(half='second')
   -> Salva analysis_second_half.json

3. Sistema detecta ambos analisados
   -> consolidate_match_analysis()
   -> Gera match_analysis_full.json
   -> Atualiza placar final

4. Chatbot Arena pode usar:
   - analysis_first_half.json (perguntas do 1o tempo)
   - analysis_second_half.json (perguntas do 2o tempo)
   - match_analysis_full.json (visao completa)
```

## Detalhes Tecnicos

### Arquivo: video-processor/ai_services.py

Alteracoes principais:
- Linhas 4266-4530: Substituir `_analyze_events_with_ollama` por `analyze_with_kakttus`
- Linhas 4615-4900: Simplificar `analyze_match_events` removendo fallbacks
- Adicionar novas funcoes: `consolidate_match_analysis`, `save_half_analysis`

### Arquivo: video-processor/server.py

Alteracoes principais:
- Linhas 5200-5650: Atualizar pipeline para chamar consolidacao
- Adicionar endpoint `/api/matches/<id>/consolidate`
- Atualizar `/api/matches/<id>/summary` para usar novos JSONs

### Estrutura JSON de Saida

```json
// analysis_first_half.json
{
  "match_id": "uuid",
  "half": "first",
  "events": [...],
  "summary": "Sport dominou o 1o tempo mas nao conseguiu abrir o placar.",
  "tactical": "Formacao 4-3-3 com pressao alta. Novorizontino recuado.",
  "analyzed_at": "2026-02-05T10:30:00Z"
}

// match_analysis_full.json
{
  "match_id": "uuid",
  "first_half": {...},
  "second_half": {...},
  "events": [...all...],
  "consolidated": {
    "match_summary": "Sport venceu por 1x0 com gol contra no 2o tempo...",
    "tactical_full": "Analise completa...",
    "key_moments": ["Gol contra aos 67'", "Expulsao aos 82'"],
    "performance": {
      "home": "Sport foi eficiente na defesa...",
      "away": "Novorizontino criou mais chances..."
    }
  },
  "score": {"home": 0, "away": 1}
}
```
