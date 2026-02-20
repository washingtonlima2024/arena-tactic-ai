
## Diagnóstico Completo

Três problemas independentes causam as falhas reportadas: "sumiu tudo, sem áudio, sem legenda, sem vinheta."

### Problema 1 — Áudio ausente (causa-raiz que destrói tudo)

**Arquivo:** `src/hooks/useVideoCompilation.ts`, linha 305

```
video.muted = true;  ← ESTA LINHA
```

O elemento de vídeo é carregado com `muted = true`. Mesmo com `video.volume = 1` sendo definido depois (linha 598), a propriedade `muted` tem precedência absoluta no navegador — nenhum áudio passa. 

O `AudioContext.createMediaElementSource(video)` conecta a fonte, mas como o elemento está mudo, o `audioDestination` recebe silêncio. Em vários navegadores (Chrome especialmente), um `MediaRecorder` com uma faixa de áudio completamente silenciosa pode entrar em estado inválido, fazendo a gravação resultar em um arquivo corrompido ou vazio — o que explica por que **vinhetas, legendas e áudio desaparecem ao mesmo tempo**.

**Correção:** Remover `video.muted = true`. O vídeo roda em um elemento fora do DOM (background), então não incomoda o usuário com som — mas o áudio precisa estar desbloqueado para o AudioContext capturá-lo.

### Problema 2 — Offset do SRT incorreto (legendas no lugar errado)

**Arquivo:** `src/components/media/ExportPreviewDialog.tsx`, linha 408

```typescript
const eventSec = c.totalSeconds ?? (c.minute * 60 + (c.second ?? 0));
const clipStartInVideo = Math.max(0, eventSec - bufferBefore);
```

O campo `totalSeconds` no clip pode ser `eventMs / 1000` (tempo do jogo), não o segundo no arquivo de vídeo original. O SRT do jogo usa timestamps do arquivo de vídeo original.

Em `Media.tsx` (linha 309), o campo correto já existe no objeto clip:
```typescript
videoSecond: videoSecond ?? totalSeconds,  // metadata.videoSecond do AI
```

Mas ele não é usado no cálculo do offset do SRT — o código usa apenas `totalSeconds`. A correção é usar `c.videoSecond` quando disponível, pois esse campo referencia o segundo correto no arquivo de vídeo onde o evento ocorre.

### Problema 3 — Campo `videoSecond` não propagado para ExportPreviewDialog

**Arquivo:** `src/pages/Media.tsx`, linha 1420

O mapeamento `clips={clips.map(c => ({...c, thumbnail: getThumbnail(c.id)?.imageUrl}))}` inclui todos os campos via `...c`, então `videoSecond` já está sendo passado. O problema é que a interface `Clip` dentro do `ExportPreviewDialog.tsx` (linha 85) não declara `videoSecond`:

```typescript
interface Clip {
  id: string;
  title: string;
  type: string;
  minute: number;
  second?: number;
  description?: string;
  thumbnail?: string;
  clipUrl?: string | null;
  totalSeconds?: number;
  // videoSecond não está aqui!
}
```

Sem `videoSecond` na interface, o TypeScript não permite usá-lo no `handleDownload`.

## Arquivos a Modificar

### 1. `src/hooks/useVideoCompilation.ts`

**Linha 305:** Remover `video.muted = true`

```typescript
// ANTES
video.muted = true;
video.playsInline = true;

// DEPOIS
// video.muted removido — necessário para AudioContext capturar áudio
video.playsInline = true;
```

Esta é a correção mais crítica — resolve áudio, vinhetas e legendas de uma vez.

### 2. `src/components/media/ExportPreviewDialog.tsx`

**Interface `Clip` (linha 85):** Adicionar campo `videoSecond`

```typescript
interface Clip {
  // ... campos existentes ...
  totalSeconds?: number;
  videoSecond?: number;  // ← NOVO: segundo no arquivo de vídeo original
}
```

**Função `handleDownload` (linha 408):** Usar `videoSecond` para o cálculo do offset do SRT

```typescript
// ANTES
const eventSec = c.totalSeconds ?? (c.minute * 60 + (c.second ?? 0));

// DEPOIS
// Usar videoSecond (tempo no arquivo de vídeo) para o offset do SRT
// Fallback para totalSeconds se videoSecond não disponível
const eventSec = c.videoSecond ?? c.totalSeconds ?? (c.minute * 60 + (c.second ?? 0));
```

## Resumo das Mudanças

| Arquivo | Linha | Mudança | Impacto |
|---|---|---|---|
| `useVideoCompilation.ts` | 305 | Remover `video.muted = true` | Resolve áudio + vinhetas + pipeline completa |
| `ExportPreviewDialog.tsx` | ~88 | Adicionar `videoSecond?: number` na interface `Clip` | Permite usar o campo correto |
| `ExportPreviewDialog.tsx` | ~408 | Usar `c.videoSecond ?? c.totalSeconds` no cálculo do offset | Sincroniza CC com o timestamp correto do vídeo |

## Observações

- O `videoSecond` já é passado para o `ExportPreviewDialog` via `...c` no spread do `Media.tsx` — só precisa ser declarado na interface TypeScript para ser acessível
- Sem SRT disponível, `subtitleLines` fica vazio e nenhuma legenda é renderizada — sem erro
- A remoção do `muted` não afeta o usuário pois o elemento de vídeo está em background (fora do DOM visível)
