

# Plano: Corrigir Inconsistência nas Chaves do localStorage

## Problema Identificado

Existe uma **inconsistência fatal** nas chaves do localStorage entre dois arquivos:

| Arquivo | O que faz | Chave que usa |
|---------|-----------|---------------|
| `src/pages/Landing.tsx` | Salva URL do servidor | `arena_api_base` |
| `src/hooks/useAuth.ts` | Lê URL para fazer login | `arenaApiUrl` |

**Resultado**: Você configura a URL do Cloudflare na Landing, ela é salva em `arena_api_base`, mas quando tenta fazer login, o hook lê de `arenaApiUrl` (que está vazio) e usa o fallback `http://localhost:5000`.

Por isso as requisições mostram:
```
POST http://localhost:5000/api/auth/login
Error: Failed to fetch
```

## Solução

Unificar para usar **uma única chave**: `arena_api_base` (a mais usada no projeto).

## Alterações Necessárias

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useAuth.ts` | Mudar de `arenaApiUrl` para `arena_api_base` |

## Código a Alterar

```typescript
// src/hooks/useAuth.ts - função getApiBaseUrl()

// ANTES (linha 321):
const stored = localStorage.getItem('arenaApiUrl');

// DEPOIS:
const stored = localStorage.getItem('arena_api_base');
```

## Resultado Esperado

Após a correção:
1. Você configura a URL na Landing: `https://euro-rocky-surround-regularly.trycloudflare.com`
2. A URL é salva em `arena_api_base`
3. O hook `useAuth` lê a mesma chave
4. Login faz requisição para `https://euro-rocky-surround-regularly.trycloudflare.com/api/auth/login`
5. Login funciona com `washington@kakttus.com` / `arena2025`

