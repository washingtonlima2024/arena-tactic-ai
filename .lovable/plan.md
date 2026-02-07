
# Por que Alguns Eventos Criam Clip com Capa e Outros Nao

## Diagnostico - Causa Raiz Encontrada

Analisei os dados da partida `dc5f6ba1` e encontrei a causa exata. Dos **8 eventos** detectados pela IA, apenas **2 receberam clip e thumbnail**. O problema esta no **filtro de eventos duplicados** dentro da funcao `extract_event_clips_auto()`.

### O Filtro de Duplicatas (min_gap_seconds=30)

A funcao `filter_duplicate_events()` (linha 4755 do server.py) remove eventos que estejam a **menos de 30 segundos** de distancia um do outro, mantendo apenas o mais importante. Isso foi feito para evitar clips repetidos/sobrepostos.

### O Que Acontece com os 8 Eventos da Partida

Todos os 8 eventos estao concentrados nos primeiros ~100 segundos do video:

```text
Evento 1: goal (BRA)     videoSecond=10   -> MANTIDO (primeiro)
Evento 2: goal (PAR)     videoSecond=10   -> REMOVIDO (0s do anterior, mesma prioridade)
Evento 3: unknown        videoSecond=15   -> REMOVIDO (5s do evento 1, < 30s)
Evento 4: unknown        videoSecond=35   -> REMOVIDO (25s do evento 1, < 30s)
Evento 5: foul           videoSecond=78   -> MANTIDO (68s do evento 1, > 30s)
Evento 6: free_kick      videoSecond=83   -> REMOVIDO (5s do evento 5, < 30s)
Evento 7: shot           videoSecond=87   -> REMOVIDO ou SUBSTITUI foul (9s do evento 5)
Evento 8: unknown        videoSecond=97   -> REMOVIDO (< 30s do anterior)
```

**Resultado: de 8 eventos, apenas 2 passam pelo filtro e recebem clip + thumbnail.**

### Por Que Este Filtro Existe

O filtro foi criado para evitar clips sobrepostos: como cada clip tem 30 segundos (15s antes + 15s depois), dois eventos a menos de 30s de distancia gerariam clips quase identicos. Mas o filtro e agressivo demais para partidas com muitos eventos proximos.

## Solucao Proposta

Reduzir o gap minimo de 30s para **10s** e, mais importante, **nunca filtrar eventos de alta prioridade** (gols, penaltis, cartoes vermelhos). Alem disso, os eventos filtrados pelo clip devem ter o `clip_pending` atualizado para `false` (sem clip) em vez de ficarem eternamente como `pending`.

### Mudanca 1: `video-processor/server.py` - Reduzir Gap e Proteger Eventos Importantes

Na funcao `filter_duplicate_events()` (linha 4755):

1. Reduzir `min_gap_seconds` de 30 para **10** na chamada (linha 4790)
2. Adicionar regra: **nunca remover** eventos dos tipos `goal`, `penalty`, `red_card` (sempre geram clip)
3. Se dois eventos importantes estao no mesmo segundo, manter ambos (com filenames diferentes)

### Mudanca 2: `video-processor/server.py` - Atualizar Eventos Sem Clip

Apos o loop de geracao de clips em `extract_event_clips_auto()`, os eventos que foram filtrados ou falharam devem ter `clip_pending = False` e `clip_url = null` atualizados no banco, em vez de ficarem como `clip_pending = true` para sempre. Isso evita que o frontend fique em loop de polling esperando clips que nunca serao gerados.

### Mudanca 3: `video-processor/server.py` - Gerar Clips com Nomes Unicos

Quando dois eventos do mesmo tipo estao no mesmo minuto (ex: dois gols no minuto 0), o segundo sobrescreve o arquivo do primeiro porque o filename e identico (`00min-goal.mp4`). Adicionar o event_id truncado ao nome do arquivo para garantir unicidade.

## Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `video-processor/server.py` | 1. Reduzir gap de 30s para 10s no filtro de duplicatas |
| `video-processor/server.py` | 2. Proteger eventos importantes (goal/penalty/red_card) do filtro |
| `video-processor/server.py` | 3. Atualizar `clip_pending=false` para eventos que nao recebem clip |
| `video-processor/server.py` | 4. Nomes de arquivo unicos com event_id para evitar sobrescrita |

## Resultado Esperado

- Todos os gols, penaltis e cartoes vermelhos **sempre** terao clip + thumbnail
- Eventos proximos (< 10s) ainda serao filtrados para evitar clips identicos
- Eventos que nao recebem clip terao `clip_pending=false` (sem polling infinito)
- Nomes de arquivo unicos evitam que um clip sobrescreva outro
