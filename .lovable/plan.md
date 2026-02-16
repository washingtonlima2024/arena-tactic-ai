

# Corrigir: Pipeline Async Nao Detecta Boundaries e Nao Passa Parametros ao Kakttus

## Problema

A analise gerou apenas 2 eventos (2 gols) porque o **pipeline async** (`_run_async_pipeline` no `server.py`) chama `analyze_match_events()` **sem detectar boundaries** e **sem passar `video_game_start_second` nem `boundaries`**.

Comparacao entre os dois caminhos:

```text
/api/analyze-match (manual):
  1. Detecta boundaries via SRT/TXT          <-- EXISTE
  2. Calcula video_game_start_second          <-- EXISTE
  3. Passa ambos para analyze_match_events()  <-- EXISTE

Pipeline async (Smart Import):
  1. Detecta boundaries                       <-- NAO EXISTE
  2. Calcula video_game_start_second          <-- NAO EXISTE
  3. Passa ambos                              <-- NAO PASSA (linhas 9315-9320)
```

Sem boundaries, o fallback por keywords (que foi adicionado na ultima sessao) nao consegue calcular timestamps corretos.

## Solucao

### Arquivo: `video-processor/server.py`

**Adicionar deteccao de boundaries e calculo de offset no pipeline async** (antes da Phase 4, entre linhas ~9288 e 9289):

1. **Detectar boundaries** usando a mesma logica do `/api/analyze-match`:
   - Ler SRT ou TXT do storage
   - Chamar `ai_services.detect_match_periods_from_transcription()`
   - Salvar boundaries no analysis_job

2. **Calcular `video_game_start_second`** a partir dos boundaries detectados

3. **Passar `video_game_start_second` e `boundaries`** na chamada `analyze_match_events()` (linhas 9315 e 9406):

```python
# ANTES (linha 9315-9320):
events = ai_services.analyze_match_events(
    first_half_text, home_team, away_team, 0, game_end,
    match_id=match_id,
    use_dual_verification=True,
    settings=local_settings
)

# DEPOIS:
events = ai_services.analyze_match_events(
    first_half_text, home_team, away_team, 0, game_end,
    match_id=match_id,
    use_dual_verification=True,
    settings=local_settings,
    video_game_start_second=first_half_offset,
    boundaries=boundaries_1t
)
```

4. **Mesma correcao para o 2o tempo** (linha ~9406):
   - Usar `second_half_start_second` dos boundaries como offset
   - Passar boundaries do 2T

### Detalhes da implementacao

**Bloco a inserir antes da Phase 4 (antes da linha 9289):**

```python
# ========== PHASE 3.5: DETECT BOUNDARIES ==========
boundaries_1t = {}
boundaries_2t = {}
first_half_offset = 0
second_half_offset = 0

# Detectar boundaries do 1T
if first_half_text:
    boundaries_1t = ai_services.detect_match_periods_from_transcription(first_half_text)
    if boundaries_1t.get('game_start_second') is not None:
        first_half_offset = int(boundaries_1t['game_start_second'])
        print(f"[ASYNC-PIPELINE] Boundaries 1T: inicio={first_half_offset}s")

# Se nao detectou pelo texto, tentar pelo SRT
if not boundaries_1t.get('game_start_second'):
    srt_1t = get_subfolder_path(match_id, 'srt') / 'first_half.srt'
    if srt_1t.exists():
        with open(srt_1t, 'r', encoding='utf-8') as f:
            boundaries_1t = ai_services.detect_match_periods_from_transcription(f.read())
        if boundaries_1t.get('game_start_second') is not None:
            first_half_offset = int(boundaries_1t['game_start_second'])

# Detectar boundaries do 2T
if second_half_text:
    boundaries_2t = ai_services.detect_match_periods_from_transcription(second_half_text)
    if boundaries_2t.get('second_half_start_second') is not None:
        second_half_offset = int(boundaries_2t['second_half_start_second'])
    elif boundaries_2t.get('game_start_second') is not None:
        second_half_offset = int(boundaries_2t['game_start_second'])

# Persistir no analysis_job
# (mesma logica do /api/analyze-match)
```

**Modificar chamada do 1T (linha 9315):**
- Adicionar `video_game_start_second=first_half_offset`
- Adicionar `boundaries=boundaries_1t`

**Modificar chamada do 2T (linha ~9406):**
- Adicionar `video_game_start_second=second_half_offset`
- Adicionar `boundaries=boundaries_2t`

## Arquivo a Modificar

- `video-processor/server.py` -- Adicionar deteccao de boundaries no pipeline async e passar parametros para `analyze_match_events()`

