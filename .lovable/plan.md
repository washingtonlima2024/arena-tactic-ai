# ✅ IMPLEMENTADO: Detecção de Gols por Janela Deslizante

## Status: Concluído

A detecção de gols agora usa algoritmo de **janela deslizante** com espaçamento mínimo de **5 blocos SRT**.

---

## Implementação

### Novas Funções em `video-processor/ai_services.py`

1. **`detect_goals_by_sliding_window()`** - Detecta gols analisando repetição de "gol" em janelas de 5 linhas
2. **`extract_player_from_window()`** - Extrai nome do jogador do texto da janela

### Lógica Principal

```python
# Para cada bloco SRT:
# 1. Criar janela: 2 antes + atual + 2 depois (5 linhas)
# 2. Contar "gol" na janela (excluindo "goleiro")
# 3. Se contagem >= 3 E passou 5+ blocos do último gol do time:
#    → É gol real! Usar timestamp da linha central
```

### Parâmetros

| Parâmetro | Valor | Descrição |
|-----------|-------|-----------|
| `window_size` | 5 | Tamanho da janela em linhas SRT |
| `min_goal_mentions` | 3 | Mínimo de menções de "gol" para confirmar |
| `min_block_gap` | 5 | Espaçamento mínimo entre gols do mesmo time |

### Padrão Regex

```python
goal_pattern = r'\bgol\b(?!eiro)'  # "gol" mas NÃO "goleiro"
```

---

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| 25 gols falsos | 2 gols reais |
| Brasil 25 x 0 Argentina | Brasil 2 x 0 Argentina |

---

## Como Testar

1. Deletar eventos da partida atual
2. Re-processar transcrição
3. Verificar logs para:
   - `[SlidingWindow] ✓ GOL detectado` - gols confirmados
   - `[SlidingWindow] ⏳ Bloco X: Gol ignorado` - duplicatas filtradas
4. Confirmar placar final correto
