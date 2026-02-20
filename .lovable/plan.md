
## Diagnóstico Definitivo

### Raiz do Problema

Analisando os network requests em tempo real, confirmei o bug exato:

A API de eventos (`/api/matches/{id}/events`) retorna:
```json
"clip_url": "http://localhost:5000/api/storage/5806651a-.../clips/first_half/00min-foul-f8bb2bd9.mp4"
```

A `normalizeStorageUrl` converte isso para:
```
https://paradise-naturals-enrollment-cams.trycloudflare.com/api/storage/.../clips/...mp4
```

Isso parece correto, MAS há dois problemas reais não resolvidos ainda:

**Problema 1 — `downloadSingleClip` não normaliza a URL**

Em `ExportPreviewDialog.tsx` linha 363-367:
```typescript
// Single clip without vignette → fast direct download
if (selectedClips.length === 1 && !includeVignettes && selectedClips[0].clipUrl) {
  const clip = selectedClips[0];
  await downloadSingleClip(clip.clipUrl, filename);  // ← URL NÃO normalizada aqui!
```

**Problema 2 — A compilação com vinheta não mostra progresso visível ao usuário**

O pipeline MediaRecorder está sendo chamado, mas o componente `CompilationProgress` pode não estar sendo exibido por cima do dialog, fazendo o usuário achar que "não funcionou" enquanto está processando em background. O usuário fecha o dialog prematuramente.

**Problema 3 — Vídeo termina de renderizar mas `blob` pode ser vazio**

Se o MediaRecorder receber `chunks` mas o vídeo não tiver conteúdo real (canvas preto), o arquivo baixado será válido porém sem conteúdo visual — o usuário acha que falhou.

### Verificação de onde `CompilationProgress` é exibido

O `isCompiling` de `useVideoCompilation` está sendo passado para o componente, mas precisa verificar se o `CompilationProgress` é renderizado **dentro** do `ExportPreviewDialog` de forma visível.

### Solução Completa em 3 Partes

**Parte 1 — Normalizar URL no `downloadSingleClip`**

Em `ExportPreviewDialog.tsx` linha 366:
```typescript
// ANTES (bug):
await downloadSingleClip(clip.clipUrl, filename);

// DEPOIS (correto):
await downloadSingleClip(normalizeStorageUrl(clip.clipUrl!) || clip.clipUrl!, filename);
```

**Parte 2 — Tornar o progresso da compilação absolutamente visível**

O problema mais provável é que o usuário não vê o progresso e fecha o dialog. Adicionar um overlay de progresso mais proeminente dentro do `ExportPreviewDialog` que:
- Bloqueia o fechamento do dialog enquanto `isCompiling === true`
- Mostra claramente o estágio atual (gerando vinheta / baixando clip / renderizando)
- Mostra o percentual em tamanho grande

**Parte 3 — Adicionar log detalhado do pipeline + validação do blob final**

Em `useVideoCompilation.ts`, após `mediaRecorder.stop()`:
```typescript
const finalBlob = new Blob(chunks, { type: mimeType });
console.log(`[Compilation] Final blob: ${finalBlob.size} bytes, chunks: ${chunks.length}`);
if (finalBlob.size < 10_000) {
  throw new Error(`Vídeo gerado vazio (${finalBlob.size} bytes). O canvas pode não ter recebido frames do vídeo.`);
}
resolve(finalBlob);
```

### Causa Raiz do "Vídeo Vazio"

Mesmo com URL normalizada, o `renderVideoOnCanvas` pode falhar silenciosamente se:
- O vídeo carregou mas `video.play()` foi bloqueado (autoplay policy)
- O `setInterval` do canvas disparou antes do vídeo ter decodificado o primeiro frame

Solução: Aguardar explicitamente o primeiro frame antes de iniciar o renderizador:
```typescript
const video = await loadVideoElement(blobUrl);
video.muted = true;
await video.play();
// Aguardar primeiro frame decodificado
await new Promise<void>(resolve => {
  if (video.readyState >= 3) { resolve(); return; }
  video.addEventListener('playing', () => resolve(), { once: true });
  setTimeout(resolve, 2000); // fallback
});
await renderVideoOnCanvas(ctx, video, width, height, cancelRef);
```

### Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `src/components/media/ExportPreviewDialog.tsx` | Normalizar URL no `downloadSingleClip`; bloquear fechamento do dialog durante compilação; mostrar overlay de progresso mais visível |
| `src/hooks/useVideoCompilation.ts` | Validar blob final (lançar erro se < 10KB); aguardar primeiro frame antes de renderizar vídeo; log detalhado do pipeline |

### Sequência do Pipeline Corrigida

```text
handleDownload()
  ↓ normalizeStorageUrl(clip.clipUrl)
  ↓ downloadCompilation(config)
    ↓ compilePlaylist(config)
      ↓ generateOpeningVignette() → Blob → ImageBitmap [OK]
      ↓ fetchVideoAsBlobUrl("https://cloudflare-tunnel.../clips/...mp4")
          → Console: "[Compilation] Fetching video: https://..."
          → Se CORS: throw error claro
          → Se OK: Blob URL local
      ↓ loadVideoElement(blobUrl)
      ↓ video.play() → aguardar "playing" event
      ↓ renderVideoOnCanvas() → frames reais no canvas
      ↓ mediaRecorder.stop() → Blob > 10KB → download
```
