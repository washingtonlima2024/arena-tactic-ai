
# Levantamento: Falhas de Controle de Acesso por Role

## Problema Identificado

Um usuario com role "Espectador" (viewer, nivel 20) conseguiu subir um video. Isso ocorre porque **nenhuma rota tem restricao de permissao** -- o componente `RequireAuth` ja suporta props como `requireUploader`, `requireManager`, `requireAdmin`, mas elas **nao estao sendo usadas em nenhuma rota**.

## Diagnostico Completo

### 1. Rotas sem Restricao (App.tsx)

Todas as rotas usam apenas `<RequireAuth>` sem nenhuma prop de permissao:

| Rota | Restricao Atual | Restricao Necessaria | Problema |
|------|-----------------|---------------------|----------|
| `/upload` | Apenas login | `requireUploader` (nivel 40+) | **Espectador consegue fazer upload** |
| `/live` | Apenas login | `requireUploader` (nivel 40+) | Espectador pode iniciar transmissao ao vivo |
| `/live/config` | Apenas login | `requireUploader` (nivel 40+) | Espectador pode configurar stream |
| `/social` | Apenas login | `requireUploader` (nivel 40+) | Espectador pode agendar posts |
| `/settings` | Apenas login | `requireManager` (nivel 60+) | Espectador pode alterar configuracoes |
| `/admin` | Apenas login (verifica internamente) | `requireAdmin` (nivel 80+) | Rota carrega e so depois bloqueia |
| `/home` | Apenas login | OK - todos podem ver | -- |
| `/matches` | Apenas login | OK - todos podem ver | -- |
| `/analysis` | Apenas login | OK - visualizacao | -- |
| `/dashboard` | Apenas login | OK - visualizacao | -- |
| `/events` | Apenas login | OK - visualizacao | -- |
| `/media` | Apenas login | OK - visualizacao | -- |
| `/audio` | Apenas login | OK - visualizacao | -- |
| `/field` | Apenas login | OK - visualizacao | -- |
| `/viewer` | Apenas login | OK - visualizacao | -- |

### 2. Menu Lateral sem Restricao (Sidebar.tsx e MobileNav.tsx)

O menu mostra **todos os itens** para todos os usuarios, incluindo "Importar Video" e "Redes Sociais" para Espectadores. Apenas o menu "Administracao" e filtrado por `isAdmin`.

### 3. Admin usa `isAdmin` em vez de `isSuperAdmin`

Segundo as regras de RBAC definidas, a pagina Admin deveria ser restrita a **SuperAdmin (nivel 100)**, mas usa `isAdmin` (nivel 80+), permitindo que Admin Empresa tambem acesse.

## Plano de Correcao

### Etapa 1: Adicionar restricoes nas rotas (App.tsx)

Aplicar as props corretas de permissao no `RequireAuth`:

```typescript
// Rotas que exigem nivel Operador (40+)
<Route path="/upload" element={<RequireAuth requireUploader><Upload /></RequireAuth>} />
<Route path="/live" element={<RequireAuth requireUploader><Live /></RequireAuth>} />
<Route path="/live/config" element={<RequireAuth requireUploader><LiveConfig /></RequireAuth>} />
<Route path="/social" element={<RequireAuth requireUploader><Social /></RequireAuth>} />

// Rotas que exigem nivel Gerente (60+)
<Route path="/settings" element={<RequireAuth requireManager><Settings /></RequireAuth>} />

// Rota Admin - exigir SuperAdmin
<Route path="/admin" element={<RequireAuth requireSuperAdmin><Admin /></RequireAuth>} />
```

### Etapa 2: Filtrar itens do menu por permissao (Sidebar.tsx)

Separar os itens de navegacao em categorias de permissao e filtrar baseado no role do usuario:

```typescript
// Itens visiveis para todos (Espectador+)
const viewerItems = [
  { icon: LayoutDashboard, label: 'Inicio', path: '/home' },
  { icon: Video, label: 'Partidas', path: '/matches' },
  { icon: BarChart3, label: 'Analise Tatica', path: '/analysis' },
  { icon: Layers, label: 'Dashboard Analise', path: '/dashboard' },
  { icon: Calendar, label: 'Eventos', path: '/events' },
  { icon: Scissors, label: 'Cortes & Midia', path: '/media' },
  { icon: Mic, label: 'Podcast & Locucao', path: '/audio' },
  { icon: Ruler, label: 'Campo FIFA', path: '/field' },
];

// Itens visiveis para Operador+ (nivel 40+)
const uploaderItems = [
  { icon: Upload, label: 'Importar Video', path: '/upload?mode=new' },
  { icon: Radio, label: 'Ao Vivo', path: '/live' },
  { icon: Share2, label: 'Redes Sociais', path: '/social' },
];

// Itens visiveis para Gerente+ (nivel 60+)
const managerItems = [
  { icon: Settings, label: 'Configuracoes', path: '/settings' },
];
```

### Etapa 3: Aplicar o mesmo filtro no MobileNav.tsx

Replicar a mesma logica de filtragem no menu mobile.

### Etapa 4: Corrigir Admin para usar `isSuperAdmin`

Alterar `Admin.tsx` para verificar `isSuperAdmin` em vez de `isAdmin`, alinhando com as regras RBAC definidas.

## Resumo das Permissoes por Role

```text
Pagina              | Espectador | Operador | Gerente | Admin Org | SuperAdmin
--------------------|------------|----------|---------|-----------|----------
Inicio, Partidas    |     ✓      |    ✓     |    ✓    |     ✓     |     ✓
Analise, Eventos    |     ✓      |    ✓     |    ✓    |     ✓     |     ✓
Midia, Audio, Campo |     ✓      |    ✓     |    ✓    |     ✓     |     ✓
Importar Video      |     ✗      |    ✓     |    ✓    |     ✓     |     ✓
Ao Vivo             |     ✗      |    ✓     |    ✓    |     ✓     |     ✓
Redes Sociais       |     ✗      |    ✓     |    ✓    |     ✓     |     ✓
Configuracoes       |     ✗      |    ✗     |    ✓    |     ✓     |     ✓
Administracao       |     ✗      |    ✗     |    ✗    |     ✗     |     ✓
```

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|----------|
| `src/App.tsx` | Adicionar props de permissao nas rotas |
| `src/components/layout/Sidebar.tsx` | Filtrar itens do menu por role |
| `src/components/layout/MobileNav.tsx` | Filtrar itens do menu por role |
| `src/pages/Admin.tsx` | Trocar `isAdmin` por `isSuperAdmin` |

## Ordem de Execucao

1. Corrigir `App.tsx` -- adicionar restricoes de rota (impacto imediato)
2. Corrigir `Sidebar.tsx` -- esconder itens do menu conforme role
3. Corrigir `MobileNav.tsx` -- mesma logica para mobile
4. Corrigir `Admin.tsx` -- usar `isSuperAdmin` no lugar de `isAdmin`
