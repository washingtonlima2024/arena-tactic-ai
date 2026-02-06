

# Correcao de Overflow Mobile - Layout 100% Responsivo

## Problema

Varias telas estao estourando a largura no mobile, causando scroll horizontal indesejado. Isso ocorre por uso de larguras fixas em pixels (`w-[200px]`, `max-w-[200px]`), grids rigidos, textos grandes sem reducao, e elementos flex sem controle de overflow.

## Diagnostico Detalhado

### 1. Layout Global (AppLayout.tsx)
- **Falta `overflow-x-hidden`** no container raiz -- qualquer filho que estoure cria scroll horizontal na pagina inteira.

### 2. Pagina Analysis (`Analysis.tsx`)
- **Header com badges em linha (L378)**: `flex items-center gap-3` com titulo `text-3xl` + 2 badges na mesma linha -- estoura no mobile.
- **Botoes de acao (L396-450)**: `flex gap-2` com 3 botoes ("Reimportar Videos", "Gerar Clips", "Exportar Relatorio") -- texto completo nao cabe no mobile.
- **Grid de estatisticas (L546)**: `grid-cols-[1fr,2fr,1fr] gap-4` -- o gap de 16px + texto `text-lg` estoura.
- **Audio controls (L662)**: `max-w-[200px]` fixo no elemento `<audio>` pode nao caber ao lado de outros elementos.
- **Narration card (L644)**: Layout `flex items-center gap-4` com 4 elementos em linha (icone + texto + audio + botao) estoura facilmente.
- **Tab triggers (L678-683)**: Texto "Insights (X)", "Padroes Taticos (X)", "Eventos (X)" - trunca ou estoura em mobile.
- **Dialog de video (L905)**: `max-w-4xl` sem ajuste mobile.

### 3. Pagina Events (`Events.tsx`)
- **Event row (L112)**: `flex items-center gap-3 p-3` com thumbnail + avatar + badge + texto + badges + botao -- muitos elementos em linha.
- **Scoreboard (L1031)**: Score `text-5xl font-black w-14` -- largura fixa.
- **Action buttons (L1076)**: `flex flex-wrap gap-2` com multiplos botoes com texto completo.
- **Selects com largura fixa (L1020, L1035)**: `w-[140px]` -- pode conflitar em telas estreitas.

### 4. Pagina Audio (`Audio.tsx`)
- **Header (L369)**: Titulo `text-3xl` sem reducao mobile.
- **Tab list (L403)**: `grid-cols-4` com texto + icone em cada tab -- 4 colunas podem ficar muito estreitas.
- **Grid de stats (L524)**: `grid grid-cols-3` com texto `text-2xl` -- pode estourar.

### 5. Pagina Admin (`Admin.tsx`)
- **Tab list (L54)**: `grid-cols-6` -- 6 colunas e extremamente apertado no mobile.

### 6. Pagina Social (`Social.tsx`)
- **Tab list (L365)**: `grid-cols-4` com texto + icone.

### 7. Pagina MatchDashboard (`MatchDashboard.tsx`)
- **Selects (L1020, L1035)**: `w-[140px]` fixo.

### 8. Pagina Index (`Index.tsx`)
- **Select de gol (L302)**: `w-[180px]` fixo.

## Plano de Correcao

### Etapa 1: Protecao Global contra Overflow

Adicionar `overflow-x-hidden` e `max-w-full` no `AppLayout.tsx` e `index.css` para evitar que qualquer overflow filho cause scroll horizontal.

**Arquivo: `src/components/layout/AppLayout.tsx`**
- Adicionar `overflow-x-hidden` na div raiz e no container principal.

**Arquivo: `src/index.css`**
- Adicionar regra global `html, body { overflow-x: hidden; max-width: 100vw; }`.

### Etapa 2: Pagina Analysis

**Arquivo: `src/pages/Analysis.tsx`**

| Linha | Problema | Correcao |
|-------|----------|----------|
| 378-390 | Titulo + badges em 1 linha | `flex flex-wrap gap-2`, titulo `text-xl sm:text-3xl`, badges em linha separada no mobile |
| 396-450 | 3 botoes com texto | Mobile: icon-only. Desktop: icon + texto |
| 546 | Grid `gap-4` | Reduzir para `gap-2 sm:gap-4` |
| 644-669 | Audio card 4 itens em linha | Mobile: stack vertical. Desktop: horizontal |
| 662 | Audio `max-w-[200px]` | `w-full sm:max-w-[200px]` |
| 678-683 | Tab labels longos | Mobile: apenas contagem. Desktop: texto completo |
| 905 | Dialog `max-w-4xl` | `max-w-[95vw] sm:max-w-4xl` |

### Etapa 3: Pagina Events

**Arquivo: `src/pages/Events.tsx`**

| Linha | Problema | Correcao |
|-------|----------|----------|
| 112 | Event row muitos itens em flex | Esconder elementos menos importantes no mobile (`hidden sm:flex`) |
| 1031 | Score `text-5xl w-14` | `text-3xl sm:text-5xl w-10 sm:w-14` |
| 1020/1035 | Select `w-[140px]` | `w-full sm:w-[140px]` dentro de container flex-wrap |
| 1076 | Botoes com texto longo | Mobile: icon-only |

### Etapa 4: Pagina Audio

**Arquivo: `src/pages/Audio.tsx`**

| Linha | Problema | Correcao |
|-------|----------|----------|
| 369 | `text-3xl` | `text-xl sm:text-3xl` |
| 403 | TabsList `grid-cols-4` | `grid-cols-2 sm:grid-cols-4` (2 linhas no mobile) |
| 524 | Grid stats `text-2xl` | `text-lg sm:text-2xl` |

### Etapa 5: Pagina Admin

**Arquivo: `src/pages/Admin.tsx`**

| Linha | Problema | Correcao |
|-------|----------|----------|
| 54 | `grid-cols-6` | `grid-cols-3 sm:grid-cols-6` (2 linhas no mobile) |

### Etapa 6: Pagina Social

**Arquivo: `src/pages/Social.tsx`**

| Linha | Problema | Correcao |
|-------|----------|----------|
| 365 | `grid-cols-4` | `grid-cols-2 sm:grid-cols-4` |

### Etapa 7: Pagina MatchDashboard

**Arquivo: `src/pages/MatchDashboard.tsx`**

| Linha | Problema | Correcao |
|-------|----------|----------|
| 1020/1035 | Select `w-[140px]` | `w-full sm:w-[140px]` |

### Etapa 8: Pagina Index

**Arquivo: `src/pages/Index.tsx`**

| Linha | Problema | Correcao |
|-------|----------|----------|
| 302 | Select `w-[180px]` | `w-full sm:w-[180px]` |

## Principios Aplicados

1. **Nunca largura fixa sem fallback**: Todo `w-[Xpx]` vira `w-full sm:w-[Xpx]`
2. **Tipografia responsiva**: `text-xl sm:text-3xl` em vez de `text-3xl` fixo
3. **Icone-only no mobile**: Botoes com texto longo usam `hidden sm:inline` no label
4. **Tabs empilhados**: TabsLists com 4+ colunas usam `grid-cols-2 sm:grid-cols-4`
5. **Overflow global**: Protecao `overflow-x-hidden` em html/body/layout raiz
6. **Gap responsivo**: `gap-2 sm:gap-4` em vez de `gap-4` fixo
7. **Percentual sobre pixel**: Usar `%` e `w-full` como base, pixel como refinamento desktop

## Arquivos a Modificar

| Arquivo | Prioridade |
|---------|-----------|
| `src/index.css` | Alta - protecao global |
| `src/components/layout/AppLayout.tsx` | Alta - container raiz |
| `src/pages/Analysis.tsx` | Alta - pagina atual do usuario |
| `src/pages/Events.tsx` | Alta - pagina frequente |
| `src/pages/Audio.tsx` | Media |
| `src/pages/Admin.tsx` | Media |
| `src/pages/Social.tsx` | Media |
| `src/pages/MatchDashboard.tsx` | Media |
| `src/pages/Index.tsx` | Baixa |

## Ordem de Execucao

1. `index.css` + `AppLayout.tsx` -- protecao global
2. `Analysis.tsx` -- pagina com mais problemas e a atual do usuario
3. `Events.tsx` -- segunda pagina mais critica
4. `Audio.tsx`, `Admin.tsx`, `Social.tsx` -- ajustes de tabs e tipografia
5. `MatchDashboard.tsx`, `Index.tsx` -- larguras fixas em selects

