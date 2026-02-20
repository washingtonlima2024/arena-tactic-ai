
## Objetivo

Implementar exportação com vinhetas embutidas — tanto para clips individuais quanto para playlists — sem zipar, usando recursos 100% do navegador (Canvas API + MediaRecorder), sem depender do servidor Python.

---

## Diagnóstico do Estado Atual

| Cenário | Comportamento atual |
|---|---|
| 1 clip com `clipUrl` | Download direto `.mp4` — funciona ✅ |
| 1 clip sem `clipUrl` | Nada acontece ❌ |
| Playlist | Chama `/api/compile-playlist` no servidor → rota não existe → erro ❌ |
| Vinhetas na exportação | São mostradas no preview mas **não entram no vídeo exportado** ❌ |

---

## Estratégia: Exportação Client-Side com MediaRecorder

A abordagem mais viável sem depender do servidor Python é usar um `<canvas>` com `MediaRecorder` para capturar o conteúdo frame a frame:

1. **Para 1 clip:** renderizar a vinheta do clip no canvas por ~3s → depois exibir o vídeo no canvas → exportar como `.webm`/`.mp4`
2. **Para playlist:** renderizar sequência: `[vinheta abertura] → [vinheta clip1] → [clip1] → [transição] → [vinheta clip2] → [clip2] → ... → [vinheta encerramento]`

**Limitação conhecida:** MediaRecorder no Chrome exporta `.webm`. Para maximizar compatibilidade, usaremos `.mp4` quando disponível (Safari/Firefox suportam MP4 nativo via MediaRecorder).

---

## Arquivos a Modificar

### 1. `src/hooks/useVideoCompilation.ts` — Reescrita completa da lógica

Substituir a chamada a `/api/compile-playlist` por uma pipeline de renderização client-side:

```
compilePlaylist(config)
  ↓
[Stage: generating-vignettes]
  → Gerar PNG das vinhetas via useVignetteGenerator (Canvas API)
  → Converter Blob → ObjectURL

[Stage: processing]
  → Criar OffscreenCanvas (ou canvas no DOM) com dimensões do formato
  → Criar MediaRecorder no canvas stream (canvas.captureStream(30fps))
  → Para cada item na sequência:
      - Se vinheta: desenhar no canvas por duração definida (3s abertura, 2s transição, 2s encerramento)
      - Se clip: criar <video> temporário, quando pronto → drawImage em loop no canvas até onended

[Stage: concatenating]
  → Parar MediaRecorder
  → Coletar chunks → Blob(.webm ou .mp4)

[Stage: complete]
  → Disparar download automático (sem zip)
```

**Dimensões por formato:**
```typescript
const FORMAT_DIMENSIONS = {
  '9:16': { width: 720, height: 1280 },  // reduzido para performance
  '16:9': { width: 1280, height: 720 },
  '1:1':  { width: 720, height: 720 },
  '4:5':  { width: 720, height: 900 },
};
```

**Estrutura de sequência para playlist:**
```typescript
type SequenceItem =
  | { kind: 'opening'; data: OpeningVignetteData; duration: 3000 }
  | { kind: 'clip-vignette'; data: ClipVignetteData; duration: 2000 }
  | { kind: 'video'; clip: CompilationClip }
  | { kind: 'transition'; data: TransitionVignetteData; duration: 1500 }
  | { kind: 'closing'; data: ClosingVignetteData; duration: 2000 }
```

**Para renderizar vinhetas no canvas** (que já existem como geradores de PNG):
- `generateOpeningVignette()`, `generateClipVignette()`, `generateTransitionVignette()`, `generateClosingVignette()` retornam `Blob` (PNG)
- Converter para `ImageBitmap` e usar `ctx.drawImage()` em loop durante a duração

**Para renderizar vídeo no canvas:**
- Criar `<video>` temporário com `src = clip.clipUrl`
- Em loop de `requestAnimationFrame`, fazer `ctx.drawImage(video, 0, 0, w, h)` enquanto `!video.ended`
- Quando vídeo terminar, prosseguir para próximo item

---

### 2. `src/hooks/useVideoCompilation.ts` — Função `downloadSingleClip` com vinheta

Quando há 1 clip e `includeVignettes = true`:
- Renderizar a sequência: `[vinheta do clip] → [vídeo do clip]` usando MediaRecorder
- Exportar como arquivo único `.webm` (sem zip)

Quando `includeVignettes = false` e há 1 clip com URL:
- Manter o download direto atual (mais rápido)

---

### 3. `src/components/media/ExportPreviewDialog.tsx` — Ajuste do botão e lógica de download

- Alterar `handleDownload` para sempre passar `includeVignettes` e chamar o novo `compilePlaylist` (que agora funciona client-side)
- Remover a branch especial de "1 clip = download direto" quando vinhetas estão ativas
- Ajustar o label do botão:
  - 1 clip sem vinheta → "Download (.mp4)" 
  - 1 clip com vinheta → "Gerar Vídeo"
  - N clips → "Gerar Playlist"
- Remover referências ao ZIP/fallback manual

---

### 4. `src/components/media/CompilationProgress.tsx` — Verificar estágios

Já tem os estágios `generating-vignettes`, `processing`, `concatenating` — apenas garantir que as mensagens estão corretas para o novo fluxo.

---

## Sequência de renderização no canvas (detalhes técnicos)

```text
Para playlist com vinhetas:

1. Criar canvas com dimensões do formato
2. Iniciar canvas.captureStream(30) → MediaRecorder
3. Renderizar abertura:
   - drawImage(openingPNG) em loop por 3000ms via requestAnimationFrame
4. Para cada clip:
   a. Renderizar vinheta do clip:
      - drawImage(clipVignettePNG) em loop por 2000ms
   b. Renderizar vídeo:
      - video.src = clip.clipUrl
      - video.play()
      - loop: ctx.drawImage(video, 0, 0, w, h) via requestAnimationFrame
      - aguardar video.ended
   c. Se não é o último clip: renderizar transição por 1500ms
5. Renderizar encerramento por 2000ms
6. mediaRecorder.stop()
7. Coletar chunks → Blob
8. Trigger download como .webm
```

---

## Detalhes de implementação do MediaRecorder

```typescript
const stream = canvas.captureStream(30); // 30fps
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: MediaRecorder.isTypeSupported('video/mp4') 
    ? 'video/mp4' 
    : 'video/webm;codecs=vp9',
  videoBitsPerSecond: 4_000_000 // 4 Mbps
});

const chunks: Blob[] = [];
mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
mediaRecorder.onstop = () => {
  const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
  // trigger download
};
```

---

## Tratamento para clips sem URL (thumbnail apenas)

Se `clip.clipUrl` é null, usar a thumbnail como imagem estática por 5s no canvas:
- `drawImage(thumbnailImg, 0, 0, w, h)` em loop por 5000ms
- Adicionar overlay com texto do evento (minuto, tipo) no canvas

---

## Resumo das mudanças por arquivo

| Arquivo | Mudança principal |
|---|---|
| `src/hooks/useVideoCompilation.ts` | Reescrever `compilePlaylist` com MediaRecorder; nova função `compileSingleClipWithVignette` |
| `src/components/media/ExportPreviewDialog.tsx` | Ajustar `handleDownload` para usar novo fluxo; labels corretos no botão |
| `src/components/media/CompilationProgress.tsx` | Verificar/ajustar mensagens dos estágios |

