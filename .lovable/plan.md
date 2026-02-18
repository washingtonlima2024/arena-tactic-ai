

# Corrigir Vinculacao de Times na Partida

## Problema

O `MatchEditDialog` (dialog de edicao de partida) usa `supabase.from('matches').update(...)` para salvar alteracoes, mas os dados da partida estao no **servidor local** (SQLite). Isso significa que quando voce tenta trocar os times de "Time Casa"/"Time Visitante" para Sport/Novorizontino, a alteracao nunca chega ao servidor local.

Outros componentes (Live, Matches, Events) ja usam `apiClient.updateMatch()` corretamente. Apenas o `MatchEditDialog` usa Supabase diretamente.

## Solucao

Alterar o `MatchEditDialog` para usar `apiClient.updateMatch()` em vez de `supabase.from('matches').update(...)`.

### Arquivo: `src/components/matches/MatchEditDialog.tsx`

**Mudanca na funcao `handleSave`** (linhas 135-199):

- Substituir `supabase.from('matches').update({...}).eq('id', match.id)` por `apiClient.updateMatch(match.id, {...})`
- Remover a atualizacao de eventos via Supabase (pois o servidor local gerencia isso)
- Manter o restante da logica (invalidar queries, fechar dialog)

**Mudanca na funcao `handleSyncFromEvents`**: Manter como esta (ja usa `syncMatchScoreFromEvents` que usa apiClient).

**Mudanca na funcao `handleToggleScoreLock`**: Substituir chamada Supabase por apiClient.

**Mudanca no `eventStats` query**: Substituir `supabase.from('match_events')` por `apiClient.getMatchEvents()`.

**Mudanca no `matchLockStatus` query**: Substituir `supabase.from('matches')` por `apiClient.getMatch()`.

## Detalhes Tecnicos

```text
Antes:
  MatchEditDialog -> supabase.update() -> Supabase (nao tem o match) -> NADA ACONTECE

Depois:
  MatchEditDialog -> apiClient.updateMatch() -> Servidor Local (SQLite) -> TIME ATUALIZADO
```

Isso vai permitir que ao editar a partida e selecionar Sport como "Time Casa" e Novorizontino como "Time Visitante", os times sejam efetivamente vinculados. E consequentemente, o dropdown de times no evento tambem mostrara os nomes corretos.

