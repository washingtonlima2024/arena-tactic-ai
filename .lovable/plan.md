
# Corrigir URLs Quebradas das Logos de Times

## Causa Raiz

A funcao `buildLogoUrl` na edge function `fetch-football-logos` constroi URLs usando o hash completo (72 caracteres) do campo `h` dos Astro props. Porem, o site football-logos.cc usa apenas **8 caracteres** do hash, especificamente `hash.slice(32, 40)` para imagens 256x256.

**URL gerada (quebrada):**
`brazil-national-team.52842f3d85d32216caceec49004213f2fd8ca234b1d7c3ce33ef5cfe6843ffa0da85c6e1.png`

**URL correta (funciona):**
`brazil-national-team.fd8ca234.png` (caracteres 32-39 do hash)

O hash completo na verdade contem os hashes de cada tamanho concatenados em blocos de 8 caracteres:
- index 0 (3000): `hash.slice(0,8)`
- index 1 (1500): `hash.slice(8,16)`
- index 2 (700): `hash.slice(16,24)`
- index 3 (512): `hash.slice(24,32)`
- index 4 (256): `hash.slice(32,40)` -- este e o que precisamos
- index 5 (128): `hash.slice(40,48)`
- index 6 (64): `hash.slice(48,56)`
- index 7 (svg): `hash.slice(64,72)`

## Correcao

### 1. `supabase/functions/fetch-football-logos/index.ts` - Corrigir `buildLogoUrl`

Alterar a funcao de construcao de URL para usar o slice correto do hash:

**Antes:**
```typescript
function buildLogoUrl(categoryId: string, id: string, hash: string): string {
  return `https://assets.football-logos.cc/logos/${categoryId}/256x256/${id}.${hash}.png`;
}
```

**Depois:**
```typescript
function buildLogoUrl(categoryId: string, id: string, hash: string): string {
  // O hash completo contem hashes por tamanho em blocos de 8 chars
  // 256x256 esta no index 4 -> slice(32, 40)
  const shortHash = hash.slice(32, 40);
  return `https://assets.football-logos.cc/logos/${categoryId}/256x256/${id}.${shortHash}.png`;
}
```

Tambem remover a propriedade `countryName` duplicada no objeto de retorno de `fetchLogos` (linha 178 tem `countryName` duas vezes).

### 2. `src/components/teams/TeamBadge.tsx` - Fallback com cor do time

Adicionar estado `imgError` para que, se a logo falhar ao carregar, mostre um circulo com a cor primaria do time e as iniciais:

```typescript
const [imgError, setImgError] = useState(false);

if (logoUrl && !imgError) {
  return (
    <img 
      src={logoUrl} 
      alt={team.name}
      onError={() => setImgError(true)}
      className={...}
    />
  );
}
// Fallback existente com circulo colorido + iniciais
```

### 3. `src/components/teams/TeamCard.tsx` - Fallback com cor do time

Adicionar estado `imgError` para que a logo quebrada mostre as iniciais com cor:

```typescript
const [imgError, setImgError] = useState(false);

{team.logo_url && !imgError ? (
  <img 
    src={team.logo_url} 
    alt={team.name}
    onError={() => setImgError(true)}
    className="h-12 w-12 object-contain"
  />
) : (
  team.short_name?.slice(0, 2) || team.name.slice(0, 2)
)}
```

## Resultado

- Todas as URLs de logo vao funcionar corretamente (hash de 8 chars)
- Logos existentes que ainda estao com URL antiga vao mostrar fallback com cor do time
- Novos imports vao usar URLs corretas

## Arquivos a Modificar

1. **`supabase/functions/fetch-football-logos/index.ts`** - Corrigir `buildLogoUrl` (1 linha)
2. **`src/components/teams/TeamBadge.tsx`** - Adicionar `onError` fallback
3. **`src/components/teams/TeamCard.tsx`** - Adicionar `onError` fallback
