/**
 * Auto Team Logo - Busca, download e cache local de logos de times
 * 
 * Fluxo:
 * 1. Verifica se logo já existe no storage local (HEAD request)
 * 2. Busca em football-logos.cc via edge function
 * 3. Tenta fontes alternativas (Wikipedia para seleções)
 * 4. Baixa e armazena localmente via apiClient.uploadBlob
 */

import { supabase } from '@/integrations/supabase/client';
import { apiClient, buildApiUrl } from '@/lib/apiClient';
import { getApiBase } from '@/lib/apiMode';

interface LogoResult {
  name: string;
  shortName: string | null;
  slug: string;
  logoUrl: string;
}

export interface AutoLogoResult {
  logoUrl: string;
  shortName: string | null;
}

/**
 * Normaliza nome do time para uso como slug de arquivo
 */
export function normalizeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s-]/g, '')    // Remove caracteres especiais
    .replace(/\s+/g, '-')            // Espaços -> hífens
    .replace(/-+/g, '-')             // Múltiplos hífens -> um
    .replace(/^-|-$/g, '')           // Remove hífens nas pontas
    .trim();
}

/**
 * Normaliza texto para comparação fuzzy
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Verifica se logo já existe no storage local
 */
export async function checkLocalLogoExists(slug: string): Promise<string | null> {
  try {
    const url = buildApiUrl(getApiBase(), `/api/storage/teams/logos/${slug}.png`);
    const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      return url;
    }
  } catch {
    // Not found or server unavailable
  }
  return null;
}

/**
 * Baixa imagem de URL externa e salva no storage local
 */
async function downloadAndStore(imageUrl: string, slug: string): Promise<string> {
  const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`Failed to download: ${resp.status}`);
  
  const blob = await resp.blob();
  const result = await apiClient.uploadBlob('teams', 'logos', blob, `${slug}.png`);
  return result.url;
}

/**
 * Encontra a melhor correspondência entre nome do time e resultados
 */
function findBestMatch(teamName: string, logos: LogoResult[]): LogoResult | null {
  const normalized = normalizeForMatch(teamName);
  
  // 1. Correspondência exata
  for (const logo of logos) {
    if (normalizeForMatch(logo.name) === normalized) {
      return logo;
    }
  }
  
  // 2. Correspondência parcial - nome contém ou está contido
  for (const logo of logos) {
    const logoNorm = normalizeForMatch(logo.name);
    if (logoNorm.includes(normalized) || normalized.includes(logoNorm)) {
      return logo;
    }
    // Verificar short_name
    if (logo.shortName) {
      const shortNorm = normalizeForMatch(logo.shortName);
      if (shortNorm === normalized || shortNorm.includes(normalized) || normalized.includes(shortNorm)) {
        return logo;
      }
    }
  }
  
  // 3. Correspondência por palavras-chave (pelo menos 2 palavras em comum)
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  if (words.length >= 2) {
    let bestScore = 0;
    let bestLogo: LogoResult | null = null;
    
    for (const logo of logos) {
      const logoWords = normalizeForMatch(logo.name).split(/\s+/);
      const matches = words.filter(w => logoWords.some(lw => lw.includes(w) || w.includes(lw)));
      if (matches.length > bestScore) {
        bestScore = matches.length;
        bestLogo = logo;
      }
    }
    
    if (bestScore >= 2) return bestLogo;
  }
  
  return null;
}

// Países prioritários para busca de clubes
const PRIORITY_COUNTRIES = [
  'brazil', 'argentina', 'portugal', 'spain', 'england',
  'italy', 'germany', 'france', 'uruguay', 'colombia',
  'chile', 'mexico', 'netherlands', 'belgium',
];

// Mapeamento de nomes comuns de seleções para busca
const NATIONAL_TEAM_ALIASES: Record<string, { country: string; searchTerms: string[] }> = {
  'brasil': { country: 'brazil', searchTerms: ['brazil national', 'brasil'] },
  'selecao brasileira': { country: 'brazil', searchTerms: ['brazil national'] },
  'brazil': { country: 'brazil', searchTerms: ['brazil national'] },
  'argentina': { country: 'argentina', searchTerms: ['argentina national'] },
  'selecao argentina': { country: 'argentina', searchTerms: ['argentina national'] },
  'uruguai': { country: 'uruguay', searchTerms: ['uruguay national'] },
  'uruguay': { country: 'uruguay', searchTerms: ['uruguay national'] },
  'colombia': { country: 'colombia', searchTerms: ['colombia national'] },
  'chile': { country: 'chile', searchTerms: ['chile national'] },
  'paraguai': { country: 'paraguay', searchTerms: ['paraguay national'] },
  'paraguay': { country: 'paraguay', searchTerms: ['paraguay national'] },
  'peru': { country: 'peru', searchTerms: ['peru national'] },
  'equador': { country: 'ecuador', searchTerms: ['ecuador national'] },
  'ecuador': { country: 'ecuador', searchTerms: ['ecuador national'] },
  'venezuela': { country: 'venezuela', searchTerms: ['venezuela national'] },
  'bolivia': { country: 'bolivia', searchTerms: ['bolivia national'] },
  'portugal': { country: 'portugal', searchTerms: ['portugal national'] },
  'espanha': { country: 'spain', searchTerms: ['spain national'] },
  'spain': { country: 'spain', searchTerms: ['spain national'] },
  'inglaterra': { country: 'england', searchTerms: ['england national'] },
  'england': { country: 'england', searchTerms: ['england national'] },
  'italia': { country: 'italy', searchTerms: ['italy national'] },
  'italy': { country: 'italy', searchTerms: ['italy national'] },
  'alemanha': { country: 'germany', searchTerms: ['germany national'] },
  'germany': { country: 'germany', searchTerms: ['germany national'] },
  'franca': { country: 'france', searchTerms: ['france national'] },
  'france': { country: 'france', searchTerms: ['france national'] },
  'holanda': { country: 'netherlands', searchTerms: ['netherlands national'] },
  'netherlands': { country: 'netherlands', searchTerms: ['netherlands national'] },
  'belgica': { country: 'belgium', searchTerms: ['belgium national'] },
  'belgium': { country: 'belgium', searchTerms: ['belgium national'] },
  'mexico': { country: 'mexico', searchTerms: ['mexico national'] },
  'japao': { country: 'japan', searchTerms: ['japan national'] },
  'japan': { country: 'japan', searchTerms: ['japan national'] },
  'coreia do sul': { country: 'south-korea', searchTerms: ['south korea national'] },
  'south korea': { country: 'south-korea', searchTerms: ['south korea national'] },
};

/**
 * Busca logo em football-logos.cc via edge function
 */
async function searchFootballLogos(
  teamName: string, 
  countries?: string[]
): Promise<LogoResult | null> {
  const countriesToSearch = countries || PRIORITY_COUNTRIES;
  
  // Verificar se é seleção nacional primeiro
  const normalizedName = normalizeForMatch(teamName);
  const nationalAlias = NATIONAL_TEAM_ALIASES[normalizedName];
  
  if (nationalAlias) {
    // Buscar no país específico da seleção
    for (const searchTerm of nationalAlias.searchTerms) {
      try {
        const { data } = await supabase.functions.invoke('fetch-football-logos', {
          body: { mode: 'search', country: nationalAlias.country, query: searchTerm },
        });
        if (data?.success && data.logos?.length > 0) {
          const best = findBestMatch(searchTerm, data.logos);
          if (best) return best;
          // Se não encontrou match exato, pegar o primeiro que tenha "national"
          const national = data.logos.find((l: LogoResult) => 
            normalizeForMatch(l.name).includes('national')
          );
          if (national) return national;
        }
      } catch (err) {
        console.warn(`[AutoLogo] Erro buscando seleção ${nationalAlias.country}:`, err);
      }
    }
  }
  
  // Buscar em países prioritários
  for (const country of countriesToSearch) {
    try {
      const { data } = await supabase.functions.invoke('fetch-football-logos', {
        body: { mode: 'search', country, query: teamName },
      });
      
      if (data?.success && data.logos?.length > 0) {
        const best = findBestMatch(teamName, data.logos);
        if (best) {
          console.log(`[AutoLogo] Encontrado "${best.name}" em ${country}`);
          return best;
        }
      }
    } catch (err) {
      console.warn(`[AutoLogo] Erro buscando em ${country}:`, err);
    }
  }
  
  return null;
}

/**
 * Busca principal - verifica cache local, depois busca online e armazena
 */
export async function autoFetchTeamLogo(teamName: string): Promise<AutoLogoResult | null> {
  if (!teamName?.trim()) return null;
  
  const slug = normalizeSlug(teamName);
  console.log(`[AutoLogo] Buscando logo para "${teamName}" (slug: ${slug})`);
  
  // 1. Verificar cache local
  const localUrl = await checkLocalLogoExists(slug);
  if (localUrl) {
    console.log(`[AutoLogo] ✅ Logo já existe localmente: ${slug}`);
    return { logoUrl: localUrl, shortName: null };
  }
  
  // 2. Buscar em football-logos.cc
  const found = await searchFootballLogos(teamName);
  if (found) {
    try {
      const storedUrl = await downloadAndStore(found.logoUrl, slug);
      console.log(`[AutoLogo] ✅ Logo baixada e armazenada: ${slug}`);
      return { logoUrl: storedUrl, shortName: found.shortName };
    } catch (err) {
      console.warn(`[AutoLogo] Falha ao baixar logo, usando URL externa:`, err);
      // Fallback: usar URL externa diretamente
      return { logoUrl: found.logoUrl, shortName: found.shortName };
    }
  }
  
  console.log(`[AutoLogo] ❌ Nenhuma logo encontrada para "${teamName}"`);
  return null;
}

/**
 * Baixa logo de URL externa e armazena localmente
 * Usado por BulkImport e LogoSearchDialog
 */
export async function downloadLogoToLocal(
  externalUrl: string, 
  teamName: string
): Promise<string> {
  const slug = normalizeSlug(teamName);
  
  // Verificar se já existe
  const existing = await checkLocalLogoExists(slug);
  if (existing) return existing;
  
  // Baixar e armazenar
  return await downloadAndStore(externalUrl, slug);
}
