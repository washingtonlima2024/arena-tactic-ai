const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// In-memory cache with 30-minute TTL
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, timestamp: Date.now() });
}

interface LogoItem {
  name: string;
  shortName: string | null;
  slug: string;
  logoUrl: string;
  country: string;
  countryName: string;
}

interface CountryItem {
  id: string;
  name: string;
  emoji: string;
  count: number;
}

/**
 * Parse the Astro island props format.
 * The format uses nested arrays: [0, value] = scalar, [1, [...]] = array
 */
function parseAstroValue(val: unknown): unknown {
  if (!Array.isArray(val)) return val;
  const [type, data] = val;
  if (type === 0) return data;
  if (type === 1) {
    return (data as unknown[]).map(parseAstroValue);
  }
  return data;
}

function parseAstroObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = parseAstroValue(val);
  }
  return result;
}

function extractItemsFromHtml(html: string): Record<string, unknown>[] {
  // Find the astro-island component with SearchCardList
  // The props are in a props="..." attribute with HTML-encoded JSON
  const astroRegex = /astro-island[^>]*component-export="SearchCardList"[^>]*props="([^"]*)"/;
  const match = html.match(astroRegex);
  
  if (!match) {
    // Try alternative: look for props attribute containing "items"
    const altRegex = /props="(\{[^"]*&quot;items&quot;[^"]*)"/;
    const altMatch = html.match(altRegex);
    if (!altMatch) {
      console.log('No astro-island props found. HTML length:', html.length);
      console.log('HTML snippet:', html.substring(0, 500));
      return [];
    }
    return parsePropsString(altMatch[1]);
  }

  return parsePropsString(match[1]);
}

function parsePropsString(propsStr: string): Record<string, unknown>[] {
  try {
    // Decode HTML entities
    const decoded = propsStr
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'");

    const propsData = JSON.parse(decoded);
    
    // Extract items array: propsData.items is [1, [[0, {...}], [0, {...}], ...]]
    const itemsRaw = propsData.items;
    if (!itemsRaw || !Array.isArray(itemsRaw) || itemsRaw[0] !== 1) {
      console.log('Items not in expected format:', JSON.stringify(itemsRaw)?.substring(0, 200));
      return [];
    }

    const items = (itemsRaw[1] as unknown[]).map((item: unknown) => {
      if (Array.isArray(item) && item[0] === 0) {
        return parseAstroObject(item[1] as Record<string, unknown>);
      }
      return null;
    }).filter(Boolean) as Record<string, unknown>[];

    console.log(`Parsed ${items.length} items from props`);
    return items;
  } catch (e) {
    console.error('Failed to parse props:', e);
    return [];
  }
}

function buildLogoUrl(categoryId: string, id: string, hash: string): string {
  // Hash contains size-specific hashes in 8-char blocks; index 4 (slice 32-40) = 256x256
  const shortHash = hash.slice(32, 40);
  return `https://assets.football-logos.cc/logos/${categoryId}/256x256/${id}.${shortHash}.png`;
}

function extractShortName(name: string): string | null {
  // Try to extract nickname from parentheses: "América Mineiro (Coelho)" -> "Coelho"
  const parenMatch = name.match(/\(([^)]+)\)/);
  if (parenMatch) {
    return parenMatch[1];
  }
  return null;
}

function cleanTeamName(name: string): string {
  // Remove parenthetical nicknames for cleaner display: "América Mineiro (Coelho)" -> "América Mineiro"
  return name.replace(/\s*\([^)]*\)\s*/g, '').trim();
}

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

async function fetchCountries(): Promise<CountryItem[]> {
  const cached = getCached<CountryItem[]>('countries');
  if (cached) {
    console.log('Returning cached countries');
    return cached;
  }

  console.log('Fetching countries from football-logos.cc');
  const response = await fetch('https://football-logos.cc', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ArenaPlay/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`);
  }

  const html = await response.text();
  const items = extractItemsFromHtml(html);

  // Extract unique countries from items
  const countryMap = new Map<string, CountryItem>();
  for (const item of items) {
    const categoryId = item.categoryId as string;
    const categoryName = item.categoryName as string;
    const categoryEmoji = item.categoryEmoji as string;

    if (!countryMap.has(categoryId)) {
      countryMap.set(categoryId, {
        id: categoryId,
        name: categoryName,
        emoji: categoryEmoji,
        count: 0,
      });
    }
    countryMap.get(categoryId)!.count++;
  }

  const countries = Array.from(countryMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  setCache('countries', countries);
  console.log(`Found ${countries.length} countries`);
  return countries;
}

async function fetchLogos(country: string, query?: string): Promise<LogoItem[]> {
  const cacheKey = `logos:${country}`;
  let logos = getCached<LogoItem[]>(cacheKey);

  if (!logos) {
    console.log(`Fetching logos for country: ${country}`);
    const response = await fetch(`https://football-logos.cc/${country}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArenaPlay/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch country page: ${response.status}`);
    }

    const html = await response.text();
    const items = extractItemsFromHtml(html);

    logos = items.map((item) => {
      const id = item.id as string;
      const name = item.name as string;
      const hash = item.h as string;
      const categoryId = item.categoryId as string;
      const categoryName = item.categoryName as string;

      return {
        name: cleanTeamName(name),
        shortName: extractShortName(name),
        slug: id,
        logoUrl: buildLogoUrl(categoryId, id, hash),
        country: categoryId,
        countryName: categoryName,
      };
    });

    setCache(cacheKey, logos);
    console.log(`Found ${logos.length} logos for ${country}`);
  }

  // Filter by query if provided
  if (query) {
    const normalizedQuery = normalizeForSearch(query);
    logos = logos.filter((logo) => {
      const normalizedName = normalizeForSearch(logo.name);
      const normalizedShort = logo.shortName ? normalizeForSearch(logo.shortName) : '';
      return normalizedName.includes(normalizedQuery) || normalizedShort.includes(normalizedQuery);
    });
  }

  return logos;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { mode, country, query } = await req.json();

    if (mode === 'countries') {
      const countries = await fetchCountries();
      return new Response(
        JSON.stringify({ success: true, countries }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mode === 'search') {
      if (!country) {
        return new Response(
          JSON.stringify({ success: false, error: 'Country is required for search mode' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const logos = await fetchLogos(country, query);
      return new Response(
        JSON.stringify({ success: true, logos }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid mode. Use "countries" or "search".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
