
## Diagnóstico dos Três Problemas no Preview

### Problema 1 — "Letrero no início com nome do arquivo"

O `DialogTitle` do `ExportPreviewDialog` no preview step usa `VisuallyHidden`, mas o `DialogContent` pode renderizar o título acessível visível no topo em alguns navegadores/OS. Além disso, o preview de abertura (`OpeningVignette`) está correto, mas o usuário pode estar vendo um texto residual de nome de arquivo do componente anterior à abertura.

Causa mais provável: na tela de preview, quando `playbackState.type === 'idle'`, não há nenhum estado visual definido — a tela fica em branco mostrando o fundo escuro com algum texto residual antes de avançar para `opening`.

**Correção:** Garantir que o `startPreview` avance imediatamente para `opening` sem passar por `idle`, e remover qualquer texto visível que apareça antes da vinheta de abertura.

### Problema 2 — Closed Captions não aparecem no Preview

O `VideoContent` (linha 1389–1453 do `ExportPreviewDialog.tsx`) renderiza apenas `<video>` sem overlay de CC. As legendas SRT são carregadas apenas no momento do download (`handleDownload`), e não durante o preview.

**Correção:** Carregar o SRT do match quando o preview é iniciado (`startPreview`) e sobrepor as linhas CC sincronizadas com o `currentTime` do vídeo, exatamente igual ao `drawSubtitle` no canvas, mas em React como um overlay `<div>` posicionado absolutamente no rodapé do vídeo.

### Problema 3 — Vinheta pequena demais

O `ClipVignette` usa breakpoints `sm:` e `md:` do Tailwind que dependem da largura da **janela** (`window.innerWidth`), não da largura do container. O container (device frame) tem apenas 220×450px para celular — mas o Tailwind `sm:` só ativa em `640px+` de viewport. Então todos os elementos ficam no tamanho mínimo (`text-2xl`, `h-5 w-5`, etc.) porque o breakpoint `sm:` nunca ativa dentro do frame pequeno.

**Correção:** Substituir os breakpoints responsivos do Tailwind por tamanhos baseados em `%` ou `clamp()` via `style` inline, que escalam com o container em vez da viewport. Alternativamente, usar `container queries` (mas não disponível no projeto atual). A solução mais simples e compatível é usar `font-size` e dimensões em percentual do container via propriedades CSS inline calculadas.

## Solução Técnica

### 1. ExportPreviewDialog — Overlay de CC no Preview

**Onde:** dentro do bloco `{/* Video Player */}` (linha 1043), após o `VideoContent`.

Adicionar:
- Estado `previewSubtitles: SubtitleLine[]` (carregado quando o preview inicia)
- Estado `currentCC: string` (atualizado via `timeupdate` no `videoRef`)
- Overlay de CC: `<div className="absolute bottom-[8%] left-2 right-2 z-20 text-center">` com fundo preto semitransparente e texto branco, renderizado apenas quando `currentCC` não for vazio

```tsx
// Sincronização de CC com o vídeo no preview
useEffect(() => {
  const video = videoRef.current;
  if (!video || !previewSubtitles.length) return;
  const onTime = () => {
    const sub = previewSubtitles.find(s => video.currentTime >= s.start && video.currentTime <= s.end);
    setCurrentCC(sub?.text ?? '');
  };
  video.addEventListener('timeupdate', onTime);
  return () => video.removeEventListener('timeupdate', onTime);
}, [previewSubtitles, playbackState]);
```

**Carregamento do SRT:** mover a lógica de fetch do SRT de `handleDownload` para uma função `loadSRTForPreview(matchId)` chamada também em `startPreview()`, e armazenar em `previewSrtLines`. Cada clip terá seus timestamps ajustados no momento em que o vídeo começa.

### 2. ClipVignette — Tamanhos baseados no container

**Onde:** `src/components/media/ClipVignette.tsx`

Trocar breakpoints Tailwind por escala proporcional via `style` inline. O componente já recebe `w-full h-full` do parent, então podemos usar `vh`/`vw` relativo ao container com `containerRef` + `ResizeObserver`, ou simplesmente usar `%` + `clamp()`:

```tsx
// Exemplo: em vez de "text-2xl sm:text-4xl md:text-5xl"
// usar style={{ fontSize: 'clamp(1.5rem, 8cqw, 4rem)' }}
```

Como `container queries` não estão disponíveis, usaremos `ResizeObserver` no container da vinheta para obter a largura real e calcular os tamanhos de fonte inline.

```tsx
const containerRef = useRef<HTMLDivElement>(null);
const [containerWidth, setContainerWidth] = useState(300);

useEffect(() => {
  const ro = new ResizeObserver(entries => {
    setContainerWidth(entries[0].contentRect.width);
  });
  if (containerRef.current) ro.observe(containerRef.current);
  return () => ro.disconnect();
}, []);

const scale = Math.min(1, containerWidth / 400); // 400px = design base
```

E então aplicar `scale` como multiplicador em todos os tamanhos de fonte e ícones.

O mesmo para `TransitionVignette.tsx`.

### 3. OpeningVignette — Texto "nome do arquivo"

**Onde:** `OpeningVignette` (linha 1332 do `ExportPreviewDialog.tsx`)

Inspecionar se há algum texto "idle" ou nome de arquivo sendo exibido. O `playbackState.type === 'idle'` não tem renderização condicional no bloco do screen — fica branco. Adicionar um estado de "loading/idle" que exibe o logo sem texto de arquivo, e garantir que o `DialogTitle` não vaze visualmente.

Adicionalmente, aumentar o tamanho e qualidade do `OpeningVignette` no preview para ser imersivo como o `ClipVignette`.

## Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `src/components/media/ExportPreviewDialog.tsx` | 1) Carregar SRT em `startPreview`; 2) Overlay CC sincronizado no VideoContent; 3) Corrigir estado idle; 4) Melhorar OpeningVignette para ser mais imersivo |
| `src/components/media/ClipVignette.tsx` | Substituir breakpoints Tailwind por `ResizeObserver` + escala proporcional ao container |
| `src/components/media/TransitionVignette.tsx` | Mesma correção de escala por container |

## Fluxo Correto do Preview

```
startPreview()
  ↓
  Carrega SRT (matchId) → previewSrtLines[]
  ↓
  playbackState: opening → ClipVignette (escala pelo container) → vídeo
  ↓
  Durante vídeo: timeupdate → lookup em previewSrtLines filtrado pelo clip atual
              → currentCC: string → overlay CC no rodapé do vídeo
  ↓
  Transition → próximo clip → closing
```

## Resultado Esperado

- Preview mostrará CC sincronizados como texto pequeno no rodapé do vídeo (idêntico ao CC do arquivo exportado)
- Vinhetas (ClipVignette e TransitionVignette) escalarão proporcionalmente ao tamanho do device mockup, sem depender de breakpoints de viewport
- Não aparece mais o "letrero" com nome de arquivo antes da vinheta de abertura
