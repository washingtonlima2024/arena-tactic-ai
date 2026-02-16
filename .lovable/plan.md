

# Corrigir: Fallback por Keywords Nao Funciona com Texto do Whisper

## Problema Real (diagnosticado no codigo)

O pipeline gera poucos eventos (5-6) porque existem **2 bugs** que neutralizam o fallback por keywords:

### Bug 1: `detect_events_by_keywords_from_text` ignora keywords sem timestamps inline

Na funcao `detect_events_by_keywords_from_text` (linha 5448), a condicao `if closest_ts:` exige que o texto tenha timestamps no formato `HH:MM:SS` ou `MM:SS`. Mas a transcricao do Whisper eh texto puro sem timestamps inline. Resultado: `timestamp_map` fica vazio e **zero eventos** sao criados pelo fallback de texto.

```text
Whisper gera: "O jogador chutou e gol do Flamengo!"
timestamp_map = {}  (vazio - sem HH:MM:SS no texto)
if closest_ts:  -->  SEMPRE False  -->  nenhum evento criado
```

### Bug 2: Fallback do Kakttus prefere texto bruto quando nao tem match_id ou SRT

No bloco de fallback (linha 6219-6292), quando o SRT nao eh encontrado, cai na funcao `detect_events_by_keywords_from_text` que, como explicado no Bug 1, nao funciona com texto puro.

Enquanto isso, o SRT sintetico gerado na Phase 3.5 do pipeline async **existe no disco** mas o fallback no `ai_services.py` pode nao encontra-lo por divergencia nos nomes de arquivo.

## Solucao

### Arquivo: `video-processor/ai_services.py`

**Corrigir `detect_events_by_keywords_from_text` para funcionar SEM timestamps inline.**

Quando `timestamp_map` esta vazio, estimar o timestamp pela posicao proporcional da keyword no texto:

```text
posicao_keyword = keyword_pos / len(transcription)
video_second_estimado = posicao_keyword * video_duration
game_minute = game_start_minute + (video_second_estimado / 60)
```

Mudancas especificas:

1. **Linha ~5347**: Apos criar o `timestamp_map`, se estiver vazio, calcular `video_duration` a partir do parametro ou estimar 2700s (45 min)

2. **Linha ~5448**: Mudar a logica do `if closest_ts:` para incluir fallback proporcional:

```python
if closest_ts:
    # Usar timestamp mais proximo (logica atual)
    minute = closest_ts['minute']
    second = closest_ts['second']
    video_second = closest_ts['videoSecond']
else:
    # FALLBACK: Estimar pela posicao no texto
    text_len = len(transcription)
    if text_len > 0:
        position_ratio = keyword_pos / text_len
        est_duration = video_duration or 2700  # 45 min default
        video_second = int(position_ratio * est_duration)
        game_second = max(0, video_second - video_game_start_second)
        minute = game_start_minute + (game_second // 60)
        second = game_second % 60
    else:
        continue  # Sem texto, pular
```

3. **Manter o resto da logica identica** (detect_goal_author, validate_card_event, etc.), apenas usando as variaveis `minute`, `second`, `video_second` calculadas acima em vez de `closest_ts['minute']` etc.

### Resultado Esperado

- Com texto de ~50k chars (Whisper completo de 47 min):
  - Cada keyword encontrada recebe um timestamp estimado pela posicao no texto
  - A estimativa eh proporcional: keyword no meio do texto -> ~22 min de jogo
  - Nao eh preciso, mas garante que eventos sejam detectados com timestamps aproximados
  - A deduplicacao por janela de 2 minutos evita duplicatas

- O fallback passa a gerar 15-40 eventos em vez de 0

## Detalhes Tecnicos

### ai_services.py - Linhas 5430-5500

Reestruturar o loop de deteccao para:

1. Calcular `minute`, `second`, `video_second` ANTES do bloco de criacao do evento
2. Usar `closest_ts` quando disponivel, senao usar estimativa proporcional
3. Adicionar `timestampSource: 'proportional_estimate'` no metadata quando usar estimativa
4. Adicionar log: `[Keywords-Text] Sem timestamps inline, usando estimativa proporcional`

### Parametro video_duration

Garantir que o pipeline async passe `video_duration` ao chamar o fallback. Verificar nas chamadas do bloco Kakttus (linhas 6263-6291) se `video_duration` esta sendo passado -- atualmente nao esta em todas as chamadas.

## Arquivo a Modificar

1. **`video-processor/ai_services.py`** -- Adicionar estimativa proporcional de timestamps quando `timestamp_map` esta vazio no `detect_events_by_keywords_from_text`

