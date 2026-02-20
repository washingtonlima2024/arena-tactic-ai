
## Objetivo

Remover todas as dependências do Supabase do código frontend, substituindo cada chamada pelo `apiClient` (servidor Python local) ou pela lógica local já existente. A decisão já foi tomada: o projeto usa 100% servidor local (JWT + SQLite + Python).

---

## Inventário Completo de Dependências

Após análise de todos os arquivos, as dependências estão distribuídas assim:

### Grupo 1 — `supabase.auth.getUser()` (autenticação errada)
Arquivos que ainda usam Supabase Auth em vez de `useAuth()`:
- `src/hooks/useAiPrompts.ts` — linhas 41 e 101

### Grupo 2 — Queries Supabase que buscam dados (já disponíveis via apiClient)
- `src/pages/Analysis.tsx` — realtime channel + queries de `videos` e `generated_audio`
- `src/pages/MatchDashboard.tsx` — query de `videos` para obter URL do vídeo
- `src/pages/Index.tsx` — query de `matches` e `analysis_jobs` para stats do dashboard
- `src/hooks/useMatches.ts` — fallback Supabase para listagem e criação de partidas
- `src/hooks/useDeleteMatch.ts` — fallback Supabase para deleção de partidas

### Grupo 3 — Edge Functions (lógica que deve ir para servidor local)
- `src/pages/MatchCenter.tsx` — `supabase.functions.invoke('generate-event-comments')`
- `src/components/media/VideoPlayerModal.tsx` — `supabase.functions.invoke('generate-event-comments')`
- `src/components/teams/LogoSearchDialog.tsx` — `supabase.functions.invoke('fetch-football-logos')`
- `src/hooks/useArenaChatbot.ts` — `supabase.functions.invoke('arena-chatbot')`
- `src/hooks/useVideoAudioTranscription.ts` — `supabase.functions.invoke('transcribe-audio')`

### Grupo 4 — Outros acessos diretos a tabelas
- `src/hooks/useUserCredits.ts` — lê e atualiza `profiles` no Supabase (créditos)
- `src/components/social/MediaSourceSelector.tsx` — busca `matches`, `match_events`, `playlists` e faz upload para Storage
- `src/hooks/useAiPrompts.ts` — CRUD completo na tabela `ai_prompts`

---

## Estratégia de Substituição por Grupo

### Grupo 1 — Simples: trocar por `useAuth()`
Em `useAiPrompts.ts`, remover `supabase.auth.getUser()` e usar `useAuth()`. O `user.id` do auth local substitui o `user?.id` do Supabase.

### Grupo 2 — Remover fallback Supabase; usar apenas apiClient
- `Analysis.tsx`: remover o canal realtime do Supabase (já tem polling com `setInterval` de 10s que funciona). Substituir queries `videos` e `generated_audio` por `apiClient.getVideos()` e `apiClient.getGeneratedAudio()`.
- `MatchDashboard.tsx`: substituir query de `videos` por `apiClient.getVideos(matchId)`.
- `Index.tsx`: substituir queries de stats por `apiClient.getMatches()` + contagem local.
- `useMatches.ts`: remover bloco fallback Supabase — se servidor local estiver offline, retornar array vazio com mensagem de erro.
- `useDeleteMatch.ts`: remover função `deleteMatchViaSupabase` — se servidor local estiver offline, mostrar erro pedindo para reconectar o servidor.

### Grupo 3 — Edge Functions: redirecionar para apiClient ou remover
As Edge Functions do Supabase são wrappers das mesmas IAs já usadas pelo servidor Python:

- `generate-event-comments`: o `apiClient` já tem endpoints de análise. Substituir por uma chamada ao servidor local `/api/events/{id}/generate-comment` ou simplesmente desabilitar o botão com uma mensagem "Requer servidor local ativo".
- `fetch-football-logos`: já existe `apiClient` para isso ou pode buscar direto da API pública. Substituir por `apiClient.fetchFootballLogos()` ou remover a dependência do Supabase.
- `arena-chatbot`: substituir `supabase.functions.invoke('arena-chatbot')` por `apiClient.chat()` — já existe no servidor Python.
- `transcribe-audio`: substituir por `apiClient.transcribeAudio()` — já existe no servidor Python.

### Grupo 4 — Créditos e Playlists
- `useUserCredits.ts`: créditos ficam no perfil do usuário local. Substituir por `apiClient.getUserCredits()` e `apiClient.updateCredits()` — o servidor Python já gerencia isso via SQLite.
- `MediaSourceSelector.tsx`: substituir busca de `matches`/`match_events` por `apiClient`. Para upload de mídia social, usar `apiClient.uploadMedia()` em vez do Storage do Supabase.
- `useAiPrompts.ts`: os prompts de IA são configurações de admin. Migrar CRUD para `apiClient.getPrompts()`, `apiClient.updatePrompt()` etc. — ou manter no Supabase apenas esse módulo por enquanto (decisão do usuário).

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `src/hooks/useAiPrompts.ts` | Remover `supabase.auth.getUser()`; usar `useAuth()` |
| `src/pages/Analysis.tsx` | Remover canal realtime Supabase; usar apiClient para `videos` e `generated_audio` |
| `src/pages/MatchDashboard.tsx` | Substituir query Supabase de `videos` por `apiClient.getVideos()` |
| `src/pages/Index.tsx` | Substituir queries de stats por `apiClient.getMatches()` + contagem local |
| `src/hooks/useMatches.ts` | Remover fallback Supabase — erro claro se servidor offline |
| `src/hooks/useDeleteMatch.ts` | Remover `deleteMatchViaSupabase` — erro claro se servidor offline |
| `src/hooks/useArenaChatbot.ts` | Substituir `supabase.functions.invoke('arena-chatbot')` por `apiClient` |
| `src/hooks/useVideoAudioTranscription.ts` | Substituir `supabase.functions.invoke('transcribe-audio')` por `apiClient` |
| `src/hooks/useUserCredits.ts` | Substituir queries `profiles` por `apiClient` para créditos locais |
| `src/components/media/VideoPlayerModal.tsx` | Substituir `supabase.functions.invoke('generate-event-comments')` por `apiClient` ou botão desabilitado |
| `src/components/teams/LogoSearchDialog.tsx` | Substituir `supabase.functions.invoke('fetch-football-logos')` por `apiClient` |
| `src/components/social/MediaSourceSelector.tsx` | Substituir queries Supabase por `apiClient`; upload de mídia via servidor local |

---

## O que NÃO muda
- `src/integrations/supabase/client.ts` — arquivo auto-gerado, nunca editado
- `src/integrations/supabase/types.ts` — arquivo auto-gerado, nunca editado
- Dados existentes no banco continuam intactos

---

## Pergunta antes de implementar

Para `useAiPrompts.ts` e `src/components/social/MediaSourceSelector.tsx`, os dados de prompts de IA e playlists sociais ainda existem no banco Supabase. Duas opções:

**Opção A** — Migrar tudo para o servidor Python local (SQLite), removendo dependência total.
**Opção B** — Manter `ai_prompts` e `playlists` no banco Supabase temporariamente, removendo apenas as dependências de `auth` do Supabase.

Qual opção prefere?
