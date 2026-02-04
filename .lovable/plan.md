
# Plano: Correção das Funções de Detecção de Eventos

## ✅ Status: IMPLEMENTADO

---

## Problemas Identificados e Corrigidos

### ✅ Correção 1: Função `detect_events_by_keywords_from_text` criada

A função foi implementada com:
- Mapeamento de todos os timestamps antes de procurar keywords
- Suporte a formatos HH:MM:SS e MM:SS
- Associação de keywords ao timestamp mais próximo (proximidade bidirecional)
- Uso de `detect_goal_author` para atribuição precisa de times em gols
- Chamada a `validate_event_timestamps` para filtrar zeros inválidos
- Metadado `timestampSource: 'proximity_map'` para debug

### ✅ Correção 2: Função duplicada removida

A segunda definição de `detect_events_by_keywords` (linhas 3666-3868) foi substituída pela nova função `detect_events_by_keywords_from_text`.

### ✅ Correção 3: `validate_event_timestamps` integrada

A função de validação agora é chamada dentro de `detect_events_by_keywords_from_text`.

---

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Função duplicada substituída por `detect_events_by_keywords_from_text()` |

---

## Resultado

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Fallback de keywords | ❌ `NameError` | ✅ Funciona com mapa de proximidade |
| Funções duplicadas | ⚠️ 2 definições | ✅ Cada função com nome único |
| Validação de timestamps | ❌ Não chamada no fallback | ✅ Integrada na função |
| Clips com tempo zero | ❌ Gerados errados | ✅ Rejeitados ou distribuídos |

---

## Detalhes da Implementação

A função `detect_events_by_keywords_from_text`:

1. **Mapeia todos os timestamps** encontrados no texto (HH:MM:SS ou MM:SS)
2. **Associa cada keyword** ao timestamp mais próximo (antes OU depois)
3. **Usa `detect_goal_author`** para atribuição precisa de times em gols
4. **Aplica `ensure_clip_window`** para definir janela de corte (20s antes, 10s depois)
5. **Valida timestamps** para rejeitar zeros inválidos
6. **Deduplica eventos** com threshold de 30 segundos
