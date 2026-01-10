/**
 * Arena Play - Modo 100% Local
 * Todas as operações usam apenas o servidor Python local
 * 
 * IMPORTANTE: Este arquivo é a fonte única de verdade para a URL do servidor.
 * Outros arquivos (como apiClient.ts) devem importar getApiBase() daqui.
 */

// URL do túnel Cloudflare como fallback para acesso remoto
const TUNNEL_FALLBACK_URL = 'https://bedford-flip-moderate-invision.trycloudflare.com';

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
 * Prioridade: arenaApiUrl (custom) > localhost > túnel configurado > fallback Cloudflare
 * 
 * EXPORTADO para uso em apiClient.ts e outros módulos.
 */
export const getApiBase = (): string => {
  // 1. URL customizada (maior prioridade)
  const stored = localStorage.getItem('arenaApiUrl');
  if (stored) return stored;
  
  // 2. Em ambiente local, usar localhost
  if (typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:5000';
  }
  
  // 3. URL do túnel configurada via Settings
  const configuredTunnel = localStorage.getItem('ngrok_fallback_url');
  if (configuredTunnel) return configuredTunnel;
  
  // 4. Fallback para túnel Cloudflare
  return TUNNEL_FALLBACK_URL;
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
