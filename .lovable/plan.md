
# Plano: Implementar Publicação Automática no Instagram

## Situação Atual

### ✅ O que está funcionando:
| Item | Status | Detalhes |
|------|--------|----------|
| Conexão Instagram | ✅ Configurada | Token: `EAAJznF7ef1gBQ...`, Account ID: `690065397153624` |
| Tabela `social_connections` | ✅ Dados salvos | `@wahington.lima` conectado |
| Tabela `social_scheduled_posts` | ✅ Posts agendados | 3 posts pendentes para Instagram |
| Interface de agendamento | ✅ Funcional | ScheduledPostsManager operacional |

### ❌ O que está faltando:
| Item | Status | Problema |
|------|--------|----------|
| Edge Function `social-publish` | ❌ Não existe | Diretório não criado, apenas configurado no config.toml |
| Edge Function `process-scheduled-posts` | ❌ Não existe | Para processar posts agendados automaticamente |
| Publicação de vídeos no Instagram | ❌ Não implementado | Requer upload em duas etapas (container + publish) |

## Como a Instagram Graph API funciona

A publicação de mídia no Instagram via API requer **duas etapas**:

```text
Etapa 1: Criar Container de Mídia
POST https://graph.facebook.com/v19.0/{ig-user-id}/media
  → video_url: URL pública do vídeo
  → caption: texto da legenda
  → media_type: REELS (para vídeos)

Etapa 2: Publicar o Container
POST https://graph.facebook.com/v19.0/{ig-user-id}/media_publish
  → creation_id: ID retornado da etapa 1
```

**Limitações importantes:**
- **100 posts por 24 horas** (limite da API)
- A URL do vídeo deve ser **pública e acessível** pela Meta
- Vídeos devem ter **3-90 segundos** para Reels

## Implementação Necessária

### 1. Edge Function `social-publish`

Será criada em `supabase/functions/social-publish/index.ts`:

```text
Função: Publicar imediatamente em uma rede social

Fluxo:
1. Recebe: platform, content, mediaUrl, userId
2. Busca credenciais na tabela social_connections
3. Dependendo da plataforma:
   - Instagram: Cria container → Aguarda processamento → Publica
   - Facebook: Post direto via Graph API
   - X/Twitter: OAuth 1.0a com assinatura HMAC-SHA1
4. Retorna: success, result ou error
```

### 2. Edge Function `process-scheduled-posts`

Será criada em `supabase/functions/process-scheduled-posts/index.ts`:

```text
Função: Executar automaticamente pelo cron ou trigger

Fluxo:
1. Busca posts com status='scheduled' e scheduled_at <= agora
2. Para cada post:
   - Atualiza status para 'publishing'
   - Chama a lógica de publicação
   - Atualiza status para 'published' ou 'failed'
```

### 3. Verificação de URL de Mídia

O post agendado tem uma URL do Supabase Storage:
```
https://wtpvajxekyfekdmypcok.supabase.co/storage/v1/object/public/smart-editor/social-media/1768422636080.mp4
```

Esta URL é **pública**, então funcionará com a API do Instagram.

**Problema identificado:** Um dos posts usa URL local:
```
http://localhost:5000/api/storage/.../clips/first_half/43min-foul-ARG.mp4
```
Esta URL **não funcionará** porque a Meta não consegue acessar localhost.

## Arquivos a Criar

| Arquivo | Função |
|---------|--------|
| `supabase/functions/social-publish/index.ts` | Publica posts imediatamente |
| `supabase/functions/process-scheduled-posts/index.ts` | Processa posts agendados (cron) |

## Código da Edge Function `social-publish`

```typescript
// Estrutura principal
serve(async (req) => {
  // 1. Parse body: { platform, content, mediaUrl, userId }
  
  // 2. Buscar credenciais
  const { data: connection } = await supabaseAdmin
    .from('social_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', platform)
    .single();
  
  // 3. Publicar baseado na plataforma
  switch (platform) {
    case 'instagram':
      return await publishToInstagram(connection, content, mediaUrl);
    case 'facebook':
      return await publishToFacebook(connection, content, mediaUrl);
    // ... outras plataformas
  }
});

// Publicação no Instagram (2 etapas)
async function publishToInstagram(connection, caption, videoUrl) {
  const { access_token, account_id } = connection;
  
  // Etapa 1: Criar container
  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${account_id}/media`,
    {
      method: 'POST',
      body: JSON.stringify({
        video_url: videoUrl,
        caption: caption,
        media_type: 'REELS'
      })
    }
  );
  const { id: creationId } = await containerRes.json();
  
  // Aguardar processamento (polling)
  // ...
  
  // Etapa 2: Publicar
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${account_id}/media_publish`,
    {
      method: 'POST',
      body: JSON.stringify({ creation_id: creationId })
    }
  );
  
  return await publishRes.json();
}
```

## Resumo de Tarefas

1. **Criar** `supabase/functions/social-publish/index.ts`
   - Implementar publicação para Instagram via Graph API
   - Implementar publicação para Facebook
   - Adicionar suporte para X/Twitter com OAuth 1.0a

2. **Criar** `supabase/functions/process-scheduled-posts/index.ts`
   - Processar posts agendados cujo horário já passou
   - Atualizar status no banco de dados

3. **Validar URLs de mídia**
   - Garantir que apenas URLs públicas sejam aceitas para agendamento
   - Alertar usuário quando URL não for acessível

## Observação sobre Token do Instagram

O token que você tem (`EAAJznF7ef1gBQ...`) parece ser um token de longa duração. Tokens de longa duração da Meta expiram em **60 dias**. A edge function deve:
- Verificar validade do token antes de usar
- Alertar quando o token estiver próximo de expirar

## Estimativa

| Tarefa | Complexidade |
|--------|-------------|
| Edge function social-publish | Média-Alta |
| Edge function process-scheduled-posts | Média |
| Validação de URLs | Baixa |
| **Total** | ~2-3 implementações |
