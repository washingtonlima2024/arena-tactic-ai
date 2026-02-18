
# Mostrar Times Cadastrados no Dropdown do Evento

## Problema

A partida atual nao tem times vinculados (`home_team` e `away_team` sao null no banco). Por isso, o dropdown de time no dialogo de edicao de evento mostra apenas "Time Casa" e "Time Visitante" genericos -- os times cadastrados (Sport, Novorizontino) nunca aparecem.

## Solucao

Buscar a lista de times cadastrados (`useTeams`) dentro do `EventEditDialog` e mostra-los como opcoes no dropdown, alem das opcoes de casa/visitante quando disponíveis.

### Arquivo: `src/components/events/EventEditDialog.tsx`

**Mudanca 1 - Importar e usar useTeams:**
- Importar `useTeams` de `@/hooks/useTeams`
- Chamar `const { data: registeredTeams = [] } = useTeams()` dentro do componente

**Mudanca 2 - Refazer o dropdown de times:**
- Se `homeTeam`/`awayTeam` estiverem definidos (nomes reais, nao placeholders), mostrar como opcoes principais com label "(Casa)" / "(Visitante)"
- Abaixo, mostrar todos os times cadastrados que nao sejam o home/away ja listados
- Se nenhum time real estiver vinculado, mostrar diretamente todos os times cadastrados
- Manter fallback "Time Casa" / "Time Visitante" como ultima opcao caso nao haja times cadastrados

O resultado: ao abrir o dropdown, o usuario vera "Sport", "Novorizontino" e qualquer outro time cadastrado, podendo selecionar corretamente.

## Detalhes Tecnicos

```text
Dropdown (antes):
  - Time Casa
  - Time Visitante

Dropdown (depois, com times cadastrados):
  - Sport (se vinculado como Casa)
  - Novorizontino (se vinculado como Visitante)
  -- separador --
  - Sport        (da lista de teams cadastrados)
  - Novorizontino
  -- fallback --
  - Time Casa    (se nenhum time cadastrado)
  - Time Visitante
```

Impacto: apenas no componente `EventEditDialog.tsx`. Sem mudancas no backend.
