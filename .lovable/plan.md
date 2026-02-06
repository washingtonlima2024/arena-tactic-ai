
# Correção: Reprocessamento de vídeos importados do YouTube

## Problema Identificado

Ao clicar em "Processar Partida" na página de Eventos, o sistema tenta transcrever **todos os vídeos registrados** para a partida -- incluindo clips, vídeos duplicados e registros pendentes. No caso da partida Barcelona vs Real Madrid, existem **5 registros de vídeo**:

- `video_e8194543.mp4` - tipo `clip`, status `completed` (arquivo pode não existir)
- `video_049eca64.mp4` - tipo `full`, status `pending` (registro duplicado de importação)
- `video_049eca64.mp4` - tipo `full`, status `completed` (arquivo real)
- `video_56d3093d.mp4` - tipo `full`, status `pending` (registro duplicado de importação)
- `video_56d3093d.mp4` - tipo `full`, status `completed` (arquivo real)

O loop em `handleProcessMatch` itera TODOS eles sem filtro, e ao tentar transcrever o clip `video_e8194543.mp4` (que não existe no disco), o backend retorna o erro "Local file not found".

## Solução

### 1. Filtrar vídeos antes de processar (frontend)

No `handleProcessMatch` em `src/pages/Events.tsx`, filtrar os vídeos para:
- Excluir vídeos do tipo `clip` (não fazem sentido para transcrição completa)
- Excluir vídeos com status `pending` (são registros de importação duplicados)
- Remover duplicatas baseado no `file_url` (manter apenas um registro por arquivo físico)

### 2. Normalizar a URL do vídeo antes de enviar ao backend

Atualmente o `handleProcessMatch` envia `video.file_url` diretamente (ex: `http://localhost:5000/api/storage/...`). Como o backend já lida com isso, o problema é menor, mas idealmente devemos enviar o caminho relativo (`/api/storage/...`) para consistência.

## Detalhes Técnicos

### Arquivo: `src/pages/Events.tsx` (linhas ~778-793)

Antes:
```typescript
for (const video of matchVideos) {
  const videoType = video.video_type || 'full';
  // ... processa todos os vídeos
}
```

Depois:
```typescript
// Filtrar vídeos processáveis: excluir clips, pendentes e duplicatas
const processableVideos = matchVideos
  .filter(v => v.video_type !== 'clip')           // Excluir clips
  .filter(v => v.status === 'completed' || v.status === 'ready' || v.status === 'analyzed')  // Apenas vídeos com arquivo real
  .filter((v, i, arr) => {                          // Remover duplicatas por file_url
    const normalizedUrl = v.file_url?.replace('http://localhost:5000', '').replace('http://127.0.0.1:5000', '');
    return arr.findIndex(x => {
      const xUrl = x.file_url?.replace('http://localhost:5000', '').replace('http://127.0.0.1:5000', '');
      return xUrl === normalizedUrl;
    }) === i;
  });

if (processableVideos.length === 0) {
  toast.error('Nenhum vídeo válido para processar (apenas clips ou pendentes encontrados)');
  return;
}

for (const video of processableVideos) {
  // ... processar normalmente
}
```

Isso garante que apenas vídeos reais e completos sejam enviados para transcrição, evitando erros de "arquivo não encontrado".
