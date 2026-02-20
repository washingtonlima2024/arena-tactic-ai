
## Arquitetura Atual vs. Arquitetura Alvo

### Estado Atual (problema)
O botão "Exportar Agora" chama `handleDownload()` → `downloadCompilation()` → `compilePlaylist()` em `useVideoCompilation.ts`. Este fluxo:
1. Gera vinhetas como PNG frames via Canvas API (`useVignetteGenerator.ts`)
2. Usa `MediaRecorder` sobre um `HTMLCanvasElement` com stream 30fps
3. Produz um arquivo `.webm` (VP8/VP9) — **não MP4**
4. Aplica legendas via `drawSubtitle()` no canvas frame a frame
5. Mistura áudio via `AudioContext.createMediaElementSource`

Problemas concretos:
- `MediaRecorder` + Canvas em aba oculta → throttled pelo browser → frames pulados → vinhetas e CC desaparecem
- Saída é WEBM, não MP4/H.264 — incompatível com maioria dos stories/reels
- O preview usa React/CSS com `ResizeObserver`; o export usa Canvas com outra lógica — **nunca são iguais**
- Legendas no canvas dependem de `requestAnimationFrame` que pode ser throttled

### Arquitetura Alvo
O frontend envia um `renderSpec.json` ao backend Python que já tem FFmpeg disponível. O backend executa a composição completa: crop/scale, overlay de vinheta, burn-in de legendas ASS via libass, e gera MP4 H.264.

```
Browser                                    Python Backend (server.py)
──────                                     ──────────────────────────
1. Usuário clica "Exportar Agora"
2. Frontend monta renderSpec.json      →   POST /api/render/compile
   {format, clips[], srtLines[],           3. Backend gera vinhetas via Canvas (PNG)
    matchInfo, includeVignettes,              ou usa template FFmpeg drawtext
    includeSubtitles, preset}             4. Backend gera subtitles.ass
                                          5. FFmpeg filter_complex:
                                             - Scale + crop cada clip
                                             - Overlay vinheta (abertura/clip/transição)
                                             - ASS burn-in via subtitles=file.ass
                                             - Concat todos os segmentos
                                             - libx264 CRF 16-18 + AAC 192k
                                          6. Salva MP4 no storage
                                          7. Retorna job_id

Browser                                    Python Backend
──────                                     ──────────────
GET /api/render/status/<job_id>       →   Retorna {status, progress, log}
(poll 1s)

GET /api/render/download/<job_id>     →   stream do arquivo MP4
```

## Análise de Impacto

O backend Python (`video-processor/server.py`) já possui:
- `ffmpeg` disponível e funcional (verificado em `/health`)
- `extract_clip()` que usa libx264 + AAC
- `concatenate_videos()` que usa concat demuxer
- `normalize_video()` para uniformizar resolução
- `VIGNETTES_DIR` com vinhetas `.mp4` locais (usadas pelo `/extract-clip` e `/extract-batch`)
- `add_subtitles_to_clip()` que usa `drawtext` (mas precisamos de ASS/libass para CC)
- Sistema de jobs em `download_jobs` e `conversion_jobs` dicts globais

O frontend já possui:
- `useVignetteGenerator.ts` que renderiza vinhetas em Canvas como PNG/Blob — podemos reusar para enviar ao backend como PNGs
- `loadSrtLines()` em `ExportPreviewDialog.tsx` — já carrega o SRT corretamente
- `apiClient.ts` com padrão `apiRequest` para POST ao backend

## Arquivos a Modificar

### Backend: `video-processor/server.py`

Adicionar três novos endpoints após a linha 7926 (logo após `/extract-batch`):

**1. `POST /api/render/compile`**

Recebe o `renderSpec`:
```json
{
  "matchId": "...",
  "format": "9:16",
  "preset": "best",
  "includeVignettes": true,
  "includeSubtitles": true,
  "matchInfo": { "homeTeam": "...", "awayTeam": "...", "homeScore": 2, "awayScore": 1 },
  "clips": [
    {
      "id": "...",
      "clipUrl": "http://localhost:5000/api/storage/.../clips/...",
      "eventType": "goal",
      "minute": 23,
      "description": "...",
      "thumbnailUrl": "...",
      "subtitleLines": [{"start": 0.0, "end": 2.5, "text": "narração aqui"}]
    }
  ],
  "vignetteFrames": {
    "opening": "<base64 PNG>",
    "clips": ["<base64 PNG>", ...],
    "transitions": ["<base64 PNG>", ...],
    "closing": "<base64 PNG>"
  }
}
```

Lógica do endpoint:
1. Cria job `render_<uuid>` em `render_jobs` dict global
2. Inicia `threading.Thread` para processar assincronamente
3. Retorna imediatamente `{"jobId": "...", "status": "queued"}`

Lógica da thread (`_do_render`):
```python
FORMAT_DIMS = {
    '9:16': (1080, 1920),
    '16:9': (1920, 1080),
    '1:1':  (1080, 1080),
    '4:5':  (1080, 1350),
}
PRESET_CRF = {'best': 16, 'high': 18, 'medium': 20}
PRESET_FFMPEG = {'best': 'slow', 'high': 'medium', 'medium': 'fast'}
```

Passos dentro da thread:
1. **Resolver caminhos dos clips**: `resolve_video_path(clip['clipUrl'], match_id)` → path local
2. **Salvar PNGs das vinhetas**: Decodifica base64 dos `vignetteFrames` e salva como `/tmp/<job_id>/vignette_opening.png`, etc.
3. **Gerar arquivo ASS** (legendas burn-in):
   - PlayResX = largura do formato, PlayResY = altura
   - Gera eventos `Dialogue:` com timestamps de cada `subtitleLine` de cada clip, ajustando offset acumulado de `startTime`
4. **Para cada clip**: Aplicar crop/scale via FFmpeg:
   ```
   ffmpeg -ss <start> -i <path> -t <duration>
     -vf "scale=iw*sar:ih,setsar=1,
          scale=W:H:force_original_aspect_ratio=increase,
          crop=W:H,
          pad=W:H:(ow-iw)/2:(oh-ih)/2"
     -c:v libx264 -crf <CRF> -preset <PRESET>
     -c:a aac -b:a 192k
     -movflags +faststart
     /tmp/<job>/clip_<i>.mp4
   ```
5. **Para cada vinheta PNG**: Converter para vídeo com duração:
   ```
   ffmpeg -loop 1 -i vignette_opening.png -t 3
     -vf "scale=W:H" -c:v libx264 -crf 18 -preset medium
     -c:a anullsrc -r 30 -pix_fmt yuv420p vignette_opening.mp4
   ```
6. **Montar sequência**: `[opening_vig, clip_vig_0, clip_0, trans_vig_0, clip_vig_1, clip_1, ..., closing_vig]`
7. **Concatenar com concat demuxer** → `/tmp/<job>/pre_ass.mp4`
8. **Burn-in ASS**:
   ```
   ffmpeg -i pre_ass.mp4 -vf "ass=subtitles.ass" -c:v libx264 -crf <CRF>
     -preset <PRESET> -c:a copy -movflags +faststart final.mp4
   ```
9. **Mover para storage**: `storage/<match_id>/clips/renders/<job_id>.mp4`
10. Atualiza job status para `complete` com `output_url`

**2. `GET /api/render/status/<job_id>`**

Retorna:
```json
{
  "jobId": "...",
  "status": "queued|processing|complete|error",
  "progress": 45,
  "log": ["Processando clip 1/3...", "..."],
  "outputUrl": "http://localhost:5000/api/storage/..."
}
```

**3. `GET /api/render/download/<job_id>`**

`send_file()` do MP4 final como attachment.

### Frontend: `src/components/media/ExportPreviewDialog.tsx`

**Modificar `handleDownload()`**:

Substituir a chamada `downloadCompilation()` por:
1. Gerar as vinhetas via `useVignetteGenerator` (Canvas API) como Blob
2. Converter cada Blob para base64
3. Montar `renderSpec` com todos os dados + `vignetteFrames` em base64
4. `POST /api/render/compile` → recebe `jobId`
5. Poll `GET /api/render/status/<jobId>` a cada 1.5s — atualizar progress no overlay existente
6. Quando `status === 'complete'` → `window.open(outputUrl)` ou download direto via `<a href>` apontando para `/api/render/download/<jobId>`

**Modificar o overlay de progresso** (linha 1497–1580):
- Atualizar os estágios do checklist para refletir o pipeline FFmpeg:
  - Gerando vinhetas (canvas) 
  - Enviando ao servidor
  - Processando clips (FFmpeg scale/crop)
  - Aplicando legendas (ASS burn-in)
  - Concatenando e finalizando MP4
- Remover o aviso "Mantenha esta aba em foco" — não é mais necessário com backend render

**Adicionar fallback gracioso**: Se o servidor local não estiver disponível (`apiClient.isLocalServerAvailable()` retornar false), manter o MediaRecorder como fallback com aviso ao usuário.

### Frontend: `src/lib/apiClient.ts`

Adicionar três métodos:
```typescript
startRenderJob: (spec: RenderSpec) => Promise<{ jobId: string; status: string }>
getRenderStatus: (jobId: string) => Promise<RenderJobStatus>
downloadRenderUrl: (jobId: string) => string  // retorna a URL direta
```

### Frontend: `src/hooks/useVideoCompilation.ts`

Adicionar método `downloadCompilationViaBackend(config, vignetteBlobs)` que:
1. Converte vinheta blobs para base64
2. Monta o `renderSpec`
3. Chama o pipeline de backend (poll + download)

O método `downloadCompilation` existente muda para:
1. Tentar o backend FFmpeg primeiro
2. Fallback para MediaRecorder se o servidor não estiver disponível

## Geração do arquivo ASS

O formato ASS é suportado nativamente pelo libass integrado ao FFmpeg (`-vf ass=<file>`). A estrutura mínima necessária:

```ass
[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginV
Style: CC,Arial,52,&H00FFFFFF,&H00000000,-1,0,3,2,1,2,80

[Events]
Format: Layer, Start, End, Style, Text
Dialogue: 0,0:00:01.00,0:00:03.50,CC,Narração do gol aqui
```

- `Alignment: 2` = centralizado na margem inferior
- `MarginV: 80` = margem do rodapé
- `Fontsize: 52` = em resolução 1080px (escala com PlayResX/Y)
- `BorderStyle: 3` = caixa de fundo opaca
- `OutlineColour` com alpha = fundo semitransparente: `&H99000000`

Os timestamps são gerados acumulando a duração de cada segmento (vinheta + clip) na sequência final.

## Sequência de Segmentos e Timestamps ASS

```
Segmento              Duração   Início acumulado
─────────────────     ────────  ────────────────
opening vignette      3.0s      t=0.0s
clip[0] vignette      2.0s      t=3.0s
clip[0] video         ~30s      t=5.0s     ← subtitles mapeados aqui
transition vignette   1.5s      t=35.0s
clip[1] vignette      2.0s      t=36.5s
clip[1] video         ~30s      t=38.5s    ← subtitles mapeados aqui
closing vignette      2.0s      t=68.5s
```

O backend calcula o offset acumulado e mapeia as `subtitleLines` (relativas ao início do clip) para o tempo absoluto no arquivo final.

## Formato de Saída

```
Codec de vídeo:   libx264, pix_fmt yuv420p
CRF:              16 (best) / 18 (high) / 20 (medium)
Preset:           slow (best) / medium (high) / fast (medium)
Codec de áudio:   aac, bitrate 192k, stereo
Container:        MP4, -movflags +faststart
Extensão:         .mp4
Nome do arquivo:  Home_vs_Away_9x16_Melhor_3clips.mp4
```

## Tabela Resumo de Mudanças

| Arquivo | Tipo | Mudança |
|---|---|---|
| `video-processor/server.py` | Backend Python | Adicionar `render_jobs` dict + 3 novos endpoints: `POST /api/render/compile`, `GET /api/render/status/<id>`, `GET /api/render/download/<id>` |
| `src/lib/apiClient.ts` | Frontend TS | Adicionar `startRenderJob()`, `getRenderStatus()`, `downloadRenderUrl()` |
| `src/hooks/useVideoCompilation.ts` | Frontend TS | Adicionar `downloadCompilationViaBackend()` com poll; manter MediaRecorder como fallback |
| `src/components/media/ExportPreviewDialog.tsx` | Frontend TS | Modificar `handleDownload()` para usar backend; atualizar overlay de progresso; remover aviso de aba em foco |

## Observações Críticas

1. **Sem mudanças no preview** — o preview React permanece inalterado. A fidelidade entre preview e export é garantida pelo fato de ambos usarem os mesmos parâmetros (format, matchInfo, subtitleLines), mas o preview usa React/CSS e o export usa FFmpeg. Isso é aceitável e esperado: o preview é uma simulação, o export é o produto final.

2. **Vinhetas como PNG**: O frontend gera as vinhetas via Canvas (já existente em `useVignetteGenerator.ts`) e envia como base64. O backend converte PNG → vídeo 3s/2s/1.5s com `ffmpeg -loop 1`. Isso elimina a dependência de vinhetas `.mp4` locais no `VIGNETTES_DIR` para o export profissional.

3. **Concorrência limitada**: O endpoint aceita jobs mas o servidor Flask roda com thread-per-request. Jobs pesados rodam em threads separadas. Para evitar sobrecarga, o dict `render_jobs` rastreia quantos jobs estão `processing` e retorna 429 se > 2.

4. **Fallback**: Se `isLocalServerAvailable()` retornar false (servidor Python offline), o sistema cai automaticamente para o MediaRecorder existente, garantindo que o botão nunca trave.
