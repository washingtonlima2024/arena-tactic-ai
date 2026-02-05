
# Plano: Conectar o Pipeline Kakttus ao Fluxo Principal

## Problema Identificado

As novas funcoes foram criadas, mas NAO estao sendo usadas:

```text
FLUXO ATUAL (QUEBRADO):
analyze_match_events()
    ↓
_analyze_events_with_ollama()
    ↓
Salva: detected_events_first.json
       validated_events_first.json
    ↓
[CONSOLIDACAO ESPERA]: analysis_first_half.json ❌ NAO EXISTE!
```

## Solucao

Modificar `analyze_match_events()` para usar o novo pipeline Kakttus e salvar os arquivos corretos.

## Alteracoes no ai_services.py

### Linha 5038-5120: Substituir chamada antiga por nova

**Codigo Atual:**
```python
if use_ollama_flow:
    try:
        events = _analyze_events_with_ollama(
            transcription=transcription,
            home_team=home_team,
            away_team=away_team,
            ...
        )
```

**Codigo Novo:**
```python
if use_ollama_flow:
    try:
        # NOVO PIPELINE KAKTTUS
        print(f"[AI] Usando pipeline Kakttus para {match_half} tempo...")
        
        # 1. Analise com Kakttus (retorna events + summary + tactical)
        kakttus_result = analyze_with_kakttus(
            transcript=transcription,
            home_team=home_team,
            away_team=away_team,
            match_half=match_half
        )
        
        events = kakttus_result.get('events', [])
        
        # 2. Salvar analise do tempo (JSON que o consolidador espera)
        if match_id:
            save_half_analysis(match_id, match_half, {
                'events': events,
                'summary': kakttus_result.get('summary', ''),
                'tactical': kakttus_result.get('tactical', ''),
                'analyzed_at': datetime.utcnow().isoformat() + "Z",
                'home_team': home_team,
                'away_team': away_team
            })
        
        # 3. Continua com enriquecimento e deduplicacao...
```

## Arquivos que Serao Gerados Apos Correcao

| Arquivo | Conteudo |
|---------|----------|
| `analysis_first_half.json` | Events + Summary + Tactical do 1o tempo |
| `analysis_second_half.json` | Events + Summary + Tactical do 2o tempo |
| `match_analysis_full.json` | Consolidacao automatica (quando ambos existem) |

## Fluxo Corrigido

```text
NOVO FLUXO:
analyze_match_events()
    ↓
analyze_with_kakttus()  ← NOVO
    ↓
save_half_analysis()    ← NOVO  
    ↓
Salva: analysis_first_half.json ✓
    ↓
[2o tempo processado]
    ↓
Salva: analysis_second_half.json ✓
    ↓
[CONSOLIDACAO AUTOMATICA]
    ↓
Gera: match_analysis_full.json ✓
```

## Detalhes Tecnicos

### Arquivo: video-processor/ai_services.py

Alteracoes necessarias:
- Linhas 5038-5120: Substituir bloco `if use_ollama_flow` para chamar `analyze_with_kakttus` e `save_half_analysis`
- Manter deduplicacao e enriquecimento de eventos apos a analise

### Funcoes que Serao Usadas (ja existem)

| Funcao | Linha | Proposito |
|--------|-------|-----------|
| `analyze_with_kakttus()` | 559 | Analisa transcricao e retorna events/summary/tactical |
| `save_half_analysis()` | 747 | Salva JSON do tempo analisado |
| `consolidate_match_analysis()` | 649 | Combina tempos em analise completa |

## Resultado Esperado

1. Cada tempo analisado gera seu arquivo `analysis_{half}_half.json`
2. Quando ambos existem, consolidacao automatica cria `match_analysis_full.json`
3. Chatbot Arena pode usar os 3 arquivos para responder perguntas sobre a partida
