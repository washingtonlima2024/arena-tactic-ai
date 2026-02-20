
## Diagnóstico Real e Definitivo

### O que foi visto no session replay
O toast "Download concluído!" aparece em menos de 1 segundo. Isso é o comportamento exato do `downloadSingleClip` (download direto do arquivo). Significa que o fluxo NÃO está passando pelo pipeline de Canvas + MediaRecorder.

### Por que isso acontece

Ao analisar `ExportPreviewDialog.tsx` linha 362:
```typescript
// Single clip without vignette → fast direct download
if (selectedClips.length === 1 && !includeVignettes && selectedClips[0].clipUrl) {
```

E `useVideoCompilation.ts` linha 550:
```typescript
if (config.clips.length === 1 && !config.includeVignettes && config.clips[0]?.clipUrl) {
```

Ambas as condições estão corretas no papel. Mas o session replay mostra que o download termina em ~1 segundo — o que é impossível para o pipeline MediaRecorder (que leva pelo menos 3s de vinheta de abertura + 30s de clip + etc).

**A conclusão é que o pipeline MediaRecorder está rodando mas o vídeo está vazio ou corrompido**, pois:

1. As URLs dos clips são `http://localhost:5000/api/storage/...` (HTTP)
2. O app roda em `https://519b0589...lovableproject.com` (HTTPS)  
3. O `fetch()` dentro de `fetchVideoAsBlobUrl` é uma **mixed-content request** (HTTPS → HTTP) que **o navegador bloqueia silenciosamente**
4. Resultado: `videoBlobUrls[i] = null` para todos os clips
5. O código entra no fallback (canvas preto por 5 segundos) e o vídeo gerado tem apenas as vinhetas + tela preta

**Evidência:** As URLs dos clips na resposta da API são:
```
"clip_url": "http://localhost:5000/api/storage/..."
```
E o `normalizeStorageUrl` converte isso para a URL do Cloudflare Tunnel: `https://paradise-naturals-enrollment-cams.trycloudflare.com/...`

**Mas o problema é que no ExportPreviewDialog, os clips são passados com `.clipUrl` que ainda pode ter a URL de `localhost`.**

### Solução em 2 partes

**Parte 1 — Garantir que a URL dos clips seja normalizada antes de passar para o pipeline**

Em `ExportPreviewDialog.tsx`, a função `handleDownload` monta o config assim:
```typescript
clips: clipsWithUrls.map(c => ({
  clipUrl: c.clipUrl!,  // ← pode ser http://localhost:5000/...
  ...
}))
```

Precisa normalizar usando `normalizeStorageUrl` do `apiClient`:
```typescript
import { normalizeStorageUrl } from '@/lib/apiClient';
// ...
clips: clipsWithUrls.map(c => ({
  clipUrl: normalizeStorageUrl(c.clipUrl!) || c.clipUrl!,  // ← normalizado
  ...
}))
```

**Parte 2 — Adicionar fallback de timeout e log de debug no pipeline**

Em `useVideoCompilation.ts`, no `fetchVideoAsBlobUrl`, adicionar log quando o fetch falha para confirmar o diagnóstico e garantir que o erro seja visível ao usuário (não silencioso):

```typescript
async function fetchVideoAsBlobUrl(url: string): Promise<string> {
  console.log('[Compilation] Fetching video:', url);
  const response = await fetch(url);
  // ...
}
```

E no `compilePlaylist`, quando `videoBlobUrls[i]` é null (todos os clips falharam), exibir um erro claro em vez de gerar um vídeo preto:

```typescript
const successfulDownloads = videoBlobUrls.filter(Boolean).length;
if (successfulDownloads === 0) {
  throw new Error('Nenhum clip pôde ser carregado. Verifique se o servidor local está ativo e acessível.');
}
```

**Parte 3 — Corrigir o erro de build no MediaSourceSelector.tsx**

O arquivo ainda tem 3 referências a `supabase` nas linhas 265, 325, e 331. Precisa:
- Linha 265-291: `fetchPlaylists` usa `supabase.from('playlists')` → substituir por retorno vazio (playlists são geridas localmente, não há endpoint de API para isso ainda) com mensagem explicativa
- Linhas 325-331: `handleFileUpload` usa `supabase.storage` → substituir por `apiClient.uploadMedia()` usando FormData para enviar ao servidor Python local

## Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `src/components/media/ExportPreviewDialog.tsx` | Normalizar URLs dos clips com `normalizeStorageUrl` antes de passar para pipeline |
| `src/hooks/useVideoCompilation.ts` | Adicionar log de URL antes do fetch; erro claro quando todos os clips falharam |
| `src/components/social/MediaSourceSelector.tsx` | Remover as 3 referências restantes a `supabase` (erro de build) |

## Fluxo Correto Após a Correção

```text
handleDownload() no ExportPreviewDialog
    ↓
clipUrl: normalizeStorageUrl(c.clipUrl) 
    → "https://paradise-naturals-....trycloudflare.com/api/storage/.../clips/.mp4"
    ↓
downloadCompilation(config) → compilePlaylist(config)
    ↓
fetchVideoAsBlobUrl("https://paradise-...trycloudflare.com/...") → Blob URL local
    ↓ (sem bloqueio de mixed-content)
loadVideoElement(blobUrl) → HTMLVideoElement pronto
    ↓
renderVideoOnCanvas() → frames capturados pelo MediaRecorder
    ↓
Vídeo .webm com vinhetas + clips reais
```
