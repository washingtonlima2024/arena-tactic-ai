

## Correcao: SRT nao encontrado + video nao baixa apos conclusao

### Diagnostico

Tres problemas identificados:

**1. SRT URL nao normalizada (causa do aviso "nao achou SRT")**

A funcao `loadSrtLines` (linha 482 do ExportPreviewDialog) usa `targetSrt.url` diretamente, sem passar por `normalizeStorageUrl`. O servidor Python retorna URLs como `http://localhost:5000/api/storage/.../srt/first_half.srt`, que nao funcionam no ambiente Lovable Cloud (o browser nao consegue acessar `localhost`). O fetch falha com erro de rede, retorna `[]`, e o toast de aviso aparece.

A mesma funcao `loadSRTForPreview` (linha 307) tem o mesmo problema.

**2. Download automatico se perde**

No `useBackendRender.ts`, apos o render completar (linha 297-316):
- O download e disparado via `a.click()` (criando um link temporario)
- Apos 3 segundos, o estado e resetado para `idle` e `isRendering: false`
- O overlay de progresso desaparece
- Se o download automatico falhar (popup bloqueado, erro de rede, etc), nao existe botao de fallback para baixar o arquivo

O usuario ve o processo "se perder" porque o overlay some e o arquivo nao chega.

**3. Sem estado persistente de "concluido"**

Nao ha um estado intermediario entre "renderizando" e "idle" que permita ao usuario clicar manualmente em um botao de download caso o download automatico falhe.

### Correcoes

#### 1. `src/components/media/ExportPreviewDialog.tsx` — Normalizar URL do SRT

Em `loadSrtLines` e `loadSRTForPreview`, aplicar `normalizeStorageUrl` na URL do arquivo SRT antes de fazer o fetch:

```typescript
// Antes (linha 482):
let srtUrl = targetSrt.url || `${getApiBase()}/api/storage/${matchId}/srt/${fname}`;

// Depois:
let srtUrl = normalizeStorageUrl(targetSrt.url) || buildApiUrl(getApiBase(), `/api/storage/${matchId}/srt/${fname}`);
```

Tambem corrigir a URL de fallback (linha 490):
```typescript
const altUrl = buildApiUrl(getApiBase(), `/api/storage/${matchId}/${altFolder}/${fname}`);
```

Aplicar a mesma correcao em `loadSRTForPreview` (linha 307).

#### 2. `src/hooks/useBackendRender.ts` — Manter estado "complete" com downloadUrl

Em vez de resetar para `idle` apos 3 segundos, manter o estado `complete` com a URL de download persistente:

```typescript
// Antes (linha 314-316):
setTimeout(() => {
  setState(prev => ({ ...prev, isRendering: false, stage: 'idle', progress: 0 }));
}, 3000);

// Depois:
// Manter isRendering: true e stage: 'complete' para que o overlay persista
// com um botao de download manual
```

Adicionar `downloadUrl` ao `RenderState` e expor uma funcao `dismiss` para o usuario fechar manualmente.

#### 3. `src/components/media/ExportPreviewDialog.tsx` — Adicionar botao de download no overlay de "complete"

No overlay de progresso (linha 1571), quando `stage === 'complete'`, exibir um botao "Baixar MP4" que chama a URL de download, e um botao "Fechar" para dismissar o overlay.

### Tabela de mudancas

| Arquivo | Mudanca |
|---|---|
| `src/components/media/ExportPreviewDialog.tsx` | Normalizar URLs do SRT com `normalizeStorageUrl` em `loadSrtLines` e `loadSRTForPreview`; adicionar botao de download no overlay de conclusao |
| `src/hooks/useBackendRender.ts` | Adicionar `downloadUrl` ao `RenderState`; manter estado `complete` apos render; adicionar funcao `dismiss` para fechar overlay manualmente |

### Resultado esperado

- O arquivo SRT sera encontrado e carregado corretamente, sem aviso falso
- O video sera baixado automaticamente ao concluir
- Se o download automatico falhar, o usuario vera um botao "Baixar MP4" no overlay de conclusao
- O usuario podera fechar o overlay manualmente apos baixar
