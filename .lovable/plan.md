
# Centralizar Eventos na Pagina Events

## Problema

Os cards de eventos (EventRow) estao ficando desalinhados e saindo da area visivel. O layout atual usa `overflow-hidden` no container pai mas nao garante que o conteudo respeite os limites da tela, especialmente em telas menores.

## Causa

1. O EventRow (linha 114) usa `flex items-center gap-2 sm:gap-3` mas nao tem `min-w-0` no container flex, o que permite que itens internos expandam alem do container
2. O container principal `div.space-y-6` (linha 1007) nao tem restricao de largura maxima (`max-w-full`)
3. O Scoreboard Card (linha 1038) usa `absolute inset-0` para o gradiente de fundo, que pode causar overflow

## Solucao

### Arquivo: `src/pages/Events.tsx`

**Mudanca 1 - Adicionar `max-w-full` e `overflow-hidden` no container principal:**
- Linha 1007: Alterar `<div className="space-y-6">` para `<div className="space-y-6 max-w-full overflow-hidden">`

**Mudanca 2 - Adicionar `min-w-0` no EventRow para evitar overflow de flex items:**
- Linha 114: Alterar o className do container do EventRow para incluir `min-w-0 w-full`
- Garantir que o container flex nao expanda alem do pai

**Mudanca 3 - Limitar largura dos textos truncados:**
- Verificar que `truncate` e `min-w-0` estao aplicados nos textos de descricao (linha 161-169)

### Arquivo: `src/components/layout/AppLayout.tsx`

Nenhuma mudanca necessaria - o AppLayout ja tem `overflow-x-hidden` e `max-w-[100vw]`.

## Detalhes Tecnicos

| Arquivo | Linha | Mudanca |
|---|---|---|
| `src/pages/Events.tsx` | 1007 | Adicionar `max-w-full overflow-hidden` no container |
| `src/pages/Events.tsx` | 114 | Adicionar `min-w-0 w-full` no EventRow |

Essas mudancas garantem que os flex items respeitem o container pai e nao extrapolem a area visivel, mantendo os eventos centralizados e dentro da tela.
