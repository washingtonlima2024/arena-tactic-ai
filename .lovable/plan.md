# Plano: Corrigir Clips com Tempo Zero

## ✅ Status: IMPLEMENTADO

## Problema Identificado

Os clips estavam sendo gerados com `videoSecond: 0` porque a função de fallback usava parsing linha por linha que falhava quando keywords apareciam antes de timestamps.

## Solução Implementada

### 1. Nova função `validate_event_timestamps()`
- Detecta eventos com `minute=0, second=0, videoSecond=0`
- Distribui proporcionalmente se TODOS eventos têm timestamp zero
- Descarta eventos com timestamp zero se outros são válidos

### 2. Renomeada função para `detect_events_by_keywords_from_text()`
- Evita conflito de namespace com a versão SRT
- Usa mapa de timestamps (cria ANTES de procurar keywords)
- Associa cada keyword ao timestamp mais próximo (antes ou depois)
- Fallback para posição proporcional se não houver timestamps

### 3. Melhorias no parser
- Cria mapa `{posição: {minute, second, videoSecond}}` primeiro
- Procura keyword e encontra timestamp mais próximo
- Usa `detect_goal_author()` para atribuição de time precisa
- Adiciona campo `timestampSource` para debug

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Adicionada `validate_event_timestamps()` |
| `video-processor/ai_services.py` | Renomeada para `detect_events_by_keywords_from_text()` |
| `video-processor/ai_services.py` | Melhorado parser com mapa de timestamps |
| `video-processor/ai_services.py` | Atualizadas chamadas de fallback |

## Resultado Esperado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Eventos com timestamp 0 | Clip do início do vídeo | Rejeitados ou distribuídos |
| Fallback sem SRT | Perde timestamps | Usa mapa de proximidade |
| Validação | Nenhuma | Valida antes de criar clips |
| Debug | Sem info | Campo `timestampSource` adicionado |
