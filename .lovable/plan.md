
# Corrigir: Fallback por Keywords no Pipeline Kakttus

## Problema Identificado

A analise do jogo gerou apenas **1 evento** porque o pipeline Kakttus (Ollama) nao possui fallback por keywords quando retorna poucos eventos.

O fluxo atual:
1. `analyze_match_events()` detecta `use_ollama_flow = True` (Ollama e o provedor primario)
2. Chama `analyze_with_kakttus()` que usa o `event_detector.py` (pipeline multi-eventos)
3. Se o pipeline retorna poucos eventos (ex: 1), o sistema aceita e retorna esse unico evento
4. **NAO existe fallback por keywords** neste fluxo -- diferente do fluxo Ollama legado (linha 5786) que tem `if len(events) < 3: usar fallback`

## Causa Raiz

No fluxo Kakttus (linhas 6083-6322 de `ai_services.py`), apos receber os eventos do `analyze_with_kakttus()`:
- Se `events` existe (mesmo que seja apenas 1), entra no bloco `if events:` (linha 6100)
- Enriquece, deduplica e retorna na linha 6322
- **Nunca verifica se o numero de eventos e suficiente**
- **Nunca aciona o fallback por keywords do SRT/TXT**

O fallback por keywords (linhas 5785-5876) so existe no fluxo Ollama legado, que NAO e chamado quando o pipeline Kakttus funciona.

## Solucao

### Arquivo: `video-processor/ai_services.py`

**Adicionar fallback por keywords apos o enriquecimento de timestamps no pipeline Kakttus** (entre as linhas 6210 e 6212):

```text
Logica a adicionar:
1. Apos enriquecer timestamps e antes de retornar final_events
2. Se len(final_events) < 10, acionar fallback por keywords
3. Buscar SRT do tempo correto (mesmo padrao ja usado no Ollama legado)
4. Usar detect_events_by_keywords() para SRT ou detect_events_by_keywords_from_text() para texto
5. Merge com deduplicacao (janela de 2 minutos por tipo de evento)
6. Log detalhado dos eventos adicionados pelo fallback
```

Pseudo-codigo:
```python
# FALLBACK: Se Kakttus retornou poucos eventos, usar keywords
if len(final_events) < 10 and match_id:
    print(f"[Kakttus] Poucos eventos ({len(final_events)}), acionando fallback keywords...")
    
    # Buscar SRT do tempo correto
    target_srt = encontrar_srt_do_tempo(match_id, match_half)
    
    if target_srt:
        keyword_events = detect_events_by_keywords(srt_path, home_team, away_team, match_half, game_start_minute)
    else:
        keyword_events = detect_events_by_keywords_from_text(transcription, home_team, away_team, ...)
    
    # Merge com deduplicacao
    for ke in keyword_events:
        if nao_duplicado(ke, final_events, janela=2min):
            final_events.append(ke)
    
    print(f"[Kakttus] Total apos fallback: {len(final_events)} eventos")
```

### Detalhes Tecnicos

1. **Inserir o fallback** entre as linhas 6210 e 6212 de `ai_services.py` (apos o bloco de enriquecimento de timestamps e antes do log "ANALISE COMPLETA")

2. **Reutilizar a mesma logica** do fallback Ollama legado (linhas 5785-5876), adaptando para o contexto do pipeline Kakttus:
   - Mesma busca de SRT por prioridade de nome (`{match_half}_half.srt`, etc.)
   - Mesma deduplicacao por janela de 2 minutos
   - Passar `video_game_start_second` e `boundaries` para calculo correto dos timestamps

3. **Threshold**: usar `< 10` em vez de `< 3` para ser mais agressivo no fallback, garantindo que partidas com poucos eventos detectados pela IA sejam complementadas

## Arquivo a Modificar

- `video-processor/ai_services.py` -- Adicionar bloco de fallback por keywords no fluxo Kakttus pipeline (entre linhas 6210-6212)
