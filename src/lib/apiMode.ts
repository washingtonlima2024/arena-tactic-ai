/**
 * Arena Play - Detecção Automática de Ambiente
 * 
 * Prioridade de resolução de URL:
 * 1. Subdomínio dedicado (arenaApiUrl) - ex: https://api.arenaplay.kakttus.com
 * 2. Túnel Cloudflare (cloudflare_tunnel_url) - temporário
 * 3. Túnel Ngrok (ngrok_fallback_url) - temporário
 * 4. IP local (10.0.0.20:5000) - apenas em ambiente local
 */

// Servidor padrão para rede local
const LOCAL_SERVER_URL = 'http://10.0.0.20:5000';

// URL padrão para produção Arena Play
const ARENA_PLAY_API_URL = 'https://api.arenaplay.kakttus.com';

export type ApiMode = 'local';

export type ConnectionMethod = 'subdomain' | 'cloudflare' | 'ngrok' | 'local';

export interface ActiveConnection {
  method: ConnectionMethod;
  url: string;
  label: string;
}

/**
 * Detecta se está rodando em ambiente local (localhost/rede interna)
 */
export const isLocalEnvironment = (): boolean => {
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.endsWith('.local') ||
    hostname.includes('localhost')
  );
};

/**
 * Detecta se está em ambiente de produção Arena Play (Lovable, kakttus, arenaplay)
 */
export const isArenaPlayProduction = (): boolean => {
  const hostname = window.location.hostname;
  return (
    hostname.includes('arenaplay') ||
    hostname.includes('kakttus') ||
    hostname.includes('lovable')
  );
};

/**
 * Detecta se está rodando em produção (domínio externo)
 */
export const isProductionEnvironment = (): boolean => {
  return !isLocalEnvironment();
};

// Sempre retorna 'local' - sem modo Supabase
export const getApiMode = (): ApiMode => {
  return 'local';
};

export const setApiMode = (_mode: ApiMode) => {
  // No-op - sempre local
};

export const isLocalMode = (): boolean => {
  return true;
};

/**
 * Limpa URLs de túneis legados quando em produção com subdomínio dedicado
 */
export const cleanupLegacyTunnelUrls = (): void => {
  if (!isArenaPlayProduction()) return;
  
  const arenaApiUrl = localStorage.getItem('arenaApiUrl')?.trim();
  
  // Se usando subdomínio dedicado, limpar túneis antigos
  if (arenaApiUrl && arenaApiUrl.includes('api.arenaplay.kakttus.com')) {
    const cloudflareUrl = localStorage.getItem('cloudflare_tunnel_url');
    const ngrokUrl = localStorage.getItem('ngrok_fallback_url');
    
    if (cloudflareUrl || ngrokUrl) {
      console.log('[apiMode] Limpando URLs de túneis legados em ambiente de produção');
      localStorage.removeItem('cloudflare_tunnel_url');
      localStorage.removeItem('ngrok_fallback_url');
    }
  }
};

/**
 * Retorna informações sobre o método de conexão ativo
 */
export const getActiveConnectionMethod = (): ActiveConnection => {
  const arenaApiUrl = localStorage.getItem('arenaApiUrl')?.trim();
  const cloudflareUrl = localStorage.getItem('cloudflare_tunnel_url')?.trim();
  const ngrokUrl = localStorage.getItem('ngrok_fallback_url')?.trim();
  
  if (arenaApiUrl) {
    return { method: 'subdomain', url: arenaApiUrl, label: 'Subdomínio Dedicado' };
  }
  if (cloudflareUrl) {
    return { method: 'cloudflare', url: cloudflareUrl, label: 'Túnel Cloudflare' };
  }
  if (ngrokUrl) {
    return { method: 'ngrok', url: ngrokUrl, label: 'Túnel Ngrok' };
  }
  return { method: 'local', url: LOCAL_SERVER_URL, label: 'IP Local' };
};

/**
 * Verifica se há uma URL de servidor configurada.
 * Em produção, requer URL customizada.
 */
export const hasServerUrlConfigured = (): boolean => {
  const arenaApiUrl = localStorage.getItem('arenaApiUrl')?.trim();
  const cloudflareUrl = localStorage.getItem('cloudflare_tunnel_url')?.trim();
  const ngrokUrl = localStorage.getItem('ngrok_fallback_url')?.trim();
  
  if (isLocalEnvironment()) {
    return true; // Em ambiente local, sempre tem o IP fixo
  }
  
  // Em produção Arena Play, auto-configura se necessário
  if (isArenaPlayProduction() && !arenaApiUrl && !cloudflareUrl && !ngrokUrl) {
    console.log('[apiMode] Auto-configurando URL padrão Arena Play:', ARENA_PLAY_API_URL);
    localStorage.setItem('arenaApiUrl', ARENA_PLAY_API_URL);
    return true;
  }
  
  // Em produção, precisa de pelo menos uma URL pública configurada
  return !!(arenaApiUrl || cloudflareUrl || ngrokUrl);
};

/**
 * Verifica se está em produção sem URL configurada
 */
export const needsProductionApiUrl = (): boolean => {
  return isProductionEnvironment() && !hasServerUrlConfigured();
};

/**
 * Retorna a URL base da API.
 * Prioridade: Subdomínio → Cloudflare → Ngrok → Auto-config Arena Play → IP Local
 */
export const getApiBase = (): string => {
  // 1. Subdomínio dedicado (maior prioridade)
  const arenaApiUrl = localStorage.getItem('arenaApiUrl')?.trim();
  if (arenaApiUrl) return arenaApiUrl;
  
  // 2. Túnel Cloudflare
  const cloudflareUrl = localStorage.getItem('cloudflare_tunnel_url')?.trim();
  if (cloudflareUrl) return cloudflareUrl;
  
  // 3. Túnel Ngrok
  const ngrokUrl = localStorage.getItem('ngrok_fallback_url')?.trim();
  if (ngrokUrl) return ngrokUrl;
  
  // 4. Em ambiente local, usar IP fixo
  if (isLocalEnvironment()) {
    return LOCAL_SERVER_URL;
  }
  
  // 5. Em ambiente Arena Play, auto-configurar URL padrão
  if (isArenaPlayProduction()) {
    console.log('[apiMode] Auto-configurando URL padrão Arena Play:', ARENA_PLAY_API_URL);
    localStorage.setItem('arenaApiUrl', ARENA_PLAY_API_URL);
    return ARENA_PLAY_API_URL;
  }
  
  // 6. Em produção sem URL configurada - retornar vazio
  // O ServerStatusIndicator vai alertar o usuário
  return '';
};

export const checkLocalServerAvailable = async (): Promise<boolean> => {
  try {
    const apiUrl = getApiBase();
    if (!apiUrl) return false;
    
    const response = await fetch(`${apiUrl}/health?light=true`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'ngrok-skip-browser-warning': 'true' }
    });
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Verifica se o servidor está disponível.
 */
export const checkAndRecoverConnection = async (): Promise<boolean> => {
  return await checkLocalServerAvailable();
};
