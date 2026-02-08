

# Corrigir Conexao de Redes Sociais - user_id Ausente

## Problema

Ao tentar conectar uma rede social (ex: Instagram), a requisicao POST para `/api/social/connections` retorna erro 400 com a mensagem "user_id e platform sao obrigatorios". O payload enviado pelo frontend nao inclui o campo `user_id`.

Evidencia dos logs de rede:
```text
POST /api/social/connections -> 400
Request Body: {"platform":"instagram","access_token":"...","account_id":"...","account_name":"@wahington_.lima","is_connected":true}
Response: {"error": "user_id e platform sao obrigatorios"}
```

## Causa

No arquivo `Social.tsx`, a funcao `handleConnect` (linha 223) monta o payload sem incluir o `user_id` do usuario autenticado. O hook `useAuth` e importado no arquivo mas o `user` nao e extraido nem utilizado no payload.

## Solucao

### Arquivo: `src/pages/Social.tsx`

1. **Extrair `user` do hook `useAuth`** no componente `Social`:

```text
ANTES:
  // useAuth nao e utilizado dentro do componente

DEPOIS:
  const { user } = useAuth();
```

2. **Adicionar `user_id` ao payload** na funcao `handleConnect` (linha ~230):

```text
ANTES:
  const payload = {
    platform: selectedNetwork.id,
    access_token: credentials.access_token || credentials.api_key,
    refresh_token: credentials.refresh_token || credentials.access_token_secret,
    account_id: credentials.account_id,
    account_name: credentials.account_name || selectedNetwork.name,
    is_connected: true,
  };

DEPOIS:
  const payload = {
    platform: selectedNetwork.id,
    access_token: credentials.access_token || credentials.api_key,
    refresh_token: credentials.refresh_token || credentials.access_token_secret,
    account_id: credentials.account_id,
    account_name: credentials.account_name || selectedNetwork.name,
    is_connected: true,
    user_id: user?.id,
  };
```

3. **Adicionar validacao de usuario logado** antes de enviar (protecao extra):

```text
if (!user?.id) {
  toast({
    title: 'Erro',
    description: 'Voce precisa estar logado para conectar redes sociais.',
    variant: 'destructive',
  });
  return;
}
```

## Resultado Esperado

- O payload enviado ao backend incluira o `user_id` do usuario autenticado
- A conexao da rede social sera salva corretamente no banco de dados
- Caso o usuario nao esteja logado, uma mensagem de erro clara sera exibida

