

## Diagnóstico

Existem dois bugs interligados no pipeline de render FFmpeg:

### Bug 1: Polling do job anterior nunca é limpo
Quando `startRender` e chamado uma segunda vez (ou apos um erro), o intervalo de polling do job anterior (`pollRef.current`) nao e cancelado antes de iniciar o novo render. Isso causa dois pollings simultaneos -- o antigo continua fazendo GET para um `jobId` que ja nao existe no servidor (404), gerando o spam de erros no console.

No codigo atual (linha 171 de `useBackendRender.ts`), `startRender` faz `cancelledRef.current = false` e reseta o state, mas **nao chama `clearInterval(pollRef.current)`** antes de comecar.

### Bug 2: Erro 404 no polling nao para o loop corretamente
Quando `getRenderStatus` retorna 404, o `apiClient` lanca um erro. O `catch` dentro do `setInterval` (linha 306-309) chama `clearInterval` e `reject`, mas ha uma race condition: se o intervalo dispara multiplas vezes antes do `clearInterval` processar, multiplas promises de `getRenderStatus` ficam em voo. Alem disso, apos o `reject`, o `catch` externo (linha 314-319) seta `isRendering: false` e `stage: 'error'`, mas o intervalo ja pode ter disparado outra chamada.

### Bug 3: Botoes desabilitados
A variavel `isAnyRendering` (linha 184) depende de `backendRender.state.isRendering`. Se o state fica preso em `isRendering: true` (por causa do polling vazando), todos os botoes de export e debug frame ficam desabilitados permanentemente.

## Correcoes

### 1. `src/hooks/useBackendRender.ts` -- Limpar polling anterior ao iniciar novo render

Na funcao `startRender`, antes de resetar o state (linha 171), adicionar:

```typescript
// Limpar qualquer polling anterior
if (pollRef.current) {
  clearInterval(pollRef.current);
  pollRef.current = null;
}
```

### 2. `src/hooks/useBackendRender.ts` -- Proteger polling contra erros 404

No bloco `catch` do intervalo de polling (linha 306-309), adicionar protecao contra chamadas duplicadas usando uma flag:

```typescript
let pollStopped = false;

pollRef.current = setInterval(async () => {
  if (cancelledRef.current || pollStopped) {
    clearInterval(pollRef.current!);
    pollRef.current = null;
    resolve();
    return;
  }
  try {
    const s = await apiClient.getRenderStatus(jobId);
    // ... logica existente ...

    if (s.status === 'complete') {
      pollStopped = true;
      clearInterval(pollRef.current!);
      pollRef.current = null;
      // ... download logic ...
      resolve();
    } else if (s.status === 'error') {
      pollStopped = true;
      clearInterval(pollRef.current!);
      pollRef.current = null;
      reject(new Error(s.error ?? 'Erro desconhecido no render'));
    }
  } catch (e) {
    pollStopped = true;
    clearInterval(pollRef.current!);
    pollRef.current = null;
    reject(e);
  }
}, 1500);
```

### 3. `src/hooks/useBackendRender.ts` -- Garantir cleanup no `cancel`

Na funcao `cancel` (linha 96-108), garantir que `pollRef` e resetado:

```typescript
const cancel = useCallback(() => {
  cancelledRef.current = true;
  if (pollRef.current) {
    clearInterval(pollRef.current);
    pollRef.current = null;
  }
  setState({ isRendering: false, stage: 'idle', progress: 0, message: '', log: [], debugFrameUrl: null, jobId: null });
}, []);
```

### 4. `src/hooks/useBackendRender.ts` -- Adicionar max retries para erros 404

Para evitar polling infinito caso o servidor perca o job, adicionar um contador de erros consecutivos:

```typescript
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

// Dentro do catch:
consecutiveErrors++;
if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
  pollStopped = true;
  clearInterval(pollRef.current!);
  pollRef.current = null;
  reject(new Error('Servidor perdeu o job de render apos multiplas tentativas'));
}
// Se nao atingiu o max, nao faz nada (deixa tentar de novo no proximo tick)
```

## Tabela de mudancas

| Arquivo | Mudanca |
|---|---|
| `src/hooks/useBackendRender.ts` | Limpar pollRef antes de novo render; proteger polling com flag `pollStopped`; adicionar max retries para 404; garantir `pollRef = null` em todos os caminhos de saida |

## Resultado esperado

- O polling do job antigo para imediatamente ao iniciar um novo render
- Erros 404 nao geram loops infinitos (maximo 5 tentativas)
- Os botoes "Exportar MP4", "Debug Frame" e outros voltam a funcionar apos um erro
- O overlay de progresso some corretamente apos cancelar ou erro

