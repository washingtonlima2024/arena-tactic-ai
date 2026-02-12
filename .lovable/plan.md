

# Detectar limites completos da partida pela transcrição e corrigir minutos

## Contexto

O sistema já possui `detect_match_periods_from_transcription()` em `ai_services.py` que detecta:
- Fim do 1T (intervalo) -- com timestamp SRT
- Início do 2T -- com posição no texto
- Prorrogação -- com timestamp SRT

Faltam dois marcadores essenciais:
- **Início do jogo** (apito inicial / "rola a bola")
- **Fim do jogo** (apito final)

Com esses 4 pontos, a estrutura temporal da partida fica completamente mapeada:

```text
|-- pré-jogo --|-- 1T (45+acresc) --|-- intervalo --|-- 2T (45+acresc) --|-- pós-jogo --|
               ^                     ^                ^                    ^
          game_start          1st_half_end      2nd_half_start        game_end
```

Cada evento detectado pode então ser posicionado corretamente:
- Evento no 1T: `minute = (videoSecond - game_start_second) / 60`
- Evento no 2T: `minute = 45 + (videoSecond - second_half_start_second) / 60`

## Mudanças

### 1. Novos patterns em `ai_services.py`

Adicionar `_GAME_START_PATTERNS` e `_GAME_END_PATTERNS`:

```text
_GAME_START_PATTERNS = [
    'rola a bola', 'bola rolando', 'começa o jogo', 'começa a partida',
    'apito inicial', 'bola em jogo', 'o jogo começou',
    'saída de bola', 'pontapé inicial', 'primeiro toque',
    'começa o primeiro tempo', 'bola rolando para o primeiro tempo'
]

_GAME_END_PATTERNS = [
    'fim de jogo', 'final de jogo', 'acabou o jogo',
    'termina a partida', 'apito final', 'encerra o jogo',
    'termina o jogo', 'encerrada a partida', 'acabou a partida',
    'terminou o jogo', 'termina o segundo tempo',
    'acabou o segundo tempo', 'fim do segundo tempo'
]
```

### 2. Expandir `detect_match_periods_from_transcription()`

Ampliar a funcao existente para retornar tambem:
- `game_start_second`: timestamp SRT do inicio do jogo
- `game_end_second`: timestamp SRT do fim do jogo
- `second_half_start_second`: timestamp SRT do inicio do 2T (ja parcialmente existente)
- `first_half_duration_min`: duracao real do 1T (incluindo acrescimos)

Logica de busca:
- Inicio do jogo: buscar nos primeiros 25% do texto
- Fim do jogo: buscar nos ultimos 25% do texto
- Halftime e 2T: ja existem (25%-75%)

### 3. Nova funcao: `calculate_game_minute()`

Funcao centralizada que converte videoSecond para minuto de jogo:

```text
def calculate_game_minute(video_second, boundaries):
    """
    Converte segundo absoluto do video para minuto de jogo.
    
    Usa os limites detectados:
    - Se video_second < halftime -> minuto do 1T
    - Se video_second > second_half_start -> minuto do 2T (base 45)
    - Se entre halftime e 2T start -> intervalo (ignora)
    """
    game_start = boundaries.get('game_start_second', 0)
    ht_end = boundaries.get('halftime_timestamp_seconds')
    second_half_start = boundaries.get('second_half_start_second')
    
    if second_half_start and video_second >= second_half_start:
        # Evento no 2T
        elapsed = video_second - second_half_start
        return 45 + (elapsed // 60), elapsed % 60
    
    # Evento no 1T (ou sem deteccao de halves)
    elapsed = max(0, video_second - game_start)
    return elapsed // 60, elapsed % 60
```

### 4. Integrar no pipeline de analise (`server.py`)

No endpoint `/api/analyze-match`, chamar `detect_match_periods_from_transcription()` e usar os boundaries para:
- Definir `video_game_start_second` automaticamente
- Passar boundaries para `refine_event_timestamp_from_srt()` e `detect_events_by_keywords_from_text()`
- Usar `calculate_game_minute()` em vez do calculo manual atual

### 5. Atualizar funcoes existentes

Em `detect_events_by_keywords_from_text()` e `refine_event_timestamp_from_srt()`:
- Aceitar parametro `boundaries` (dict completo)
- Usar `calculate_game_minute()` para derivar minute/second
- Manter `videoSecond` absoluto (para seek no player)

## Arquivos a modificar

| Arquivo | Alteracao |
|---------|-----------|
| `video-processor/ai_services.py` | Adicionar `_GAME_START_PATTERNS`, `_GAME_END_PATTERNS`, expandir `detect_match_periods_from_transcription()`, criar `calculate_game_minute()`, atualizar `detect_events_by_keywords_from_text()` e `refine_event_timestamp_from_srt()` |
| `video-processor/server.py` | Chamar deteccao de boundaries antes da analise, passar resultado para as funcoes de deteccao de eventos |

## Resultado esperado

Para um video com 10 min de pre-jogo:
- Sistema detecta "rola a bola" no SRT `00:10:12` -> `game_start_second = 612`
- Gol de Coutinho no SRT `00:34:18` (videoSecond = 2058)
- Calculo: `(2058 - 612) / 60 = minuto 24` (correto!)
- Player de video ainda posiciona no segundo 2058 (correto!)

Para segundo tempo:
- Sistema detecta "começa o segundo tempo" no SRT `01:02:00` -> `second_half_start_second = 3720`
- Evento no SRT `01:15:30` (videoSecond = 4530)
- Calculo: `45 + (4530 - 3720) / 60 = minuto 58` (correto!)

Intervalo com acrescimos detectado automaticamente (ex: 1T durou 48 min em vez de 45).
