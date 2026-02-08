

# Correcao: Aumentar Deteccao de Eventos no Pipeline Kakttus

## Problema

Um primeiro tempo gera apenas 6 eventos quando o esperado seria ~15. A investigacao revelou 3 causas raiz:

### Causa 1: Prompt do Kakttus muito vago
O prompt atual diz apenas:
```
"event_type": "goal" ou outro
```

O modelo nao sabe quais tipos buscar. Compare com o `EVENT_KEYWORDS` completo que lista: goal, foul, corner, penalty, save, chance, shot, cross, offside, free_kick, substitution.

### Causa 2: Threshold do fallback muito baixo
O fallback so aciona quando `len(final_events) < 3`. Com 6 eventos, o fallback nunca e chamado. Para um tempo de jogo, o esperado e 12-18 eventos.

### Causa 3: `detect_events_by_keywords_from_text` muito limitado
Essa funcao (usada como fallback quando nao ha SRT) so busca 3 tipos de eventos:
- goal
- penalty
- save

Enquanto a versao SRT (`detect_events_by_keywords`) busca: goal, foul, corner, penalty, save, chance. O fallback por texto cru esta muito restrito.

## Solucao

### Arquivo: `video-processor/ai_services.py`

**Mudanca 1** - Prompt do Kakttus (linhas 580-607): Listar explicitamente os tipos de eventos

De:
```python
"event_type": "goal" ou outro,
```
Para:
```python
"event_type": "goal", "shot", "save", "corner", "foul", "penalty", "yellow_card", "red_card", "chance", "offside", "free_kick" ou "substitution",
```

E adicionar instrucao explicita no prompt:
```
EXTRAIA TODOS os eventos relevantes: gols, finalizacoes, defesas, escanteios, faltas, penaltis, cartoes amarelos, cartoes vermelhos, impedimentos, cobranças de falta, substituicoes e chances claras de gol.
Um primeiro tempo tipico tem entre 10 e 20 eventos.
```

**Mudanca 2** - Threshold do fallback (linha 5282): Aumentar de 3 para 10

De:
```python
if len(final_events) < 3:
```
Para:
```python
if len(final_events) < 10:
```

**Mudanca 3** - Patterns do `detect_events_by_keywords_from_text` (linhas 4401-4407): Adicionar mais tipos

De:
```python
patterns = {
    'goal': [r'go+l', r'golaço', r'bola na rede', r'abre o placar', r'empata'],
    'penalty': [r'pênalti', r'penalidade'],
    'save': [r'grande defesa', r'salvou', r'espalmou'],
}
```
Para:
```python
patterns = {
    'goal': [r'go+l', r'golaço', r'bola na rede', r'abre o placar', r'empata'],
    'penalty': [r'pênalti', r'penalidade'],
    'save': [r'grande defesa', r'salvou', r'espalmou'],
    'foul': [r'falta de', r'falta para', r'cometeu falta', r'falta perigosa'],
    'corner': [r'escanteio', r'córner', r'bate o escanteio'],
    'chance': [r'quase gol', r'por pouco', r'na trave', r'passou perto', r'que chance', r'perdeu o gol'],
    'shot': [r'chutou', r'finalizou', r'bateu forte', r'chute', r'finalização'],
    'offside': [r'impedimento', r'fora de jogo', r'posição irregular'],
    'free_kick': [r'falta cobrada', r'cobrança de falta', r'bate a falta'],
}
```

**Mudanca 4** - Threshold do fallback no Ollama tambem (linha 4751): Manter consistencia

De:
```python
if len(events) < 3:
```
Para:
```python
if len(events) < 10:
```

## Estrutura Final

```text
analyze_with_kakttus()
    |
    +-- Prompt com tipos explícitos (12 tipos listados)
    |
    +-- Kakttus retorna eventos (ex: 6)
    |
    +-- if events: enriquecer + deduplicar
    |   else: final_events = []
    |
    +-- if len(final_events) < 10:    <-- THRESHOLD AUMENTADO
    |       Buscar SRT ou texto bruto
    |       detect_events_by_keywords() ou _from_text()  <-- COM MAIS TIPOS
    |       Merge com deduplicacao (2 min)
    |
    +-- return final_events  (esperado: 12-18 eventos)
```

## Resumo das Alteracoes

| Linha | Arquivo | Mudanca |
|---|---|---|
| 580-607 | ai_services.py | Prompt com tipos de eventos explicitos |
| 4401-4407 | ai_services.py | Adicionar foul, corner, chance, shot, offside, free_kick ao fallback por texto |
| 4751 | ai_services.py | Threshold Ollama: 3 -> 10 |
| 5282 | ai_services.py | Threshold Kakttus: 3 -> 10 |

**Nota**: Todas as mudancas sao no `video-processor/ai_services.py` (servidor local). Apos aplicar, reiniciar com `pm2 restart arena-backend`.
