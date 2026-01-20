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

// URL de produção padrão (subdomínio dedicado)
export const PRODUCTION_API_URL = 'https://api.arenaplay.kakttus.com';

export type ApiMode = 'local';

export type ConnectionMethod = 'subdomain' | 'cloudflare' | 'ngrok' | 'local';

export interface ActiveConnection {
  method: ConnectionMethod;
  url: string;
  label: string;
}

/**
 * Retorna a URL padrão de produção
 */
export const getDefaultProductionUrl = (): string => PRODUCTION_API_URL;

/**
 * Verifica se está rodando no domínio de produção do Arena Play
 */
export const isArenaPlayProduction = (): boolean => {
  const hostname = window.location.hostname;
  return hostname.includes('arenaplay') || hostname.includes('kakttus');
};

/**
 * Auto-configura a URL de produção se estiver no domínio correto e sem configuração
 * Retorna true se auto-configurou, false caso contrário
 */
export const autoConfigureProductionUrl = (): boolean => {
  const existingUrl = localStorage.getItem('arenaApiUrl')?.trim();
  
  // Se já tem URL configurada, não fazer nada
  if (existingUrl) return false;
  
  // Se está no domínio de produção, auto-configurar
  if (isArenaPlayProduction()) {
    localStorage.setItem('arenaApiUrl', PRODUCTION_API_URL);
    console.log('[ApiMode] Auto-configurada URL de produção:', PRODUCTION_API_URL);
    // Limpar túneis legados automaticamente
    cleanupLegacyTunnels();
    return true;
  }
  
  return false;
};

/**
 * Limpa túneis Cloudflare/Ngrok quando em produção com subdomínio dedicado
 * Isso evita que túneis expirados interfiram na conectividade
 */
export const cleanupLegacyTunnels = (): void => {
  if (isArenaPlayProduction()) {
    const arenaApiUrl = localStorage.getItem('arenaApiUrl')?.trim();
    
    // Se temos subdomínio dedicado, limpar túneis antigos
    if (arenaApiUrl && arenaApiUrl.includes('api.arenaplay')) {
      const hadCloudflare = localStorage.getItem('cloudflare_tunnel_url');
      const hadNgrok = localStorage.getItem('ngrok_fallback_url');
      
      if (hadCloudflare || hadNgrok) {
        localStorage.removeItem('cloudflare_tunnel_url');
        localStorage.removeItem('ngrok_fallback_url');
        console.log('[ApiMode] ✓ Túneis legados removidos em favor do subdomínio dedicado');
      }
    }
  }
};

// Auto-executar configuração de produção no carregamento do módulo
if (typeof window !== 'undefined') {
  // Garantir URL correta em produção Arena Play
  if (isArenaPlayProduction()) {
    const currentUrl = localStorage.getItem('arenaApiUrl');
    if (!currentUrl || !currentUrl.includes('api.arenaplay')) {
      localStorage.setItem('arenaApiUrl', PRODUCTION_API_URL);
      console.log('[ApiMode] 🔧 URL de produção configurada automaticamente');
    }
    cleanupLegacyTunnels();
  }
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
 * Em produção do Arena Play: SEMPRE prioriza o subdomínio dedicado
 * Em outros ambientes: Subdomínio → Cloudflare → Ngrok → IP Local
 */
export const getApiBase = (): string => {
  // Em produção do Arena Play, SEMPRE priorizar o subdomínio dedicado
  if (isArenaPlayProduction()) {
    const arenaApiUrl = localStorage.getItem('arenaApiUrl')?.trim();
    
    // Se já tem o subdomínio configurado, usar
    if (arenaApiUrl) {
      // Limpar túneis legados se ainda existirem
      cleanupLegacyTunnels();
      return arenaApiUrl;
    }
    
    // Auto-configurar com URL de produção
    localStorage.setItem('arenaApiUrl', PRODUCTION_API_URL);
    console.log('[ApiMode] Auto-configurada URL de produção:', PRODUCTION_API_URL);
    cleanupLegacyTunnels();
    return PRODUCTION_API_URL;
  }
  
  // Para ambientes não-produção, manter lógica de fallback
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
  
  // 5. Em produção genérica sem URL configurada - retornar vazio
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
