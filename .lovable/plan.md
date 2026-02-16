
# Corrigir Pipeline de Analise: Timestamps, Nomes e Validacao

## Resumo dos Problemas

A analise gerou eventos com timestamps zerados (minute=0 ou 45), nomes de jogadores inventados ("Nem Mar", "Tando", "Falta"), e gols potencialmente falsos. A causa raiz eh que o modelo Kakttus 7B recebe texto sem timestamps e alucina dados.

## Solucao em 4 Partes

### Parte 1: Usar SRT como fonte primaria para o Kakttus (em vez de texto corrido)

**Arquivo**: `video-processor/ai_services.py` (funcao `analyze_with_kakttus`, linha 1249)

Atualmente a funcao recebe `transcript` e faz `strip_srt_to_text()` (linha 1265), removendo todos os timestamps. Mudar para:

1. Se a transcricao contem formato SRT (tem `-->` e blocos numerados), **manter o formato SRT** para enviar ao Kakttus
2. Apenas fazer strip para o `find_all_candidates` do event_detector (que trabalha com texto)
3. O prompt do Kakttus (fallback legado, linha 1319) ja instrui a usar timestamps SRT — basta nao remove-los

Isso permite que o modelo 7B extraia timestamps dos blocos SRT (ex: `00:24:52,253 --> 00:24:55,500`) em vez de inventar.

### Parte 2: Enriquecer timestamps de TODOS os eventos (nao so gols)

**Arquivo**: `video-processor/ai_services.py` (linhas 6168-6242)

Atualmente o filtro `events_needing_timestamps` so busca gols:
```python
events_needing_timestamps = [
    e for e in final_events 
    if e.get('event_type') == 'goal' and e.get('minute', 0) == 0
]
```

Mudar para buscar QUALQUER evento com minute=0 ou minute=game_start_minute sem videoSecond:
```python
events_needing_timestamps = [
    e for e in final_events 
    if e.get('minute', 0) in (0, game_start_minute) and e.get('videoSecond', 0) == 0
]
```

E na associacao, fazer match por `event_type` (nao so gols) e por `team`:
```python
for event in events_needing_timestamps:
    etype = event.get('event_type')
    team = event.get('team', 'unknown')
    for ke in keyword_events:
        if ke.get('event_type') == etype and ke.get('team') == team:
            # Atribuir timestamp
            ...
```

### Parte 3: Validar nomes de jogadores contra a transcricao

**Arquivo**: `video-processor/ai_services.py` (funcao `_enrich_events`, linha 5925)

Adicionar validacao de nomes apos o enriquecimento:
1. Para cada evento com campo `player`, verificar se o nome (ou parte dele, minimo 4 chars) aparece na transcricao
2. Se nao aparece, limpar o campo (setar como string vazia)
3. Isso elimina alucinacoes como "Tando", "Dos", "Paulo Montenegro"

```python
# Dentro de _enrich_events, apos o loop principal:
for event in enriched:
    player = event.get('player', '')
    if player and len(player) > 2:
        # Verificar se nome aparece na transcricao (case-insensitive)
        if player.lower() not in transcription_lower:
            # Tentar partes do nome (sobrenome)
            parts = player.split()
            found = any(p.lower() in transcription_lower for p in parts if len(p) > 3)
            if not found:
                event['player'] = ''
                event['metadata']['player_hallucinated'] = player
```

Nota: A funcao `_enrich_events` nao recebe a transcricao hoje — sera preciso passar como parametro.

### Parte 4: Priorizar SRT no pipeline multi-eventos

**Arquivo**: `video-processor/ai_services.py` (funcao `analyze_match_events`, linhas 6120-6250)

Antes de chamar `analyze_with_kakttus`, verificar se existe SRT para o tempo. Se sim, usar o conteudo SRT como `transcription` em vez do texto do Whisper. Isso da ao modelo timestamps reais.

```python
# Antes de chamar analyze_with_kakttus (linha 6129):
srt_transcript = None
if match_id:
    from storage import get_subfolder_path
    srt_folder = get_subfolder_path(match_id, 'srt')
    for pattern in [f'{match_half}_transcription.srt', f'{match_half}_half.srt']:
        candidate = srt_folder / pattern
        if candidate.exists():
            srt_transcript = candidate.read_text(encoding='utf-8')
            break

kakttus_result = analyze_with_kakttus(
    transcript=srt_transcript or transcription,
    home_team=home_team,
    away_team=away_team,
    match_half=match_half
)
```

## Resultado Esperado

- Kakttus recebe SRT com timestamps reais → extrai minutos corretos (24', 38', etc.)
- Eventos sem timestamp sao enriquecidos via keywords (nao so gols)
- Nomes inventados sao removidos automaticamente
- Todos os eventos tem timestamps proporcionais no minimo (nunca 0 ou 45)

## Detalhes Tecnicos

### Arquivos a modificar

1. **`video-processor/ai_services.py`**:
   - `analyze_with_kakttus` (linha 1265): Nao fazer `strip_srt_to_text` quando recebe SRT — manter formato SRT para o prompt
   - `analyze_match_events` (linha 6129): Carregar SRT do storage e passar ao Kakttus
   - Bloco de enriquecimento (linhas 6168-6242): Expandir para todos os tipos de eventos
   - `_enrich_events` (linha 5925): Adicionar parametro `transcription` e validar nomes de jogadores

### Impacto

- Nenhuma mudanca no frontend
- Nenhuma mudanca no event_detector.py
- Compativel com o pipeline existente (fallback por keywords continua funcionando)
- Se nao houver SRT, o comportamento atual eh mantido (texto corrido + timestamps proporcionais)
