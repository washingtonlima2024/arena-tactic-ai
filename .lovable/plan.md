

# Deteccao Completa de Fases da Partida via Palavras-Chave (Pre-Eventos)

## Objetivo

Expandir o sistema de deteccao de boundaries (`detect_match_periods_from_transcription`) para identificar TODAS as fases da partida -- incluindo acrescimos, prorrogacao 1T/2T e disputa de penaltis -- ANTES da criacao de eventos. Isso garante que cada evento receba o minuto de jogo correto, independente do tamanho ou formato do arquivo.

## Situacao Atual

O backend ja detecta 5 marcos:
- Inicio do jogo (`_GAME_START_PATTERNS` - 14 padroes)
- Fim do 1T (`_HALFTIME_END_PATTERNS` - 9 padroes)
- Inicio do 2T (`_SECOND_HALF_START_PATTERNS` - 6 padroes)
- Fim do jogo (`_GAME_END_PATTERNS` - 15 padroes)
- Prorrogacao generico (`_EXTRA_TIME_PATTERNS` - 6 padroes)

**Faltam:** acrescimos (1T e 2T), prorrogacao separada (1T vs 2T), e disputa de penaltis.

## Alteracoes

### 1. `video-processor/ai_services.py` -- Novos grupos de padroes e logica expandida

**Adicionar novos padroes de palavras-chave:**

```text
_ADDED_TIME_PATTERNS (acrescimos):
  - "X minutos de acréscimo"
  - "tempo adicional"
  - "acréscimo de X minutos"
  - "o árbitro deu X minutos"
  - "teremos mais X minutos"
  - "minutos a mais"
  - "compensação"
  - "stoppage time"
  Regex para extrair valor: r'(\d+)\s*minutos?\s*(de\s+)?(acr[eé]scimo|adicional|compensa)'

_PENALTY_SHOOTOUT_PATTERNS (penaltis):
  - "disputa de pênaltis"
  - "cobranças de pênaltis"
  - "vamos para os pênaltis"
  - "decisão nos pênaltis"
  - "primeira cobrança"
  - "bateu para o gol" (contexto penalti)
  - "converteu" / "perdeu o pênalti"

_EXTRA_TIME_1T_PATTERNS (prorrogacao 1T):
  - "primeiro tempo da prorrogação"
  - "primeiro tempo extra"
  - "começa a prorrogação"

_EXTRA_TIME_2T_PATTERNS (prorrogacao 2T):
  - "segundo tempo da prorrogação"
  - "segundo tempo extra"
```

**Expandir padroes existentes com as palavras-chave do usuario:**

```text
_GAME_START_PATTERNS (adicionar):
  - "autorizado o início"
  - "iniciado o primeiro tempo"
  - "toca na bola"
  - "apita o árbitro" (contexto inicio, primeiros 25%)

_HALFTIME_END_PATTERNS (adicionar):
  - "equipes vão para o vestiário"
  - "vão para o vestiário"
  - "acabou a primeira etapa"
  - "encerrada a primeira etapa"
  - "fim da primeira etapa"

_SECOND_HALF_START_PATTERNS (adicionar):
  - "iniciado o segundo tempo"
  - "autorizado o reinício"

_GAME_END_PATTERNS (adicionar):
  - "fim da partida"
  - "encerrada a partida"
  - "final da partida"
```

**Atualizar `detect_match_periods_from_transcription()`:**

Adicionar novas secoes de busca para:

1. **Acrescimos 1T**: buscar `_ADDED_TIME_PATTERNS` entre 35-55% do texto, extrair valor numerico (ex: "3 minutos de acrescimo" -> `added_time_1t_minutes: 3`)
2. **Acrescimos 2T**: buscar entre 80-95% do texto
3. **Prorrogacao 1T**: buscar `_EXTRA_TIME_1T_PATTERNS` apos o fim do 2T regular (>75%)
4. **Prorrogacao 2T**: buscar `_EXTRA_TIME_2T_PATTERNS` apos prorrogacao 1T
5. **Penaltis**: buscar `_PENALTY_SHOOTOUT_PATTERNS` nos ultimos 10% do texto

Novos campos no resultado:

```python
result['added_time_1t_minutes'] = None      # int: minutos de acrescimo do 1T
result['added_time_2t_minutes'] = None      # int: minutos de acrescimo do 2T
result['extra_time_1t_start_second'] = None # float: segundo do inicio da prorrogacao 1T
result['extra_time_2t_start_second'] = None # float: segundo do inicio da prorrogacao 2T
result['penalty_shootout_detected'] = False
result['penalty_shootout_second'] = None    # float: segundo do inicio dos penaltis
```

**Atualizar `calculate_game_minute()`:**

Adicionar logica para prorrogacao e penaltis:
- Se `video_second >= penalty_shootout_second` -> minuto = 120+ (penaltis)
- Se `video_second >= extra_time_2t_start_second` -> minuto baseado no inicio da prorrogacao 2T (base 105)
- Se `video_second >= extra_time_1t_start_second` -> minuto baseado no inicio da prorrogacao 1T (base 90)
- Manter logica existente para 1T e 2T regulares

### 2. `video-processor/server.py` -- Persistir novos campos de boundaries

No trecho que salva boundaries no `analysis_job.result` (linha ~3868), adicionar os novos campos:

```python
job_result['boundaries'] = {
    # ... campos existentes ...
    'added_time_1t_minutes': boundaries.get('added_time_1t_minutes'),
    'added_time_2t_minutes': boundaries.get('added_time_2t_minutes'),
    'extra_time_1t_start_second': boundaries.get('extra_time_1t_start_second'),
    'extra_time_2t_start_second': boundaries.get('extra_time_2t_start_second'),
    'penalty_shootout': boundaries.get('penalty_shootout_detected', False),
    'penalty_shootout_second': boundaries.get('penalty_shootout_second'),
}
```

### 3. `src/lib/matchPhases.ts` -- Adicionar fase de Penaltis

- Adicionar `'Penaltis'` ao tipo `PhaseLabel` e ao `PHASE_ORDER`
- Atualizar `getEventPhase()`: eventos com `metadata.penalty_shootout === true` ou minuto > 130 -> 'Penaltis'
- Adicionar `'Penaltis'` a um novo array `PENALTY_PHASES`

### 4. `src/components/match-center/EventsFeed.tsx` e `ClipsGallery.tsx`

- Renderizar fase "Penaltis" com estilo visual proprio (icone de bola, cor diferenciada)
- Manter o padrao existente para as demais fases

## Fluxo Completo (pos-implementacao)

```text
1. Upload de video/link + SRT/TXT
2. detect_match_periods_from_transcription() analisa a transcricao
3. Retorna boundaries completos (inicio, acrescimos, intervalo, 2T, prorrogacao, penaltis)
4. Boundaries salvos no analysis_job
5. calculate_game_minute() usa boundaries para atribuir minuto correto a cada evento
6. Frontend agrupa eventos nas 8 fases possiveis
```

## Arquivos a Modificar

1. **`video-processor/ai_services.py`** -- Novos padroes regex, novos campos no resultado, logica de busca expandida, `calculate_game_minute` atualizado
2. **`video-processor/server.py`** -- Persistir novos campos de boundaries
3. **`src/lib/matchPhases.ts`** -- Fase Penaltis no tipo e classificacao
4. **`src/components/match-center/EventsFeed.tsx`** -- Visual de Penaltis
5. **`src/components/match-center/ClipsGallery.tsx`** -- Visual de Penaltis
