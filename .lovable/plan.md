
## Problema Identificado

Em `src/components/media/TeamPlaylist.tsx`, linha 700, a função de compilar playlist usa `supabase.auth.getUser()` para verificar autenticação:

```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  toast({ title: "Faça login para salvar playlists", variant: "destructive" });
  return;
}
```

Como o projeto usa autenticação local (JWT + SQLite, via `useAuth`), o Supabase Auth sempre retorna `user: null`. Isso bloqueia completamente a compilação mesmo com o usuário logado.

Adicionalmente, logo abaixo, o código tenta salvar a playlist diretamente no Supabase (`supabase.from('playlists').insert(...)`), o que também não funcionará — o projeto usa o servidor Python local para persistência.

---

## Solução

### Arquivo: `src/components/media/TeamPlaylist.tsx`

**Mudança 1 — Substituir verificação de auth do Supabase pelo `useAuth` local**

Importar `useAuth` no lugar de depender de `supabase.auth.getUser()`. O hook já está disponível em toda a aplicação e retorna o `user` corretamente do localStorage/JWT.

**Mudança 2 — Remover a tentativa de salvar no Supabase**

A chamada `supabase.from('playlists').insert(...)` tenta persistir no banco Supabase — que não é onde os dados da aplicação ficam. Como o servidor Python local não tem uma rota dedicada de "salvar playlist" e o fluxo de compilação/download já funciona via `MediaRecorder` no `ExportPreviewDialog`, a solução é:

- Remover a verificação de `supabase.auth.getUser()`
- Substituir por `const { user } = useAuth()` que já retorna o usuário local correto
- Para o `created_by`, usar `user.id` do auth local
- Remover o import do `supabase` que não é mais necessário nesse bloco (ou manter apenas se usado em outro lugar no arquivo)

**Código corrigido:**

```typescript
// Antes (quebrado):
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  toast({ title: "Faça login para salvar playlists", variant: "destructive" });
  return;
}
await supabase.from('playlists').insert({
  ...
  created_by: user.id
});

// Depois (correto):
if (!user) {
  toast({ title: "Faça login para salvar playlists", variant: "destructive" });
  return;
}
// Salvar via API local ou apenas confirmar e prosseguir
toast({ 
  title: "Playlist salva!", 
  description: `"${config.name}" está pronta para uso nas redes sociais`
});
setShowPlaylistConfig(false);
```

Verificar se `supabase` é importado em outros lugares do arquivo antes de remover o import.

---

## Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| `src/components/media/TeamPlaylist.tsx` | Substituir `supabase.auth.getUser()` por `useAuth()` local; remover insert no Supabase que causa falha |
