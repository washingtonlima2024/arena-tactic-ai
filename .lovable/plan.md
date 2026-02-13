

# Corrigir Deleção de Pastas ao Apagar Partida

## Problema

Quando você apaga uma partida, o sistema tenta primeiro o servidor local (`apiClient.deleteMatch`). Se o servidor local estiver offline, cai no fallback Supabase que apaga apenas os registros do banco de dados -- as pastas físicas no servidor local (`storage/{match_id}/`) e os arquivos nos buckets do Supabase Storage (match-videos, generated-audio, thumbnails, event-clips) nunca são removidos.

Mesmo quando o servidor local está online, os arquivos nos buckets do Supabase Storage (se sincronizados para a nuvem) também não são limpos.

## Solução

Modificar `useDeleteMatch.ts` para:

1. **Sempre tentar deletar storage local** -- chamar `apiClient.deleteMatchStorage()` independentemente de qual caminho foi usado para deletar os dados do banco
2. **Deletar arquivos dos buckets Supabase Storage** -- limpar os buckets `match-videos`, `generated-audio`, `thumbnails`, `event-clips` usando o SDK do Supabase
3. **Não falhar se alguma limpeza de storage falhar** -- logs de aviso mas não bloqueia a deleção

## Detalhes Técnicos

### `src/hooks/useDeleteMatch.ts`

Adicionar função `cleanupSupabaseStorage(matchId)` que:
- Lista e remove arquivos nos 4 buckets que usam o matchId no path
- Usa `supabase.storage.from(bucket).list(matchId)` + `remove()`

Modificar `deleteMatchViaSupabase()` para:
- Após deletar registros do banco, chamar `cleanupSupabaseStorage(matchId)`
- Tentar chamar `apiClient.deleteMatchStorage(matchId)` (ignorar erro se servidor offline)

Modificar o `mutationFn` principal para:
- Após sucesso (local ou fallback), garantir que ambos os storages foram limpos
- Se deletou via servidor local (que já limpa pasta local), ainda limpar buckets Supabase
- Se deletou via fallback Supabase, tentar limpar pasta local via `apiClient.deleteMatchStorage()`

### Fluxo Corrigido

```text
Deletar Partida
    |
    +--[1] Tentar servidor local (DELETE /api/matches/{id})
    |      -> Deleta banco SQLite + pasta storage/{id}/ ✅
    |      -> Depois: limpar buckets Supabase Storage ✅ (NOVO)
    |
    +--[2] Fallback Supabase (se servidor offline)
           -> Deleta registros do banco Supabase ✅
           -> Limpar buckets Supabase Storage ✅ (NOVO)
           -> Tentar deletar pasta local via API ✅ (NOVO, ignora erro)
```

### Buckets a limpar

- `match-videos` -- arquivos em path `{matchId}/`
- `generated-audio` -- arquivos em path `{matchId}/`
- `thumbnails` -- arquivos em path `{matchId}/`
- `event-clips` -- arquivos em path `{matchId}/`

## Arquivo a modificar

1. **`src/hooks/useDeleteMatch.ts`** -- Adicionar limpeza de storage (local + Supabase buckets)

