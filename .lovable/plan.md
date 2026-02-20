
## Problema Identificado

O código atual usa `clip.description` (nome do evento como "Gol - 45min") como texto de legenda na exportação. O que o usuário quer são os **Closed Captions reais** — frases sincronizadas com o áudio vindas do arquivo SRT do jogo, exatamente como funciona no ClipPreviewModal.

## Solução

### 1. Adicionar `subtitleLines` no tipo `CompilationClip`

O tipo `CompilationClip` precisa de um campo para carregar as linhas do SRT já filtradas e ajustadas para o tempo relativo do clip:

```typescript
export interface SubtitleLine {
  start: number; // seconds relative to clip start
  end: number;
  text: string;
}

export interface CompilationClip {
  id: string;
  clipUrl: string;
  eventType: string;
  minute: number;
  description?: string;
  thumbnailUrl?: string;
  subtitleLines?: SubtitleLine[]; // ← NOVO: linhas do SRT para o intervalo do clip
}
```

### 2. Mudar `renderVideoOnCanvas` para CC sincronizado

Em vez de passar `subtitle?: string` (texto estático), passar `subtitleLines?: SubtitleLine[]` e calcular qual linha exibir com base no `video.currentTime`:

```typescript
// ANTES: texto estático
if (subtitle) drawSubtitle(ctx, subtitle, width, height);

// DEPOIS: CC sincronizado com o tempo do vídeo
const currentSub = subtitleLines?.find(
  s => video.currentTime >= s.start && video.currentTime <= s.end
);
if (currentSub) drawSubtitle(ctx, currentSub.text, width, height);
```

### 3. `ExportPreviewDialog`: buscar e passar o SRT para cada clip

No `handleDownload`, antes de chamar `downloadCompilation`, buscar o arquivo SRT do match e pre-processar as linhas para cada clip:

```typescript
// Buscar SRT do jogo (mesma lógica do ClipPreviewModal)
const filesData = await apiClient.listMatchFiles(matchId);
const srtFiles = filesData?.folders?.srt || [];
// Carregar e parsear o SRT
const srtContent = await fetch(srtUrl).then(r => r.text());
const allLines = parseSRT(srtContent);

// Para cada clip, filtrar e ajustar os timestamps relativos
const clipSubtitles = allLines
  .filter(line => line.end >= clipStartInVideo && line.start <= clipEnd)
  .map(line => ({
    start: Math.max(0, line.start - clipStartInVideo),
    end: Math.max(0, line.end - clipStartInVideo),
    text: line.text,
  }));
```

### 4. Remover o título/descrição do evento como legenda

Retirar completamente o uso de `clip.description` na linha de renderização de vídeo — esse campo não deve mais aparecer no vídeo exportado.

## Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `src/hooks/useVideoCompilation.ts` | Adicionar interface `SubtitleLine`; adicionar campo `subtitleLines` em `CompilationClip`; mudar `renderVideoOnCanvas` para receber `subtitleLines` e exibir CC sincronizado pelo `video.currentTime` |
| `src/components/media/ExportPreviewDialog.tsx` | No `handleDownload`, buscar SRT do match via `apiClient.listMatchFiles`; parsear com `parseSRT`; filtrar e ajustar linhas para o intervalo de cada clip; passar `subtitleLines` em cada clip para `downloadCompilation`; também passar `matchId` como prop |

## Fluxo Correto

```text
ExportPreviewDialog.handleDownload()
  ↓
  apiClient.listMatchFiles(matchId) → busca arquivos SRT
  ↓
  fetch(srtUrl) → texto bruto do SRT
  ↓
  parseSRT(content) → array de { start, end, text }
  ↓
  Para cada clip: filtrar linhas que cobrem o intervalo do clip
                  ajustar timestamps para tempo relativo (0 = início do clip)
  ↓
  downloadCompilation({ clips: [..., subtitleLines: [...]] })
  ↓
  renderVideoOnCanvas() → a cada frame, lookup por video.currentTime
                         → drawSubtitle(linha atual do CC)
```

## Observações

- Se não houver SRT disponível para o match, `subtitleLines` fica vazio e nenhuma legenda é renderizada (sem erro)
- O `matchId` já está disponível via URL (`/media?match=...`) mas precisa ser passado como prop para o `ExportPreviewDialog`
- A lógica de busca do SRT (escolha entre first_half, second_half, full) segue o mesmo padrão já implementado no `ClipPreviewModal`
- A opção "Incluir legendas" no painel de configuração continua funcionando — quando desmarcada, `subtitleLines` não é passado
