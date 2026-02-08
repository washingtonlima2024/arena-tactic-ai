
# Corrigir Login em Producao - URL Incorreta no useAuth.ts

## Problema
O login falha com **404** porque `useAuth.ts` usa uma funcao propria (`getApiBaseUrl()`) que le diretamente do `localStorage('arena_api_base')`, ignorando toda a logica centralizada do `apiMode.ts`.

Resultado: a URL montada aponta para `http://10.0.0.20:8080/api/auth/login` em vez de usar o caminho correto do ambiente.

## Causa Raiz
O arquivo `src/hooks/useAuth.ts` tem uma funcao local `getApiBaseUrl()` (linhas 318-330) que:
1. Le `localStorage('arena_api_base')` -- pode conter uma URL antiga/incorreta como `http://10.0.0.20:8080`
2. Le `VITE_API_BASE_URL` -- retorna `/api`  
3. Concatena com `/api/auth/login` -- gerando `/api/api/auth/login` (duplicado)

Enquanto isso, o `apiClient.ts` ja tem a funcao `buildApiUrl()` que resolve exatamente esse cenario de duplicacao, mas `useAuth.ts` nao a utiliza.

## Solucao

### Arquivo 1: `src/lib/apiClient.ts`
- Exportar a funcao `buildApiUrl` (adicionar `export` na linha 15)
- Atualmente e `function buildApiUrl(...)`, mudar para `export function buildApiUrl(...)`

### Arquivo 2: `src/hooks/useAuth.ts`
- Adicionar imports: `getApiBase` de `apiMode.ts` e `buildApiUrl` de `apiClient.ts`
- Atualizar os 4 endpoints de autenticacao para usar `buildApiUrl(getApiBase(), endpoint)`:

| Endpoint | Linha | Antes | Depois |
|---|---|---|---|
| Verificar token | 129 | `getApiBaseUrl() + /api/auth/me` | `buildApiUrl(getApiBase(), '/api/auth/me')` |
| Cadastro | 189 | `getApiBaseUrl() + /api/auth/register` | `buildApiUrl(getApiBase(), '/api/auth/register')` |
| Login | 227 | `getApiBaseUrl() + /api/auth/login` | `buildApiUrl(getApiBase(), '/api/auth/login')` |
| Logout | 271 | `getApiBaseUrl() + /api/auth/logout` | `buildApiUrl(getApiBase(), '/api/auth/logout')` |

- Remover a funcao local `getApiBaseUrl()` (linhas 318-330), que se torna desnecessaria

## Resultado Esperado por Ambiente

| Ambiente | getApiBase() | URL final do login |
|---|---|---|
| arenaplay.kakttus.com (Nginx) | `""` | `/api/auth/login` |
| PM2 producao (VITE_API_BASE_URL=/api) | `/api` | `/api/auth/login` |
| Desenvolvimento local | `http://10.0.0.20:5000` | `http://10.0.0.20:5000/api/auth/login` |
| Cloudflare Tunnel | `https://xxx.trycloudflare.com` | `https://xxx.trycloudflare.com/api/auth/login` |

## Resumo das Alteracoes
- **2 arquivos** modificados
- **1 palavra** adicionada no `apiClient.ts` (export)
- **4 URLs** corrigidas no `useAuth.ts`
- **1 funcao** removida do `useAuth.ts` (getApiBaseUrl)
- **Zero** impacto em outros arquivos -- a interface publica do hook nao muda
