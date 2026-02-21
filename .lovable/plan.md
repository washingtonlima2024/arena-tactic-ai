
## Diagnostico: Por que esta exportando WebM

O problema esta no **BatchExportPanel** -- o componente da aba "Batch Export". Ele usa o pipeline antigo `useVideoCompilation` + `compilePlaylist()` que grava via `MediaRecorder` do browser, produzindo **WebM** (VP8/VP9).

Existem dois caminhos de exportacao no dialogo:

```text
Aba "Preview" -> botao "Exportar MP4"  -> useBackendRender.startRender() -> FFmpeg -> MP4 (correto)
Aba "Batch"   -> botao "Exportar Tudo" -> useVideoCompilation.compilePlaylist() -> MediaRecorder -> WebM (ERRADO)
```

O usuario clicou na aba Batch ("Adicionar a Fila" -> "Exportar Tudo"), confirmado pelo toast "1 job(s) added to the queue" no session replay.

### Evidencias no codigo:

1. **`BatchExportPanel.tsx` linha 76**: `const { compilePlaylist } = useVideoCompilation();`
2. **`BatchExportPanel.tsx` linha 124**: `.join('_') + '.webm'` -- extensao hardcoded como .webm
3. **`BatchExportPanel.tsx` linha 162**: `const blob = await compilePlaylist(config)` -- usa MediaRecorder
4. **`useBatchExport.ts` linha 71**: comentario confirma "Run a single job using the Canvas/MediaRecorder pipeline"

### Problemas secundarios confirmados:
- **Layout diferente do preview**: O `compilePlaylist` usa Canvas API simplificado, nao os componentes React do preview
- **Closed Captions**: O pipeline MediaRecorder usa `drawSubtitle()` no Canvas (se funciona depende do requestAnimationFrame/throttle)

## Correcao

Migrar o `BatchExportPanel` para usar `useBackendRender` (FFmpeg) em vez de `useVideoCompilation` (MediaRecorder).

### 1. `src/components/media/BatchExportPanel.tsx`

**Remover** import e uso de `useVideoCompilation`.

**Adicionar** prop `matchId: string` ao componente (necessario para o backend render).

**Mudar `handleExportAll`**: Em vez de chamar `compilePlaylist()`, chamar `apiClient.startRenderJob()` para cada job na fila, pollar status, e quando completar, fazer download do MP4 via `apiClient.downloadRenderUrl()`.

**Mudar extensao do arquivo**: `.webm` -> `.mp4` na linha 124.

**Mudar logica de download**: Em vez de guardar `blob` em memoria (Blob do MediaRecorder), guardar o `jobId` do backend e fazer download via URL quando completo.

### 2. `src/hooks/useBatchExport.ts`

**Atualizar tipo `ExportJob`**: Trocar `blob?: Blob` por `downloadUrl?: string` e `backendJobId?: string`.

**Atualizar `downloadJob`**: Em vez de `URL.createObjectURL(blob)`, usar a URL do backend diretamente.

**Atualizar `downloadAllAsZip`**: Fazer fetch de cada MP4 via URL, converter para blob, e montar o ZIP.

**Atualizar `processQueue`**: A funcao `compileFn` agora retorna `{ jobId, downloadUrl }` em vez de `Blob`.

### 3. `src/components/media/ExportPreviewDialog.tsx`

**Passar `matchId`** como prop ao `BatchExportPanel`.

### 4. `src/hooks/useBackendRender.ts`

Exportar as funcoes `startRenderJob`, `getRenderStatus` e `downloadRenderUrl` do `apiClient` como utilitarios reutilizaveis (ja existem em `apiClient.ts`, so precisam ser usados corretamente no batch).

## Fluxo corrigido

```text
Aba "Preview" -> "Exportar MP4"  -> useBackendRender -> FFmpeg -> MP4
Aba "Batch"   -> "Exportar Tudo" -> apiClient.startRenderJob (por job) -> FFmpeg -> MP4
```

Ambos os caminhos produzem MP4 via FFmpeg com o mesmo renderSpec (vinhetas PNG + clips + ASS subtitles).

## Tabela de mudancas

| Arquivo | Mudanca |
|---|---|
| `src/components/media/BatchExportPanel.tsx` | Substituir `useVideoCompilation` por chamadas a `apiClient.startRenderJob/getRenderStatus`; extensao `.webm` -> `.mp4`; download via URL em vez de Blob |
| `src/hooks/useBatchExport.ts` | Tipo `ExportJob`: `blob` -> `downloadUrl` + `backendJobId`; adaptar download e ZIP para usar URLs |
| `src/components/media/ExportPreviewDialog.tsx` | Passar `matchId` ao `BatchExportPanel` |
