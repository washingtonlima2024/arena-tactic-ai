

# Usar Tempo Real do Audio/Transcricao para Boundaries (sem tempo fixo)

## Problema Atual

O sistema ja detecta os 4 marcadores da partida via `detect_match_periods_from_transcription`, mas **nao usa esses dados completamente**. Em 3 pontos criticos, o valor `45` esta hardcoded:

1. **`calculate_game_minute()`** (ai_services.py:681): `return 45 + int(elapsed // 60)` -- ignora `first_half_duration_min`
2. **`segment_start_minute`** (server.py:3900): `= game_start_minute if half_type == 'first' else 45` -- fixo
3. **Clips do 2T** (server.py:2910): `segment_start = 45 if video_paths.get('second_half') else 0` -- fixo

## Solucao

### 1. `video-processor/ai_services.py` - `calculate_game_minute`

Usar `first_half_duration_min` dos boundaries quando disponivel:

```python
def calculate_game_minute(video_second, boundaries, game_start_minute=0):
    game_start = boundaries.get('game_start_second', 0)
    second_half_start = boundaries.get('second_half_start_second')
    first_half_min = boundaries.get('first_half_duration_min')
    
    # Base do 2T: duracao real do 1T (arredondada) ou 45 como fallback
    second_half_base = int(round(first_half_min)) if first_half_min and first_half_min > 40 else 45
    
    if second_half_start and video_second >= second_half_start:
        elapsed = max(0, video_second - second_half_start)
        return second_half_base + int(elapsed // 60), int(elapsed % 60)
    
    elapsed = max(0, video_second - game_start)
    return game_start_minute + int(elapsed // 60), int(elapsed % 60)
```

### 2. `video-processor/server.py` - `segment_start_minute` dinamico

Na linha 3900, usar a duracao real do 1T dos boundaries:

```python
if half_type == 'first':
    segment_start_minute = game_start_minute
else:
    first_half_min = boundaries.get('first_half_duration_min')
    segment_start_minute = int(round(first_half_min)) if first_half_min and first_half_min > 40 else 45
```

Mesma correcao na linha 2910 (clips do 2T).

### 3. `video-processor/ai_services.py` - Adicionar deteccao por TXT (sem SRT)

A deteccao atual so extrai timestamps precisos de SRTs (`HH:MM:SS,mmm -->`). Para transcrições TXT puras, adicionar busca de timestamps em formatos como `[MM:SS]`, `MM:SS` ou mencoes textuais ("aos 45 minutos"):

```python
# Se nao e SRT, tentar extrair tempo de padroes de texto
if not is_srt:
    # Buscar [45:00] ou 45:00 proximo ao marcador
    txt_ts = re.search(r'\[?(\d{1,2}):(\d{2})\]?', before_text)
    if txt_ts:
        result['game_start_second'] = int(txt_ts.group(1)) * 60 + int(txt_ts.group(2))
    # Buscar "aos X minutos"
    mention = re.search(r'aos?\s+(\d{1,3})\s*minutos?', before_text)
    if mention:
        result['game_start_second'] = int(mention.group(1)) * 60
```

Aplicar o mesmo padrao para halftime, 2T start e game end.

### 4. `video-processor/ai_services.py` - Ampliar patterns de deteccao

Adicionar mais frases comuns de narracao que indicam inicio/fim:

```python
# Game Start - adicionar:
re.compile(r'come[cç]ou\s+o\s+jogo', re.IGNORECASE),
re.compile(r'vale\s*!', re.IGNORECASE),

# Halftime End - adicionar:
re.compile(r'intervalo', re.IGNORECASE),  # so a palavra, mas limitado a regiao 25-75%

# Game End - adicionar:
re.compile(r'encerrou', re.IGNORECASE),
re.compile(r'acabou\s+tudo', re.IGNORECASE),
```

### 5. `video-processor/server.py` - Salvar boundaries nos metadados da partida

Persistir os boundaries detectados no match para que o frontend possa usar na timeline:

```python
# Apos detectar boundaries, salvar nos metadados do match
if boundaries.get('confidence', 0) > 0.3:
    session = get_session()
    match = session.query(Match).get(match_id)
    if match:
        meta = match.metadata or {}
        meta['boundaries'] = {
            'game_start_second': boundaries.get('game_start_second'),
            'halftime_second': boundaries.get('halftime_timestamp_seconds'),
            'second_half_start_second': boundaries.get('second_half_start_second'),
            'game_end_second': boundaries.get('game_end_second'),
            'first_half_duration_min': boundaries.get('first_half_duration_min'),
            'extra_time': boundaries.get('extra_time_detected', False),
            'confidence': boundaries.get('confidence'),
        }
        match.metadata = meta
        session.commit()
    session.close()
```

### 6. Frontend - Agrupar eventos por fase na timeline

**`src/components/events/EventTimeline.tsx`** e **`src/components/analysis/AnalysisEventTimeline.tsx`**:

Usar os boundaries salvos nos metadados para criar separadores visuais entre fases:

```typescript
const getPhaseLabel = (event: MatchEvent) => {
  const min = event.minute || 0;
  const half = (event.metadata as any)?.half || event.match_half;
  
  if (half === 'first_half' || half === 'first') {
    return min > 45 ? 'Acrescimos 1T' : '1o Tempo';
  }
  if (min > 90) return 'Acrescimos 2T';
  return '2o Tempo';
};
```

Renderizar um separador visual (linha horizontal + badge) quando a fase muda entre eventos consecutivos.

### 7. `video-processor/event_detector.py` - Keywords de gol extras

Conforme documento aprovado anteriormente:

```python
secondary_patterns=[
    ...,
    r'\bfez\b',
    r'chutou\s+pro\s+gol',
],
```

## Fluxo Corrigido

```text
1. Transcricao/SRT chega no backend
2. detect_match_periods_from_transcription() analisa o texto:
   - Encontra "rola a bola" em 00:02:15 -> game_start = 135s
   - Encontra "fim do primeiro tempo" em 00:50:30 -> halftime = 3030s
   - Calcula: first_half_duration = (3030 - 135) / 60 = 48.3 min
   - Encontra "comeca o segundo tempo" em 00:55:10 -> 2T start = 3310s
   - Encontra "fim de jogo" em 01:48:00 -> game_end = 6480s
3. calculate_game_minute() usa 48 (nao 45) como base do 2T
4. Boundaries sao salvos nos metadados do match
5. Frontend agrupa eventos: 1T (0-48'), Acrescimos 1T, 2T (48-96'), Acrescimos 2T
```

## Arquivos a Modificar

1. **`video-processor/ai_services.py`** - `calculate_game_minute` usar `first_half_duration_min`; ampliar patterns; deteccao TXT
2. **`video-processor/server.py`** - `segment_start_minute` dinamico (linhas 3900 e 2910); salvar boundaries no match
3. **`video-processor/event_detector.py`** - Keywords extras de gol
4. **`src/components/events/EventTimeline.tsx`** - Separadores visuais por fase
5. **`src/components/analysis/AnalysisEventTimeline.tsx`** - Separadores visuais por fase

