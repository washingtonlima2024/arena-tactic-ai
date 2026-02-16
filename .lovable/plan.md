
# Corrigir Deteccao de Gols: Eliminar Falsos Positivos e Nao Perder Gols Reais

## Diagnostico

O problema tem 3 causas raiz:

### 1. Keyword `go+l` nao filtra contexto negativo

O padrao regex `go+l` no fallback por keywords casa com QUALQUER mencao de "gol", incluindo:
- "quase gol" (nao foi gol)
- "perdeu o gol" (nao foi gol)
- "gol anulado" (nao foi gol)

Resultado: gera falsos positivos que sao classificados como gol real.

### 2. Validacao `_validate_goals_with_context` NAO eh aplicada no fallback

A funcao que remove gols falsos (verificando "quase", "perdeu", "na trave", etc.) so eh chamada apos a analise do Ollama (linha 5803), mas NUNCA nos eventos do fallback por keywords (linhas 6319-6331). Os gols falsos do fallback entram direto no `final_events` sem validacao.

### 3. Deduplicacao por janela de 2 minutos pode remover gol real

Com timestamps proporcionais (imprecisos), um gol falso pode ter timestamp proximo ao gol real do Felipe Coutinho. A deduplicacao em `already_exists` (linha 6322-6326) verifica `abs(minute) < 2 AND same type`, podendo manter o falso e descartar o real (ou vice-versa).

## Solucao (3 mudancas no mesmo arquivo)

### Arquivo: `video-processor/ai_services.py`

**Mudanca 1: Adicionar filtro de negacao DENTRO de `detect_events_by_keywords_from_text` para gols**

No loop principal (linha 5440), quando `event_type == 'goal'`, verificar se o contexto proximo da keyword contem palavras de negacao ANTES de criar o evento. Isso previne a criacao de gols falsos na origem.

```python
# Dentro do loop, apos encontrar a keyword (linha 5441):
if event_type == 'goal':
    # Verificar contexto de negacao (50 chars antes, 30 depois)
    ctx_start = max(0, keyword_pos - 50)
    ctx_end = min(len(transcription), keyword_pos + 30)
    local_ctx = transcription[ctx_start:ctx_end].lower()
    
    negation_words = ['quase', 'por pouco', 'perdeu', 'na trave', 'travessao',
                      'pra fora', 'defendeu', 'espalmou', 'salvou', 'nao foi',
                      'anulado', 'impedido', 'passou perto', 'raspou', 'tirou']
    if any(neg in local_ctx for neg in negation_words):
        continue  # Pular - nao eh gol real
```

**Mudanca 2: Aplicar `_validate_goals_with_context` nos eventos do fallback**

No bloco de fallback (linha 6244-6331), APOS gerar `keyword_events`, validar os gols antes do merge:

```python
# Apos linha 6296 (e tambem apos linhas 6284, 6306, 6317):
keyword_events = _validate_goals_with_context(keyword_events, transcription)
```

Isso garante que qualquer gol falso que passe pelo filtro inline seja removido pela validacao contextual mais robusta.

**Mudanca 3: Na deduplicacao do merge, priorizar eventos com maior confianca**

Na logica de merge (linhas 6319-6331), quando um evento do keyword tiver o mesmo tipo e minuto proximo de um evento existente, manter o que tiver maior `confidence`. Atualmente, o primeiro encontrado vence (o do Ollama), mas se o Ollama nao detectou o gol do Felipe Coutinho, o keyword pode adiciona-lo sem conflito.

A deduplicacao atual ja funciona bem para isso -- o problema real eh que gols falsos estao entrando. As mudancas 1 e 2 resolvem isso.

## Resultado Esperado

- Gols falsos ("quase gol", "perdeu o gol") sao bloqueados na origem (mudanca 1) e validados novamente (mudanca 2)
- Gols reais (como o de Felipe Coutinho) continuam sendo detectados normalmente
- O sistema nunca mais classifica como gol algo que nao foi gol
- Se o gol do Felipe Coutinho aparece na transcricao com "gol" ou "marca" proximo, sera detectado com timestamp proporcional

## Detalhes Tecnicos

### Linha 5440-5475 (filtro inline de negacao para gols)

Adicionar verificacao de contexto local (50 chars antes, 30 depois) para cada match de keyword de gol. Se contem palavras de negacao, pular com `continue`.

### Linhas 6284, 6296, 6306, 6317 (validacao pos-keyword)

Adicionar chamada `keyword_events = _validate_goals_with_context(keyword_events, transcription)` apos cada chamada de `detect_events_by_keywords_from_text` ou `detect_events_by_keywords` no bloco de fallback.

### Impacto

- Apenas gols sao afetados (outros eventos passam normalmente)
- A validacao eh rapida (regex em string, sem chamada de IA)
- Compativel com timestamps proporcionais e de SRT

## Arquivo a Modificar

1. **`video-processor/ai_services.py`** -- 3 pontos de mudanca conforme descrito acima
