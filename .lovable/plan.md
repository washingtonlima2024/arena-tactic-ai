
## Análise do Problema

### Onde está a "tarja em inglês"

No `VideoPlayerModal.tsx` (linha 333-335), o header tem um Badge que exibe o tipo do evento em inglês bruto:
```tsx
<Badge variant="arena" className="uppercase tracking-wider text-xs">
  {clip.type.replace(/_/g, ' ')}  // ← "goal", "yellow card", "red card", etc.
</Badge>
```
Isso precisa usar `getEventLabel()` (que já converte para português) ou ser removido totalmente.

No `ClipPlayerModal.tsx` (usado pela galeria do Match Center), a barra de info já usa `getEventLabel(eventType)`, mas o texto do comentário está com `text-muted-foreground` (cinza), não branco.

---

## Mudanças Planejadas

### 1. `src/components/media/VideoPlayerModal.tsx`
- **Remover** o Badge com tipo em inglês do header (`clip.type.replace(/_/g, ' ')`)
- No lugar, usar `getEventLabel(clip.type)` em português, integrado visualmente no header existente (junto com o minuto)
- **Mover o comentário tático para dentro do vídeo**: adicionar um overlay semi-transparente na parte inferior do vídeo (sobre a `DeviceMockup`) exibindo o comentário com texto branco
- O comentário abaixo do clip: trocar `text-muted-foreground` por `text-white` e garantir que o texto exiba até 300 caracteres

### 2. `src/components/match-center/ClipPlayerModal.tsx`  
- Remover o trecho `getEventLabel(eventType)` duplicado na info bar (que já aparece junto com o ícone)
- Garantir que o `aiComment` exibido abaixo do vídeo use `text-white` com tamanho adequado (`text-base`) e exiba os ~300 caracteres sem truncamento
- Adicionar auto-geração de comentário quando não existir (igual ao `VideoPlayerModal`), usando o edge function `generate-event-comments`

### 3. `src/components/match-center/ClipsGallery.tsx`
- No card de cada clip (thumbnail preview), o comentário exibido abaixo usa `text-xs text-muted-foreground line-clamp-2` — manter `line-clamp-2` para o preview mas assegurar cor visível

---

## Detalhes Técnicos

### Overlay de comentário no vídeo (VideoPlayerModal)
O `DeviceMockup` envolve o conteúdo de vídeo. O comentário será adicionado **abaixo do player de vídeo** (na barra de controles existente), porém com cor branca e tamanho adequado para ~300 caracteres.

### Auto-geração no ClipPlayerModal (Match Center)
Atualmente o `ClipPlayerModal` não gera comentário automaticamente — só exibe se o `aiComment` vier como prop. Vamos adicionar lógica similar à do `VideoPlayerModal`:
- Ao abrir sem `aiComment`, chamar `supabase.functions.invoke('generate-event-comments')`
- Mostrar loader enquanto gera
- Exibir comentário em branco quando pronto

### Arquivos a editar
| Arquivo | Mudança |
|---|---|
| `src/components/media/VideoPlayerModal.tsx` | Remover Badge inglês; comentário em branco |
| `src/components/match-center/ClipPlayerModal.tsx` | Auto-gerar comentário; texto branco 300 chars |
