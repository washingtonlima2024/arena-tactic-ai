/**
 * Arena Play - Modo 100% Local
 * Todas as operações usam apenas o servidor Python local
 * 
 * IMPORTANTE: Este arquivo é a fonte única de verdade para a URL do servidor.
 * Outros arquivos (como apiClient.ts) devem importar getApiBase() daqui.
 */

// URL padrão do túnel Cloudflare como fallback (pode ser sobrescrita via Settings)
const DEFAULT_CLOUDFLARE_TUNNEL = 'https://traveler-href-able-interval.trycloudflare.com';

export type ApiMode = 'local';

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
 * Verifica se há uma URL de servidor configurada.
 * Sempre retorna true agora que temos fallback do Cloudflare.
 */
export const hasServerUrlConfigured = (): boolean => {
  return true;
};

/**
 * Retorna a URL base da API.
 * Prioridade: arenaApiUrl (custom) > localhost > ngrok > cloudflare configurado > fallback Cloudflare
 * 
 * EXPORTADO para uso em apiClient.ts e outros módulos.
 */
export const getApiBase = (): string => {
  // 1. URL customizada (maior prioridade)
  const stored = localStorage.getItem('arenaApiUrl')?.trim();
  if (stored) return stored;
  
  // 2. Em ambiente local, usar localhost
  if (typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:5000';
  }
  
  // 3. URL do túnel ngrok configurada via Settings (com trim para evitar espaços)
  const ngrokTunnel = localStorage.getItem('ngrok_fallback_url')?.trim();
  if (ngrokTunnel) return ngrokTunnel;
  
  // 4. URL do túnel Cloudflare configurada via Settings (com trim para evitar espaços)
  const cloudflareTunnel = localStorage.getItem('cloudflare_tunnel_url')?.trim();
  if (cloudflareTunnel) return cloudflareTunnel;
  
  // 5. Fallback para túnel Cloudflare padrão
  return DEFAULT_CLOUDFLARE_TUNNEL;
};

export const checkLocalServerAvailable = async (): Promise<boolean> => {
  try {
    const apiUrl = getApiBase();
    
    // Sem URL configurada = não disponível
    if (!apiUrl) return false;
    
    const response = await fetch(`${apiUrl}/health?light=true`, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    });
    return response.ok;
  } catch {
    return false;
  }
};
