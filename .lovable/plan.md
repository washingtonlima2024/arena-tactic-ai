
## Diagnóstico Real e Definitivo

### O Problema Raiz (confirmado)

A API retorna `clip_url` com endereço absoluto:
```
"clip_url": "http://localhost:5000/api/storage/.../clips/first_half/00min-goal-191d3061.mp4"
```

O `normalizeStorageUrl` converte corretamente essa URL para o tunnel do Cloudflare, mas o problema está **na sequência de execução do download**:

No `ExportPreviewDialog.tsx`, linha 363:
```typescript
if (selectedClips.length === 1 && !includeVignettes && selectedClips[0].clipUrl) {
  // DOWNLOAD DIRETO — sem pipeline MediaRecorder, sem vinhetas
```

A sessão replay mostra que o download conclui em **menos de 2 segundos** — tempo impossível para o pipeline de vinhetas (mínimo ~7-10s). Isso confirma que a condição de "download direto" está sendo ativada mesmo com vinhetas marcadas.

### Causa Confirmada

O `ExportPreviewDialog` está em modo `preview` quando o botão de exportar é clicado. Nesse step, o estado `includeVignettes` foi definido na tela de configuração mas a condição de verificação na linha 363 usa `!includeVignettes`.

**Mas há um problema mais sutil:** a condição em `useVideoCompilation.ts` linha 569 é:
```typescript
if (config.clips.length === 1 && !config.includeVignettes && config.clips[0]?.clipUrl) {
```

O `downloadCompilation` recebe o config correto com `includeVignettes: true`. Então deveria ir para o pipeline. **O que está acontecendo então?**

Verificando novamente os logs de rede: os clips retornam com:
```
"clip_url": "http://localhost:5000/api/storage/..."
```

E a linha 308 em `Media.tsx` normaliza isso:
```typescript
clipUrl: normalizeStorageUrl((event as any).clip_url as string | null),
```

O `normalizeStorageUrl` converte para o tunnel, então `clipUrl` deveria estar correto.

**O verdadeiro problema**: Na linha 363 do `ExportPreviewDialog`:
```typescript
if (selectedClips.length === 1 && !includeVignettes && selectedClips[0].clipUrl) {
    // SALTA para downloadSingleClip
```
Essa condição só seria ativada se `includeVignettes === false`. Mas o pipeline MediaRecorder ainda pode estar gerando um blob vazio (< 10KB) e lançando o erro — que está sendo **engolido silenciosamente**.

### Raiz Real: O Pipeline MediaRecorder não Captura Frames no Lovable Preview

O Lovable Preview (`id-preview--...lovable.app`) roda em HTTPS. O `MediaRecorder` com `canvas.captureStream()` funciona apenas quando a aba está em **foco ativo**. No Lovable, o preview fica em um `<iframe>` que pode perder o foco, e o `setInterval` fica **throttled** pelo browser quando a aba não está em foco — resultando em 0 frames capturados e blob < 10KB → erro → `return null` → nenhum download.

Além disso, a vinheta é gerada por `canvas.toBlob()`, que também pode falhar silenciosamente em contextos de iframe sem permissão de segurança de origem.

### Solução: 3 Correções Críticas

**1. Separar completamente o fluxo de download do ExportPreviewDialog do iframe do Lovable**

O processamento de vídeo via MediaRecorder deve acontecer **fora do iframe de preview**. A solução é usar um `Web Worker` com `OffscreenCanvas` + `MediaRecorder`, mas isso é complexo.

**Alternativa mais simples e robusta**: Em vez de compilar vídeo no browser, usar a abordagem de **download ZIP** com os clips individuais + geração de vinhetas como imagens separadas. Mas isso muda a proposta.

**Alternativa viável sem mudar a proposta**: Usar `requestVideoFrameCallback` em vez de `setInterval` para garantir que o canvas receba frames mesmo quando o browser throttle.

**2. Adicionar logs de debug visuais na interface durante a compilação**

Em vez de um overlay silencioso, mostrar **cada etapa em tempo real** na UI: "Gerando vinheta abertura... ✅", "Baixando clip 1... ✅", "Renderizando frames... X% concluído", para que o usuário confirme o que está acontecendo.

**3. Validar blob com mensagem de erro clara**

Se o blob tiver < 10KB, mostrar um toast de erro claro: "O vídeo ficou vazio. Possível causa: aba em segundo plano durante renderização. Mantenha a aba ativa e tente novamente."

### Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `src/hooks/useVideoCompilation.ts` | Substituir `setInterval` por `requestAnimationFrame` para captura de frames; adicionar contador de frames capturados com log; melhorar mensagem de erro quando blob vazio |
| `src/components/media/ExportPreviewDialog.tsx` | Adicionar log visual por etapa no overlay de compilação; garantir que a janela permaneça em foco durante compilação (usando `window.focus()`); adicionar toast de erro com causa específica quando blob vazio |

### Mudança Principal: `requestAnimationFrame` para `renderImageOnCanvas` e `renderVideoOnCanvas`

O `setInterval` a 30fps em uma aba que pode estar throttled é o culpado de vídeos vazios. A substituição por `requestAnimationFrame` garante sincronização com o render loop real do browser:

```typescript
// ANTES (buggy em aba throttled):
const interval = setInterval(() => {
  ctx.drawImage(bitmap, 0, 0, width, height);
}, FRAME_INTERVAL_MS);

// DEPOIS (sincronizado com render loop):
let rafId: number;
const renderFrame = () => {
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (elapsed < durationMs) {
    rafId = requestAnimationFrame(renderFrame);
  } else {
    resolve();
  }
};
rafId = requestAnimationFrame(renderFrame);
```

Para o vídeo, igualmente substituir o `setInterval` do `renderVideoOnCanvas` por `requestVideoFrameCallback` (quando disponível) ou `requestAnimationFrame`.

### Adicionalmente: Garantir Foco da Aba

No início da compilação, chamar `window.focus()` e mostrar uma mensagem de aviso clara:
```typescript
// Forçar foco da janela para evitar throttling
window.focus();
```

E adicionar ao overlay: **"⚠️ Mantenha esta aba em foco durante a geração do vídeo"**

### Fluxo Corrigido

```text
handleDownload() → downloadCompilation(config)
  ↓
  window.focus() // evitar throttling
  ↓
  setInterval → requestAnimationFrame // sincronizado com render loop
  ↓
  Vinheta abertura: 3s × 30fps = 90 frames capturados
  ↓ 
  fetchVideoAsBlobUrl("https://cloudflare-tunnel.../clips/...mp4") → Blob
  ↓
  renderVideoOnCanvas() com requestAnimationFrame → frames reais
  ↓
  mediaRecorder.stop() → blob > 10KB → download .webm
```
