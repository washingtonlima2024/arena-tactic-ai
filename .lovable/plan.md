

# Corrigir Feedback de Publicacao Social e Tratar Erros da API

## Problema

O toast "Conteudo compartilhado em: Instagram, Facebook" e exibido mesmo quando AMBAS as publicacoes falham com erro 400. Os erros sao capturados e logados apenas no console, sem nenhum feedback visual ao usuario.

Erros reais da Meta API:
- **Instagram**: O `account_id` armazenado na conexao nao e valido ou o token nao tem permissoes (`instagram_content_publish`, `pages_read_engagement`)
- **Facebook**: O token nao tem a permissao `publish_video`

## Solucao

### 1. Corrigir feedback de sucesso/falha no `SocialSharePanel.tsx`

**Arquivo**: `src/components/media/SocialSharePanel.tsx` (linhas 211-230)

Rastrear quais plataformas tiveram sucesso e quais falharam, e exibir o toast correto:

```text
ANTES (linhas 211-230):
  // Publish immediately - loop com try/catch individual que engole erros
  for (const platform of selectedNetworks) {
    try {
      const result = await apiClient.post('/api/social/publish', {...});
      if (!result.success) {
        console.error(...); // <-- so loga no console
      }
    } catch (e) {
      console.error(...); // <-- engole o erro
    }
  }
  toast.success(`Conteudo compartilhado em: ${networkNames}`); // <-- SEMPRE mostra sucesso

DEPOIS:
  const successes: string[] = [];
  const failures: { platform: string; error: string }[] = [];

  for (const platform of selectedNetworks) {
    try {
      const result = await apiClient.post('/api/social/publish', {...});
      if (result.success) {
        successes.push(platform);
      } else {
        failures.push({ platform, error: result.error || 'Erro desconhecido' });
      }
    } catch (e: any) {
      failures.push({ platform, error: e.message || 'Erro de conexao' });
    }
  }

  // Feedback correto baseado nos resultados reais
  if (successes.length > 0) {
    const names = successes.map(p => platformLabels[p]).join(', ');
    toast.success(`Conteudo compartilhado em: ${names}`);
  }
  if (failures.length > 0) {
    const failNames = failures.map(f => `${platformLabels[f.platform]}: ${f.error}`).join('\n');
    toast.error(`Falha ao publicar:\n${failNames}`);
  }
  if (successes.length === 0 && failures.length > 0) {
    // Nao fechar o painel se tudo falhou, para o usuario poder tentar novamente
    setIsSharing(false);
    return; // Nao chamar onClose()
  }
```

### 2. Tratar erro 400 do apiClient.post corretamente

O `apiClient.post` lanca excecao quando o HTTP status nao e OK (400). Isso significa que o bloco `if (!result.success)` na linha 222 **nunca e executado** — o erro vai direto para o `catch`. Precisamos tratar ambos os caminhos:

- **catch**: erro HTTP (status 400) — extrair mensagem da API
- **result.success === false**: resposta OK mas com sucesso false (improvavel mas possivel)

### 3. Mapear nomes de plataformas para labels visiveis

Adicionar um mapa de labels para que o toast mostre "Instagram" ao inves de "instagram":

```typescript
const platformLabels: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X (Twitter)',
};
```

## Sobre os erros da Meta API

Os erros reais indicam problemas de permissoes no token/conta:

1. **Instagram**: O `account_id` (`24726023243656371`) precisa ser o ID da **Pagina Instagram Business** vinculada a uma pagina do Facebook. Para publicar Reels, o token precisa das permissoes: `instagram_content_publish`, `pages_read_engagement`, `instagram_basic`.

2. **Facebook**: O token precisa da permissao `publish_video` e `pages_manage_posts` para publicar videos na pagina.

Esses erros sao do lado da Meta e nao podem ser corrigidos no codigo — o usuario precisa:
- Verificar se a conta do Instagram e Business/Creator (nao pessoal)
- Re-gerar o token com as permissoes corretas no Meta Business Suite
- Usar o ID correto da Instagram Business Account (nao o ID do usuario)

## Resultado Esperado

- Toast de ERRO quando a publicacao falha, mostrando a mensagem da API
- Toast de SUCESSO apenas quando pelo menos uma plataforma publicou com exito
- Painel nao fecha automaticamente se todas as publicacoes falharam
- Usuario consegue identificar claramente o problema e reconectar com permissoes corretas
