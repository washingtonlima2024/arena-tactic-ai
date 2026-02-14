

# Auto-Download de Logos com Cache Local e Fontes Alternativas

## Resumo

Criar um sistema que automaticamente busca, baixa e armazena logos de times no storage local (`video-processor/storage/logos/`), usando o nome do time como identificador para evitar downloads duplicados. Adicionar fontes alternativas alem do football-logos.cc para cobrir selecoes nacionais e times nao encontrados.

## Alteracoes

### 1. Novo arquivo: `src/lib/autoTeamLogo.ts`

Funcao utilitaria reutilizavel que:

- Recebe nome do time e retorna `{ logoUrl, shortName } | null`
- **Verifica cache local primeiro**: checa se ja existe arquivo em `storage/logos/{nome-normalizado}.png` via `GET /api/storage/teams/logos/{slug}.png` (HEAD request para verificar existencia)
- Se ja existe, retorna URL local sem baixar novamente
- Se nao existe, busca em multiplas fontes na ordem:
  1. `fetch-football-logos` (football-logos.cc) - busca em brazil, argentina, portugal, spain, england, italy, germany, france
  2. **API alternativa**: Wikipedia/Wikimedia Commons via URL previsivel para selecoes e clubes famosos
  3. **Fallback**: Logo Clearbit (`https://logo.clearbit.com/{domain}`) para times com site oficial
- Ao encontrar, baixa como blob e faz upload via `apiClient.uploadBlob('teams', 'logos', blob, '{slug}.png')`
- Retorna URL local armazenada

```typescript
export async function autoFetchTeamLogo(teamName: string): Promise<{
  logoUrl: string;
  shortName: string | null;
} | null> {
  const slug = normalizeSlug(teamName);
  
  // 1. Verificar se ja existe localmente
  try {
    const checkUrl = buildApiUrl(getApiBase(), `/api/storage/teams/logos/${slug}.png`);
    const headResp = await fetch(checkUrl, { method: 'HEAD' });
    if (headResp.ok) {
      return { logoUrl: checkUrl, shortName: null };
    }
  } catch {}
  
  // 2. Buscar no football-logos.cc via edge function
  const countries = ['brazil', 'argentina', 'portugal', 'spain', 'england', ...];
  for (const country of countries) {
    const { data } = await supabase.functions.invoke('fetch-football-logos', {
      body: { mode: 'search', country, query: teamName },
    });
    if (data?.success && data.logos?.length > 0) {
      const best = findBestMatch(teamName, data.logos);
      if (best) {
        const localUrl = await downloadAndStore(best.logoUrl, slug);
        return { logoUrl: localUrl, shortName: best.shortName };
      }
    }
  }
  
  // 3. Tentar fontes alternativas (Wikipedia, etc)
  const altUrl = await tryAlternativeSources(teamName, slug);
  if (altUrl) return { logoUrl: altUrl, shortName: null };
  
  return null;
}
```

### 2. Modificar `supabase/functions/fetch-football-logos/index.ts`

Adicionar um modo `'national'` que busca logos de selecoes nacionais. O site football-logos.cc ja tem selecoes listadas junto com clubes, mas adicionar tambem busca direta por nomes como "Brasil", "Argentina", "Selecao Brasileira" mapeando para o slug correto.

Adicionar mapeamento de nomes comuns de selecoes:
```typescript
const NATIONAL_TEAM_ALIASES: Record<string, string> = {
  'brasil': 'brazil-national-team',
  'selecao brasileira': 'brazil-national-team',
  'argentina': 'argentina-national-team',
  'selecao argentina': 'argentina-national-team',
  // ... mais selecoes
};
```

### 3. Modificar `src/hooks/useTeams.ts` - `useCreateTeam`

No `onSuccess`, disparar `autoFetchTeamLogo` em background (nao-bloqueante):

```typescript
onSuccess: async (newTeam) => {
  queryClient.invalidateQueries({ queryKey: ['teams'] });
  
  if (newTeam?.name && !newTeam?.logo_url) {
    autoFetchTeamLogo(newTeam.name).then(async (result) => {
      if (result) {
        await apiClient.updateTeam(newTeam.id, {
          logo_url: result.logoUrl,
          short_name: result.shortName || newTeam.short_name,
        });
        queryClient.invalidateQueries({ queryKey: ['teams'] });
      }
    }).catch(console.warn);
  }
}
```

Isso cobre automaticamente:
- SmartImport (que chama `createTeamMutation.mutateAsync`)
- Criacao manual de time
- Qualquer outro lugar que use `useCreateTeam`

### 4. Modificar `src/components/teams/BulkImportTeamsDialog.tsx`

Na funcao `handleImport`, baixar cada logo para storage local antes de importar:

```typescript
for (const l of selected) {
  let logoUrl = l.logoUrl;
  try {
    const slug = l.slug || l.name.toLowerCase().replace(/\s+/g, '-');
    // Verificar se ja existe
    const checkResp = await fetch(
      buildApiUrl(getApiBase(), `/api/storage/teams/logos/${slug}.png`),
      { method: 'HEAD' }
    );
    if (checkResp.ok) {
      logoUrl = buildApiUrl(getApiBase(), `/api/storage/teams/logos/${slug}.png`);
    } else {
      const resp = await fetch(l.logoUrl);
      const blob = await resp.blob();
      const result = await apiClient.uploadBlob('teams', 'logos', blob, `${slug}.png`);
      logoUrl = result.url;
    }
  } catch { /* fallback: URL externa */ }
  
  teamsToImport.push({ name: l.name, short_name: l.shortName, logo_url: logoUrl });
}
```

### 5. Modificar `src/components/teams/LogoSearchDialog.tsx`

No `onSelect`, baixar logo para storage local:

```typescript
const handleSelect = async (logo: LogoResult) => {
  try {
    const slug = logo.slug || logo.name.toLowerCase().replace(/\s+/g, '-');
    const response = await fetch(logo.logoUrl);
    const blob = await response.blob();
    const result = await apiClient.uploadBlob('teams', 'logos', blob, `${slug}.png`);
    onSelect({ name: logo.name, shortName: logo.shortName, logoUrl: result.url });
  } catch {
    onSelect({ name: logo.name, shortName: logo.shortName, logoUrl: logo.logoUrl });
  }
  onOpenChange(false);
};
```

### 6. Endpoint no servidor Python (video-processor/server.py)

O endpoint `POST /api/storage/<match_id>/<subfolder>` ja funciona para qualquer `match_id`. Usando `match_id='teams'` e `subfolder='logos'`, os arquivos ficam em `storage/teams/logos/`. Nao precisa de alteracao no servidor -- o endpoint generico ja suporta isso.

## Fontes de Logo (ordem de prioridade)

1. **Cache local** (`storage/teams/logos/{slug}.png`) - verificacao HEAD antes de qualquer busca
2. **football-logos.cc** (via edge function existente) - clubes e selecoes de 180+ paises
3. **Wikipedia/Wikimedia** - URLs previsiveis para selecoes (`https://upload.wikimedia.org/...`) 
4. **Fallback UI** - circulo com cor primaria do time + iniciais (ja implementado)

## Fluxo SmartImport (exemplo)

```text
1. SmartImport detecta "Flamengo vs Palmeiras"
2. createTeamMutation("Flamengo") -> time criado sem logo
3. [background] autoFetchTeamLogo("Flamengo")
   -> HEAD /api/storage/teams/logos/flamengo.png -> 404
   -> busca football-logos.cc/brazil?query=flamengo -> encontra!
   -> fetch imagem -> upload para storage/teams/logos/flamengo.png
   -> updateTeam(logo_url: "/api/storage/teams/logos/flamengo.png")
4. Proximo import com "Flamengo":
   -> HEAD /api/storage/teams/logos/flamengo.png -> 200 (ja existe!)
   -> usa URL local sem baixar novamente
```

## Arquivos a Criar/Modificar

1. **NOVO: `src/lib/autoTeamLogo.ts`** - Funcao de auto-busca com cache e fontes alternativas
2. **`supabase/functions/fetch-football-logos/index.ts`** - Aliases de selecoes nacionais
3. **`src/hooks/useTeams.ts`** - Disparar auto-busca no onSuccess do useCreateTeam
4. **`src/components/teams/BulkImportTeamsDialog.tsx`** - Download local com verificacao de cache
5. **`src/components/teams/LogoSearchDialog.tsx`** - Download local ao selecionar

