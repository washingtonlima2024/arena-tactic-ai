

# Match Center - Redesign Profissional com Modal de Clips e Player Diferenciado

## Visao Geral

Redesenhar completamente o Match Center com foco em:
1. **Clips Gallery com capas reais** (thumbnails) em vez de icones
2. **Modal dedicado** para assistir clips individualmente
3. **Layout profissional** estilo portal esportivo premium
4. **Player principal diferenciado** com visual cinematico

## Mudancas Detalhadas

### 1. ClipsGallery - Cards com capas e modal

Reescrever `src/components/match-center/ClipsGallery.tsx`:
- Cada card usa a **thumbnail real** do evento como capa (imagem de fundo completa no aspect-video)
- Fallback para gradiente colorido por tipo de evento quando nao ha thumbnail
- Overlay com botao de play circular no hover
- Badge do minuto no canto superior
- Comentario de IA com tipografia grande e bem formatada abaixo da capa
- Ao clicar, abre um **Dialog modal** com o clip em vez de rolar para o video principal

### 2. ClipPlayerModal - Novo componente

Criar `src/components/match-center/ClipPlayerModal.tsx`:
- Modal fullscreen com fundo escuro (bg-black/90)
- Player de video centralizado com controles customizados (play/pause, volume, fullscreen, skip)
- Exibe tipo do evento, minuto e comentario de IA abaixo do player
- Botao de fechar no canto
- Responsivo: ocupa 95vw no mobile, max-w-4xl no desktop

### 3. FuturisticVideoPlayer - Visual cinematico

Aprimorar `src/components/match-center/FuturisticVideoPlayer.tsx`:
- Adicionar um gradiente lateral sutil nos cantos do player (vinheta cinematica)
- Barra de progresso mais grossa (h-2 em vez de h-1) com efeito glow na cor primary
- Playhead (bolinha) visivel no hover
- Marcadores de eventos na timeline com cores distintas e tooltip no hover
- Controles com hover mais pronunciado
- Manter as legendas SRT ja corrigidas (frase por frase)

### 4. MatchCenter page - Layout refinado

Atualizar `src/pages/MatchCenter.tsx`:
- Passar o estado do modal de clip (open/close/selectedClip) para ClipsGallery
- Highlights strip: usar thumbnails reais como capas em vez de icones, com fallback para emoji
- Melhorar espacamento e hierarquia visual

### 5. EventsFeed - Thumbnails nos eventos

Atualizar `src/components/match-center/EventsFeed.tsx`:
- Onde o evento tem thumbnail disponivel, exibir a capa miniatura (40x40) no lugar do icone quadrado
- Manter o icone emoji como fallback

## Arquivos a criar

| Arquivo | Descricao |
|---------|-----------|
| `src/components/match-center/ClipPlayerModal.tsx` | Modal dedicado para reproduzir clips com controles customizados |

## Arquivos a editar

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/match-center/ClipsGallery.tsx` | Cards com thumbnails reais, onClick abre modal |
| `src/components/match-center/FuturisticVideoPlayer.tsx` | Player com visual cinematico aprimorado |
| `src/pages/MatchCenter.tsx` | Estado do modal, passar thumbnails para EventsFeed |
| `src/components/match-center/EventsFeed.tsx` | Thumbnails nos eventos, props de thumbnails |

## Detalhes tecnicos

### ClipPlayerModal
- Usa `Dialog` do Radix com `DialogContent` customizado (max-w-4xl, p-0, bg-black)
- Video nativo com `<video>` e controles customizados similares ao FuturisticVideoPlayer
- Recebe `clipUrl`, `eventType`, `minute`, `aiComment`, `thumbnailUrl`
- URL normalizada com `normalizeStorageUrl`

### ClipsGallery com modal
- Estado local `selectedClipEvent` para controlar qual clip esta aberto no modal
- Cada card e um `div` clicavel com:
  - `aspect-video` com a imagem de thumbnail como `<img>` com `object-cover`
  - Overlay de play no hover (circulo branco semi-transparente com icone Play)
  - Badge do minuto posicionado absolutamente
- Abaixo da imagem: tipo do evento + comentario de IA com `text-base leading-relaxed`

### EventsFeed com thumbnails
- Receber `thumbnails` como prop
- No lugar do quadrado de 40x40 com emoji, se houver thumbnail para o evento, exibir `<img>` com `rounded-lg object-cover`
- Manter emoji como fallback

### Highlights strip
- Usar thumbnails reais nos botoes do strip horizontal
- `<img>` com `object-cover` preenchendo o `aspect-video`
- Fallback para emoji centralizado em fundo gradiente

