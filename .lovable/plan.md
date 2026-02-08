

# Corrigir Prioridade de URL no getApiBase() - Acesso Direto vs Proxy

## Problema Identificado

A correcao anterior eliminou a duplicacao `/api/api/`, mas o erro persiste por uma razao diferente:

```text
Servidor descoberto: http://10.0.0.20:5000   (correto, porta 5000)
API Base: /api                                (VITE_API_BASE_URL sobrepoe)
POST http://10.0.0.20:8080/api/auth/login     (relativo resolve contra porta 8080)
```

A funcao `getApiBase()` no `apiMode.ts` tem esta prioridade:
1. Dominio `arenaplay.kakttus.com` -- retorna `""` (OK)
2. `VITE_API_BASE_URL=/api` -- retorna `/api` (PROBLEMA: sobrepoe o servidor descoberto)
3. Servidor descoberto -- `http://10.0.0.20:5000` (nunca alcancado)

O `/api` e um caminho relativo que depende de proxy reverso (Nginx) na frente. Quando o usuario acessa `http://10.0.0.20:8080` diretamente (via PM2 ou Vite), nao ha proxy, e a requisicao vai para `http://10.0.0.20:8080/api/auth/login` que retorna 404.

## Causa Raiz

Na producao com PM2, o app e compilado com `.env.production` que define `VITE_API_BASE_URL=/api`. Esse valor e pensado para funcionar com Nginx (que faz proxy de `/api/` para porta 5000). Porem, quando acessado diretamente pela porta 8080, nao existe proxy -- a requisicao bate no proprio servidor estático que serve o frontend.

## Solucao

Adicionar deteccao inteligente em `getApiBase()`: quando `VITE_API_BASE_URL` e um caminho relativo (comeca com `/`), verificar se estamos realmente atras de um proxy reverso. Se nao (porta nao-padrao como 8080), preferir o servidor descoberto.

### Arquivo: `src/lib/apiMode.ts`

**Mudanca 1** - Nova funcao helper `isBehindreverseProxy()`:

```typescript
function isBehindReverseProxy(): boolean {
  const port = window.location.port;
  // Portas padrao HTTP/HTTPS indicam proxy reverso
  return !port || port === '80' || port === '443';
}
```

**Mudanca 2** - Atualizar `getApiBase()` para considerar acesso direto:

```typescript
export const getApiBase = (): string => {
  // 1. Dominio de producao Kakttus
  if (isKakttusProduction()) return '';

  // 2. Variavel de ambiente
  const envApiUrl = import.meta.env.VITE_API_BASE_URL;
  if (envApiUrl) {
    // Se e caminho relativo (/api), so funciona atras de proxy
    // Quando acessado diretamente (porta 8080), preferir servidor descoberto
    if (envApiUrl.startsWith('/') && !isBehindReverseProxy()) {
      const discovered = getDiscoveredServer();
      if (discovered) return discovered;
    }
    return envApiUrl.replace(/\/$/, '');
  }

  // 3-5 permanecem iguais
  // ...
};
```

## Resultado por Cenario

| Cenario | Porta | Proxy? | getApiBase() | URL final |
|---|---|---|---|---|
| Nginx (`arenaplay.kakttus.com`) | 443 | Sim | `""` | `/api/auth/login` |
| Nginx (outro dominio) | 80/443 | Sim | `/api` | `/api/auth/login` |
| PM2 direto (`10.0.0.20:8080`) | 8080 | Nao | `http://10.0.0.20:5000` | `http://10.0.0.20:5000/api/auth/login` |
| Vite dev (`localhost:8080`) | 8080 | Nao | `http://10.0.0.20:5000` | `http://10.0.0.20:5000/api/auth/login` |
| Cloudflare Tunnel | 443 | Sim | `/api` | `/api/auth/login` |

## Resumo das Alteracoes

- **1 arquivo** modificado: `src/lib/apiMode.ts`
- **1 funcao** adicionada: `isBehindReverseProxy()` (~4 linhas)
- **4 linhas** alteradas em `getApiBase()` (adicionar verificacao de proxy)
- **Zero** impacto na interface publica -- todos os outros arquivos continuam funcionando

