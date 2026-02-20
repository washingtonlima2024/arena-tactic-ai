
## Diagnóstico Real do Problema

Após leitura profunda dos arquivos, identifico **3 causas raiz** que fazem as vinhetas não aparecerem:

### Causa 1 — Bypass silencioso no ExportPreviewDialog (linha 362)

```typescript
// Single clip without vignette → fast direct download
if (selectedClips.length === 1 && !includeVignettes && selectedClips[0].clipUrl) {
```

A sessão de replay mostra o toast "Download concluído!" aparecendo **imediatamente** (menos de 1 segundo), o que é o comportamento do `downloadSingleClip` (download direto). Isso revela que, mesmo com "Incluir Vinhetas" ativo, o código entra nesse ramo errado quando há apenas 1 clip — o check `!includeVignettes` não está protegendo corretamente porque há uma race condition onde `includeVignettes` ainda é `false` por padrão no estado inicial antes do usuário ativar.

Mas há um problema maior:

### Causa 2 — `downloadCompilation` também tem um bypass idêntico (linhas 532-538 de useVideoCompilation.ts)

```typescript
// Single clip without vignette → direct download (fastest)
if (config.clips.length === 1 && !config.includeVignettes && config.clips[0].clipUrl) {
```

Esse bypass existe em **dois lugares**: no `ExportPreviewDialog.handleDownload` E dentro do próprio `useVideoCompilation.downloadCompilation`. Mesmo que o primeiro seja corrigido, o segundo também descartaria a pipeline.

### Causa 3 — Canvas offscreen e `toBlob()` silencioso

O `getCanvas()` em `useVignetteGenerator.ts` cria canvas fora do DOM. Em alguns navegadores (especialmente quando a aba está em segundo plano), `canvas.toBlob()` pode retornar um blob vazio ou com imagem totalmente transparente/preta. O `blobToImageBitmap()` não valida se o blob é válido antes de criar o `ImageBitmap`.

Adicionalmente, o `renderImageOnCanvas` desenha a imagem no canvas mas o MediaRecorder pode não capturar os primeiros frames se iniciado antes da primeira renderização. O `mediaRecorder.start(100)` inicia a gravação, mas os bitmaps são desenhados **depois** — já existe o código `ctx.drawImage(bitmap, 0, 0, width, height)` antes do setInterval, mas se o bitmap chegou vazio (Causa 3), nada aparece.

---

## Solução Completa

### Arquivo 1: `src/hooks/useVideoCompilation.ts`

**Mudança A**: Remover o bypass no `downloadCompilation` — sempre usar a pipeline MediaRecorder quando `includeVignettes = true`.

**Mudança B**: Adicionar `console.log` de diagnóstico (temporário) para confirmar que o pipeline é acionado.

**Mudança C**: Adicionar validação do blob gerado pelo `canvas.toBlob()` — se o blob for nulo ou vazio, registrar erro claro.

**Mudança D**: Antes de iniciar o `mediaRecorder.start()`, preencher o canvas com preto e aguardar um pequeno delay (50ms) para garantir que o stream seja capturado corretamente pelo MediaRecorder antes de iniciar a renderização das vinhetas.

**Mudança E**: No `renderImageOnCanvas`, fazer `ctx.drawImage` imediatamente na chamada (já existe) E verificar que o `bitmap` é válido (width/height > 0) antes de tentar renderizar.

### Arquivo 2: `src/components/media/ExportPreviewDialog.tsx`

**Mudança A**: Corrigir `handleDownload` — **remover** o ramo de download direto para 1 clip quando `includeVignettes = true`. A lógica correta:

```typescript
// 1 clip SEM vinheta → download direto (mais rápido)
if (selectedClips.length === 1 && !includeVignettes && selectedClips[0].clipUrl) {
  // download direto
  return;
}
// Todos os outros casos → pipeline MediaRecorder (com ou sem vinheta)
await downloadCompilation({ ..., includeVignettes });
```

Isso já existe, mas a variável `includeVignettes` pode estar em estado padrão `true` no código, então o bypass NÃO deveria ser atingido. O problema é na **Causa 2** (bypass duplicado dentro de `downloadCompilation`).

### Arquivo 3: `src/hooks/useVignetteGenerator.ts`

**Mudança**: Adicionar validação explícita no `toBlob()` de cada vinheta, garantindo que o canvas tem conteúdo antes de retornar:

```typescript
return new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob || blob.size < 100) {
      reject(new Error('Vinheta gerada vazia'));
    } else {
      resolve(blob);
    }
  }, 'image/png', 1.0);
});
```

---

## Sequência de renderização corrigida

```text
handleDownload() no ExportPreviewDialog
    ↓
downloadCompilation(config) em useVideoCompilation
    ↓ (NUNCA mais faz bypass quando includeVignettes = true)
compilePlaylist(config)
    ↓
[Stage 1: generating-vignettes]
  → generateOpeningVignette → Blob PNG validado (size > 100 bytes)
  → blobToImageBitmap → ImageBitmap com width/height > 0
    ↓
[Stage 2: downloading]
  → Buscar vídeos como blob URLs locais
    ↓
[Stage 3: processing] 
  → canvas criado, preenchido com preto
  → stream = canvas.captureStream(30)
  → mediaRecorder.start(100)
  → await 50ms (garantir que MediaRecorder está gravando)
  → renderImageOnCanvas(openingBitmap, 3000ms) ← VINHETA ABERTURA APARECE
  → renderImageOnCanvas(clipBitmap, 2000ms) ← VINHETA DO CLIP APARECE
  → renderVideoOnCanvas(video) ← VÍDEO DO CLIP
  → renderImageOnCanvas(transitionBitmap, 1500ms) ← TRANSIÇÃO
  → renderImageOnCanvas(closingBitmap, 2000ms) ← ENCERRAMENTO
    ↓
[Stage 4: concatenating]
  → mediaRecorder.stop() → Blob .webm
    ↓
[Complete]
  → Download automático do arquivo .webm com vinhetas embutidas
```

---

## Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| `src/hooks/useVideoCompilation.ts` | Remover bypass duplo; adicionar delay pós-start; validar bitmaps |
| `src/hooks/useVignetteGenerator.ts` | Validar blob não-vazio no toBlob() |
| `src/components/media/ExportPreviewDialog.tsx` | Garantir que o flow passa sempre pela pipeline quando vinhetas ativas |
