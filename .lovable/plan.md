

## Problema: Closed Captions nao estao sendo queimadas no MP4

### Diagnostico

O servidor Python reportou **"Sem legendas (subtitles desativado ou sem eventos)"**, confirmando que o `renderSpec` chegou sem `subtitleLines` nos clips.

A cadeia de dados e:

```text
loadSrtLines() --> busca SRT no storage --> timestamps absolutos do video original
buildClipConfig() --> filtra linhas do SRT para o intervalo [clipStart, clipEnd]
                  --> usa videoSecond como referencia para calcular o intervalo
renderSpec.clips[i].subtitleLines --> enviado ao backend
```

O problema esta no **dominio dos timestamps**:

- O SRT foi gerado a partir do video original (ex: segundo tempo). Os timestamps sao **relativos ao inicio do arquivo de video** (ex: `00:00:30` = 30s do inicio do arquivo do 2o tempo)
- O `videoSecond` no metadata do evento pode ser o segundo **absoluto no jogo** (ex: `2700` para minuto 45), ou relativo ao video dependendo da fonte de analise
- Quando `buildClipConfig` calcula `clipStartInVideo = videoSecond - bufferBefore`, ele pode gerar um valor como `2680s`, enquanto o SRT so tem linhas ate `~2700s` se for um video de 45min do 2o tempo
- Resultado: **zero linhas do SRT caem no intervalo**, e `subtitleLines` chega vazio ao backend

Alem disso, ha um segundo problema: se o clip foi extraido como arquivo `.mp4` independente, o SRT do video completo nao corresponde diretamente — o backend precisa receber as legendas ja recortadas e com timestamps relativos ao inicio do clip (0s).

### Correcao

#### 1. `src/components/media/ExportPreviewDialog.tsx` — Corrigir `buildClipConfig`

O calculo de `clipStartInVideo` precisa usar o timestamp relativo ao arquivo de video, nao o segundo absoluto do jogo. Adicionar logica para:

- Detectar o video de origem do clip (half 1, half 2, full)
- Subtrair o `start_minute * 60` do video para obter o timestamp relativo ao arquivo
- Filtrar o SRT usando esse timestamp relativo
- Offset final: subtrair `clipStartInVideo` dos timestamps para que fiquem relativos ao inicio do clip (0s)

Mudanca na funcao `buildClipConfig`:

```typescript
const buildClipConfig = useCallback((clipsIn: Clip[], srtLines, matchVideos) => {
  return clipsIn.filter(c => c.clipUrl).map(c => {
    const bufferBefore = CLIP_BUFFER_BEFORE_MS / 1000;
    const bufferAfter = CLIP_BUFFER_AFTER_MS / 1000;
    
    // Segundo absoluto do evento no jogo
    const eventSec = c.videoSecond ?? c.totalSeconds ?? (c.minute * 60 + (c.second ?? 0));
    
    // Encontrar o video de origem para calcular offset
    const eventVideo = c.eventVideo;
    const videoStartMinute = eventVideo?.start_minute ?? 0;
    
    // Timestamp relativo ao inicio do arquivo de video (que e o mesmo dominio do SRT)
    const eventSecInVideoFile = eventSec - (videoStartMinute * 60);
    
    const clipStartInVideoFile = Math.max(0, eventSecInVideoFile - bufferBefore);
    const clipEndInVideoFile = eventSecInVideoFile + bufferAfter;
    
    // Filtrar e recortar SRT para o intervalo do clip
    const subtitleLines = srtLines.length > 0
      ? srtLines
          .filter(line => line.end >= clipStartInVideoFile && line.start <= clipEndInVideoFile)
          .map(line => ({
            start: Math.max(0, line.start - clipStartInVideoFile),
            end: Math.max(0, line.end - clipStartInVideoFile),
            text: line.text,
          }))
      : undefined;
    
    return { id: c.id, clipUrl, eventType, minute, description, thumbnailUrl, subtitleLines };
  });
}, []);
```

#### 2. `src/components/media/ExportPreviewDialog.tsx` — Adicionar logging de debug

Adicionar `console.log` no `handleDownload` para diagnosticar quantas linhas de SRT foram carregadas e quantas sobreviveram ao filtro por clip:

```typescript
console.log(`[Export] SRT total: ${allSrtLines.length} linhas`);
for (const spec of clipSpecs) {
  console.log(`[Export] Clip ${spec.minute}': ${spec.subtitleLines?.length ?? 0} legendas`);
}
```

#### 3. `src/pages/Media.tsx` — Passar `eventVideo` no clip data para ExportPreviewDialog

O clip passado ao `ExportPreviewDialog` precisa incluir o `eventVideo` (com `start_minute`) para que `buildClipConfig` calcule o offset correto. Atualmente o tipo `Clip` na interface do dialog nao inclui esse campo.

Adicionar ao tipo `Clip`:
```typescript
interface Clip {
  // ... campos existentes ...
  eventVideo?: { start_minute?: number; duration_seconds?: number | null } | null;
}
```

#### 4. `src/components/media/ExportPreviewDialog.tsx` — Carregar SRT do half correto

Se o match tem dois tempos com SRTs separados (ex: `1t_transcription.srt` e `2t_transcription.srt`), o `loadSrtLines` precisa carregar o SRT correspondente ao tempo do clip, ou carregar ambos e unificar com offset.

Atualizar `loadSrtLines` para carregar todos os SRTs disponiveis e concatenar, ajustando os timestamps do 2o tempo.

#### 5. CC preview sync — mesma correcao de offset

A mesma correcao de offset precisa ser aplicada ao `useEffect` de CC sync (linha 241-262) para que o preview tambem mostre as legendas corretamente.

### Tabela de mudancas

| Arquivo | Mudanca |
|---|---|
| `src/components/media/ExportPreviewDialog.tsx` | Corrigir `buildClipConfig` para usar offset relativo ao video; adicionar logging; carregar SRT do half correto; corrigir CC sync |
| `src/pages/Media.tsx` | Incluir `eventVideo` no mapeamento de clips passado ao ExportPreviewDialog |

### Resultado esperado

- As legendas do SRT sao corretamente recortadas para cada clip com timestamps relativos ao clip (0s = inicio do clip)
- O renderSpec enviado ao backend contem `subtitleLines` com dados reais
- O backend gera o ASS e queima as legendas no MP4 final
- O preview tambem mostra CC sincronizado durante a reproducao

