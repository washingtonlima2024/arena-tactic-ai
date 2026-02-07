
# Corrigir Eventos Sem Classificacao

## Problema Identificado

Analisando os dados e o codigo, encontrei **3 causas** para eventos saindo sem classificacao adequada:

### Causa 1: A IA usa "chance" como tipo generico

O prompt da IA (ai_services.py, linha 3792) diz:
```
event_type: goal, shot, save, foul, corner, chance, penalty, etc.
```

A IA esta usando "chance" como tipo generico para qualquer lance que nao seja claramente um gol, falta ou defesa. No banco de dados, existem **11 eventos do tipo "chance"**, todos com descricoes que deveriam ter tipos mais especificos:

| Descricao | Tipo Atual | Tipo Correto |
|-----------|------------|--------------|
| "Neymar chuta na trave!" | chance | shot (woodwork) |
| "Paulinho perde chance inacreditavel!" | chance | shot |
| "Neymar arranca e cruza, sem sucesso" | chance | cross |
| "Neymar acerta trave!" | chance | shot (woodwork) |

### Causa 2: yellow_card e red_card convertidos para "foul"

A funcao `_enrich_events()` (ai_services.py, linha 4877) **converte todos os cartoes amarelos e vermelhos para falta**:

```python
if event_type == 'yellow_card':
    event_type = 'foul'  # Destroi a classificacao!
    event['description'] = f"Falta (mencao a cartao): ..."
```

E o prompt diz "NAO detecte yellow_card ou red_card" -- ou seja, a IA nem tenta classificar cartoes. O resultado e que cartoes aparecem como "Falta" generica.

### Causa 3: "chance" nao aparece em nenhum filtro da UI

Na pagina de Eventos, os filtros sao: gols, shots, fouls, tactical. Eventos do tipo "chance" nao encaixam em nenhum filtro, ficando visiveis apenas no modo "Todos".

## Solucao

### 1. Melhorar o prompt da IA para classificacao precisa

**Arquivo: `video-processor/ai_services.py`** (prompt principal ~linha 3792)

Substituir:
```
event_type: goal, shot, save, foul, corner, chance, penalty, etc. (NAO detecte yellow_card ou red_card)
```

Por:
```
event_type: TIPOS OBRIGATORIOS:
- goal: gol marcado
- shot: finalizacao (inclui chutes na trave, chutes para fora)
- shot_on_target: finalizacao no gol
- save: defesa do goleiro
- foul: falta cometida
- yellow_card: cartao amarelo mostrado
- red_card: cartao vermelho
- corner: escanteio
- penalty: penalti
- free_kick: cobranca de falta
- cross: cruzamento
- offside: impedimento
NAO use "chance" - classifique como "shot" se for finalizacao
```

### 2. Remover conversao yellow_card/red_card para foul

**Arquivo: `video-processor/ai_services.py`** (~linhas 4869-4881)

Remover completamente os blocos de conversao:
- `if event_type == 'red_card': event_type = 'foul'` (linha 4870)
- `if event_type == 'yellow_card': event_type = 'foul'` (linha 4877)

Isso permite que cartoes amarelos e vermelhos mantenham sua classificacao correta.

### 3. Adicionar reclassificacao automatica de "chance"

**Arquivo: `video-processor/ai_services.py`** (na funcao `_enrich_events`, apos linha 4867)

Adicionar logica para reclassificar "chance" baseado em palavras-chave na descricao:

```text
Se event_type == 'chance':
  Se descricao contem 'trave', 'poste', 'travessao' -> shot
  Se descricao contem 'chut', 'finali', 'bomba', 'bateu' -> shot
  Se descricao contem 'cruz', 'cruzamento' -> cross
  Se descricao contem 'cabece' -> shot
  Senao -> shot (fallback, pois "chance" quase sempre e uma finalizacao)
```

### 4. Atualizar tambem o prompt legado (Gemini)

**Arquivo: `video-processor/ai_services.py`** (~linha 5470)

O prompt do modo legado (Gemini) tambem precisa da mesma atualizacao de tipos para manter consistencia entre os dois modos de analise.

### 5. Adicionar filtro "Chances/Finalizacoes" na UI

**Arquivo: `src/pages/Events.tsx`** (~linha 546)

Atualizar o filtro "shots" para incluir tambem "chance" (para compatibilidade com eventos antigos):
```
typeFilter === 'shots' -> event_type.includes('shot') || event_type === 'chance'
```

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `video-processor/ai_services.py` | 1. Atualizar prompt com tipos especificos (remover "chance", incluir yellow/red_card) |
| `video-processor/ai_services.py` | 2. Remover conversao yellow_card/red_card para foul |
| `video-processor/ai_services.py` | 3. Reclassificar "chance" para tipos especificos baseado em descricao |
| `video-processor/ai_services.py` | 4. Atualizar prompt legado (Gemini) com mesmos tipos |
| `src/pages/Events.tsx` | 5. Incluir "chance" no filtro de shots para compatibilidade |

## Resultado Esperado

- Cartoes amarelos e vermelhos aparecem com classificacao correta ("Cartao Amarelo" / "Cartao Vermelho")
- Chutes na trave classificados como "Finalizacao" em vez de "Chance"
- Cruzamentos classificados como "Cruzamento" em vez de "Chance"
- Eventos antigos do tipo "chance" aparecem no filtro de finalizacoes
- Novos eventos gerados pela IA terao sempre tipos especificos e claros
