
# Redesign Mobile-First dos Cards de Clip na pagina Media

## Problema Atual

Os botoes de acao no card de clip ("Reproduzir", "Preview", "Compartilhar" + Excluir) estao todos em uma unica linha horizontal com `flex-1`, causando:
- Texto cortado/comprimido em telas pequenas
- Botoes muito estreitos que dificultam o toque
- Layout desconfortavel no mobile

Alem disso, o card inteiro precisa de ajustes para ser mais moderno e otimizado para mobile.

## Solucao Proposta

### 1. Botoes de Acao Responsivos no Card de Clip

**Mobile (< 768px):**
- Usar apenas icones nos botoes (sem texto), organizados em uma barra de acoes compacta e elegante
- Tooltip ou titulo acessivel para identificar cada acao
- Botoes com alvos de toque maiores (min 44x44px)
- Layout em grid 2x2 ou barra horizontal com icones uniformes

**Desktop (>= 768px):**
- Manter texto + icone como esta hoje
- Layout em linha horizontal com `flex-1`

### 2. Melhorias no Card de Clip (Mobile-First)

- Titulo (`h3`) com `truncate` em vez de cortar palavras -- nunca quebrar palavras no meio
- Descricao com `line-clamp-2` (ja existente, manter)
- Badges no topo do card menores em mobile
- Remover `mr-1` do icone nos botoes mobile (apenas icone, sem espaco desperdicado)

### 3. Barra de Acoes Moderna para Mobile

Criar uma barra de acoes estilizada:

```text
Mobile:
+---+---+---+---+---+
| > | [] | <> | x  |  (icones grandes, sem texto)
+---+---+---+---+---+

Desktop:
[> Reproduzir] [[] Preview] [<> Compartilhar] [x]
```

## Detalhes Tecnicos

### Arquivo: `src/pages/Media.tsx` (linhas 1054-1123)

Substituir a div de botoes (linha 1061-1123) por um layout responsivo:

```typescript
{/* Barra de acoes - Mobile: icones | Desktop: icones + texto */}
<div className="mt-3 flex items-center gap-1.5 sm:gap-2">
  {/* Gerar Capa - condicional */}
  {!thumbnail?.imageUrl && !isExtractingFrame && clip.clipUrl && (
    <Button variant="outline" size="sm" className="flex-1 sm:flex-initial" onClick={handleExtractFrame} title="Gerar Capa">
      <Film className="h-4 w-4 sm:mr-1.5 sm:h-3 sm:w-3" />
      <span className="hidden sm:inline">Capa</span>
    </Button>
  )}
  
  {/* Reproduzir */}
  {(clip.clipUrl || matchVideo) && (
    <Button variant="outline" size="sm" className="flex-1" onClick={handlePlayClip} title="Reproduzir">
      <Play className="h-4 w-4 sm:mr-1.5 sm:h-3 sm:w-3" />
      <span className="hidden sm:inline">Reproduzir</span>
    </Button>
  )}
  
  {/* Preview/Editor */}
  {(clip.clipUrl || clip.canExtract) && (
    <Button variant="outline" size="sm" className="flex-1" onClick={() => setPreviewClipId(clip.id)} title="Preview">
      <Smartphone className="h-4 w-4 sm:mr-1.5 sm:h-3 sm:w-3" />
      <span className="hidden sm:inline">{clip.clipUrl ? 'Preview' : 'Editor'}</span>
    </Button>
  )}
  
  {/* Compartilhar */}
  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShareClipId(clip.id)} disabled={!clip.clipUrl} title="Compartilhar">
    <Share2 className="h-4 w-4 sm:mr-1.5 sm:h-3 sm:w-3" />
    <span className="hidden sm:inline">Compartilhar</span>
  </Button>
  
  {/* Excluir */}
  <Button variant="ghost" size="icon-sm" className="shrink-0 text-destructive" onClick={() => handleDeleteClip(clip.id, clip.title)} title="Excluir">
    <Trash2 className="h-4 w-4" />
  </Button>
</div>
```

### Ajustes no titulo do card

```typescript
<CardContent className="pt-3 pb-3 px-3 sm:pt-4 sm:px-4">
  <h3 className="font-medium text-sm sm:text-base truncate">{clip.title}</h3>
  {clip.description && (
    <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground line-clamp-1 sm:line-clamp-2">
      {clip.description}
    </p>
  )}
  ...
</CardContent>
```

### Ajuste no grid de cards

O grid atual `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` esta bom, mas o gap pode ser reduzido em mobile:

```typescript
<div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
```

### Ajustes na area de badges do card (topo da thumbnail)

Reduzir tamanho dos badges em mobile para nao cobrir a thumbnail:

```typescript
<div className="absolute left-1.5 top-1.5 sm:left-2 sm:top-2 flex gap-1 flex-wrap max-w-[80%]">
  <Badge variant="arena" className="text-[10px] sm:text-xs">{clip.type}</Badge>
  ...
</div>
```

### Ajustes na area de info inferior do header da pagina

O header "Cortes & Midia" com contadores e botoes tambem precisa de ajuste mobile:
- Esconder contadores detalhados em mobile
- Manter apenas o essencial

## Resumo dos Arquivos a Modificar

| Arquivo | O que muda |
|---------|-----------|
| `src/pages/Media.tsx` | Botoes responsivos (icone-only em mobile), titulo truncado, badges menores, grid gap ajustado |

## Principios Aplicados

1. **Mobile-First**: Tudo projetado primeiro para mobile, expandido para desktop
2. **Nunca cortar palavras**: Usar `truncate` (elipsis) em vez de quebrar no meio
3. **Alvos de toque**: Minimo 44px para areas tocaveis em mobile
4. **Icones sem texto em mobile**: Quando nao ha espaco, apenas icone com `title` acessivel
5. **Layout moderno**: Espacamento consistente, feedback visual de toque
