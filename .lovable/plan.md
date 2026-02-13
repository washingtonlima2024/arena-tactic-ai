
# Corrigir Galeria de Clips - Carregar Capas do Servidor Local

## Problema Identificado

O MatchCenter busca thumbnails do banco Supabase (`supabase.from('thumbnails')`), mas as capas estao armazenadas no **servidor local** e devem ser buscadas via `apiClient.getThumbnails()` -- que e exatamente como a pagina de Eventos faz e funciona corretamente.

O servidor local ja possui 18 imagens de thumbnails prontas para esta partida.

## Solucao

Alterar **uma unica linha** em `src/pages/MatchCenter.tsx`: trocar a query de thumbnails de Supabase para `apiClient.getThumbnails()`.

## Arquivo a editar

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/MatchCenter.tsx` | Linhas 62-69: trocar `supabase.from('thumbnails')` por `apiClient.getThumbnails(currentMatchId)` |

## Detalhe tecnico

Codigo atual (errado):
```typescript
const { data: thumbnails = [] } = useQuery({
  queryKey: ['thumbnails', currentMatchId],
  queryFn: async () => {
    if (!currentMatchId) return [];
    const { data } = await supabase.from('thumbnails').select('*').eq('match_id', currentMatchId);
    return data || [];
  },
  enabled: !!currentMatchId,
});
```

Codigo corrigido:
```typescript
const { data: thumbnails = [] } = useQuery({
  queryKey: ['thumbnails', currentMatchId],
  queryFn: async () => {
    if (!currentMatchId) return [];
    return await apiClient.getThumbnails(currentMatchId) || [];
  },
  enabled: !!currentMatchId,
});
```

Com essa correcao, as capas ja existentes no servidor (com vinheta, badge de tipo de evento e minuto) serao carregadas e exibidas na galeria de clips e nos highlights.
