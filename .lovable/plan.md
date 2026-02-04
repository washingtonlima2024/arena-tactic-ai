# Plano: Regra de Proximidade para Atribuição de Time - ✅ IMPLEMENTADO

## Status: CONCLUÍDO

---

## Problema Resolvido

Os gols estavam sendo atribuídos ao time errado quando ambos eram mencionados na mesma janela de contexto.

**Exemplo do erro:**
```
"Gol do Brasil! Brasil vence Argentina por 2 a 0!"
→ detect_team_from_text() → 'unknown' (ambos mencionados)
→ fallback → 'home'
→ Se home=Argentina → ERRO ❌
```

---

## Solução Implementada

### Nova Função: `detect_goal_author()`

Localização: `video-processor/ai_services.py` (após linha 175)

**Hierarquia de prioridades:**

| Prioridade | Método | Padrão | Confiança |
|------------|--------|--------|-----------|
| 1 | `pattern` | "gol do/de [TEAM]", "golaço do [TEAM]" | 1.0 |
| 2 | `pattern` | "[TEAM] marca/faz/abre/empata" | 0.95 |
| 3 | `proximity` | Time mais perto de "gol" (≥2 palavras de diferença) | 0.85 |
| 4 | `count` | Time mais mencionado na janela | 0.70 |
| 5 | `fallback` | Unknown (SEM fallback arbitrário) | 0.0 |

### Mudanças no Código

1. **Nova função `detect_goal_author()`**: Analisa proximidade textual
2. **`detect_goals_by_sliding_window()`**: Atualizada para usar `detect_goal_author()`
3. **Confiança combinada**: Considera menções + atribuição de time
4. **Novo campo `team_attribution_method`**: Registra método usado

---

## Resultado

**Antes:**
```
"Gol do Brasil! Brasil vence Argentina"
→ 'unknown' → fallback 'home' → ERRO
```

**Depois:**
```
"Gol do Brasil! Brasil vence Argentina"
→ detect_goal_author() encontra padrão "gol do Brasil"
→ Brasil em home_variants? SIM
→ return {'team': 'home', 'confidence': 1.0, 'method': 'pattern'}
→ CORRETO ✓
```

---

## Logs de Debug

O sistema agora imprime logs detalhados:

```
[GoalAuthor] ✓ Padrão direto: 'gol do brasil' → HOME
[SlidingWindow] ✓ GOL detectado no bloco 367 [24:52] - 7x 'gol' - home (pattern) - conf: 0.95
```

---

## Cores dos Times (Fase 2 - Opcional)

A função aceita parâmetros `home_color` e `away_color` para futura validação visual com Gemini Vision:

```python
def detect_goal_author(
    window_text: str,
    home_team: str,
    away_team: str,
    home_color: str = None,  # Ex: "#FFFF00" (amarelo)
    away_color: str = None   # Ex: "#75AADB" (azul)
) -> Dict[str, Any]:
```

Isso permitirá validar visualmente qual time está comemorando em frames de vídeo.

---

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `video-processor/ai_services.py` | Adicionada função `detect_goal_author()` (~180 linhas) |
| `video-processor/ai_services.py` | `detect_goals_by_sliding_window()` agora usa nova função |

---

## Como Testar

1. Reiniciar o servidor Python: `python server.py`
2. Reanalisar uma partida com transcrição
3. Verificar nos logs: `[GoalAuthor] ✓ Padrão direto...`
4. Confirmar que gols são atribuídos corretamente
