

## Correcao: Audio e Legendas ausentes no Batch Export

### Diagnostico

Ha **dois problemas independentes**:

**1. Legendas (CC) ausentes no BatchExportPanel**

O `BatchExportPanel` tem sua propria funcao `buildRenderClips` (linha 103) que **nunca foi atualizada** com a correcao de offset `eventVideo.start_minute`. Ele usa `eventSec` diretamente como timestamp do video, gerando uma janela de filtro errada para o SRT. Resultado: zero linhas de legenda casam, e `subtitleLines` chega vazio ao backend.

Alem disso, a interface `Clip` no `BatchExportPanel` nao inclui `eventVideo`, entao mesmo que a logica fosse corrigida, o dado nao estaria disponivel.

O `ExportPreviewDialog.buildClipConfig` ja esta corrigido — mas o `BatchExportPanel` tem uma **copia separada** da mesma logica que ficou desatualizada.

**2. Audio ausente**

A correcao do `anullsrc` ja esta no codigo do `server.py` (linha 222). Porem, o servidor Python roda **localmente** na sua maquina. Se voce nao reiniciou o servidor desde a ultima edicao, ele ainda usa o codigo antigo com `-an` (sem audio). **Reinicie o servidor Python para aplicar a correcao.**

### Correcoes

#### 1. `src/components/media/BatchExportPanel.tsx` — Adicionar `eventVideo` ao tipo `Clip` e corrigir `buildRenderClips`

Atualizar a interface `Clip` para incluir `eventVideo`:

```typescript
interface Clip {
  // ... campos existentes ...
  eventVideo?: { start_minute?: number } | null;
}
```

Corrigir `buildRenderClips` para subtrair o offset do video, identico ao fix ja aplicado em `ExportPreviewDialog.buildClipConfig`:

```typescript
const videoStartMinute = c.eventVideo?.start_minute ?? 0;
const eventSecInVideoFile = eventSec - (videoStartMinute * 60);
const clipStartInVideo = Math.max(0, eventSecInVideoFile - bufferBefore);
const clipEndInVideo = eventSecInVideoFile + CLIP_BUFFER_AFTER_MS / 1000;
```

Adicionar log de debug para diagnostico.

#### 2. Audio — Reiniciar o servidor Python

O codigo do `server.py` ja contem a correcao (anullsrc). Basta **reiniciar o servidor Python** (`Ctrl+C` e rodar novamente). Os renders iniciados antes do restart continuarao com o codigo antigo.

### Tabela de mudancas

| Arquivo | Mudanca |
|---|---|
| `src/components/media/BatchExportPanel.tsx` | Adicionar `eventVideo` ao tipo `Clip`; corrigir `buildRenderClips` com offset `start_minute`; adicionar logging |

### Resultado esperado

- As legendas do SRT serao corretamente filtradas e enviadas ao backend no batch export
- Apos reiniciar o servidor Python, o audio sera preservado no MP4 final
- Os novos renders terao tanto audio quanto closed captions

