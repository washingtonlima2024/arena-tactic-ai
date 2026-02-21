

## Correcao: Audio ausente e Closed Captions no MP4 exportado

### Problema 1: Audio ausente

**Causa raiz**: As vinhetas (opening, closing, clip, transition) sao convertidas de PNG para MP4 com a flag `-an` (sem audio) na funcao `png_to_video` do servidor Python (linha 227 do `server.py`). Quando o FFmpeg concat demuxer concatena segmentos **sem** audio (vinhetas) com segmentos **com** audio (clips), ele falha silenciosamente e descarta **todo** o audio do video final.

O concat demuxer do FFmpeg exige que todos os segmentos tenham os mesmos streams (video + audio). Se um segmento nao tem audio, o resultado final fica sem audio.

**Correcao**: Substituir `-an` por um track de audio silencioso na funcao `png_to_video`. Usar o filtro `anullsrc` do FFmpeg para gerar silencio com as mesmas specs do audio dos clips (AAC, 44100Hz, stereo):

```python
cmd = [
    'ffmpeg', '-y',
    '-loop', '1', '-i', png_path,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',  # audio silencioso
    '-t', str(duration),
    '-vf', f'scale={W}:{H}:...',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '128k',  # audio silencioso codificado
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-shortest',  # parar quando o video (loop) atingir -t
    out_mp4
]
```

### Problema 2: Closed Captions ausentes

**Causa raiz**: O servidor reportou "Sem legendas (subtitles desativado ou sem eventos)", confirmando que `subtitle_events` esta vazio. A correcao de offset ja foi aplicada no `buildClipConfig`, mas o `loadSrtLines` pode estar falhando silenciosamente ou o SRT pode nao existir no storage.

Adicionalmente, ha um problema no fluxo: quando o usuario clica "Exportar MP4" no dialog, o `handleDownload` carrega o SRT via `loadSrtLines()`, mas se o SRT nao for encontrado ou o fetch falhar, retorna `[]` silenciosamente (catch vazio). O usuario nao recebe nenhum feedback.

**Correcoes**:

1. **Melhorar logging no `loadSrtLines`**: Adicionar logs detalhados para cada etapa (busca de arquivos, URL usada, resposta do fetch, quantidade de linhas parseadas).

2. **Feedback ao usuario**: Se `allSrtLines` for vazio e `includeSubtitles` estiver ativo, mostrar um toast de aviso antes de enviar ao backend, informando que o video sera gerado sem legendas.

3. **Fallback de SRT**: Tentar carregar o SRT diretamente da pasta `texts/` se a pasta `srt/` estiver vazia, e vice-versa.

### Tabela de mudancas

| Arquivo | Mudanca |
|---|---|
| `video-processor/server.py` | Funcao `png_to_video`: substituir `-an` por `anullsrc` para gerar audio silencioso nas vinhetas |
| `src/components/media/ExportPreviewDialog.tsx` | `loadSrtLines`: adicionar logging detalhado; `handleDownload`: toast de aviso se SRT vazio com CC ativo |

### Resultado esperado

- O MP4 final tera audio nos trechos dos clips (preservado do video original)
- As vinhetas terao silencio em vez de ausencia de audio track
- O concat do FFmpeg funcionara corretamente com streams uniformes
- O usuario recebera feedback se legendas nao forem encontradas
- Logs detalhados para diagnostico futuro do SRT

