/**
 * Arena Play - Modo 100% Local
 * Todas as operações usam apenas o servidor Python local
 * 
 * IMPORTANTE: Este arquivo é a fonte única de verdade para a URL do servidor.
 * Outros arquivos (como apiClient.ts) devem importar getApiBase() daqui.
 */

// URL de fallback do ngrok - ÚNICA FONTE DE VERDADE
const NGROK_FALLBACK_URL = 'https://d84e2dee7780.ngrok-free.app';

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
 * Retorna a URL base da API.
 * Prioridade: arenaApiUrl (custom) > localhost > ngrok configurado > ngrok fallback
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
  
  // 3. URL do ngrok configurada via Settings
  const configuredNgrok = localStorage.getItem('ngrok_fallback_url');
  if (configuredNgrok) return configuredNgrok;
  
  // 4. Fallback hardcoded (preview Lovable)
  return NGROK_FALLBACK_URL;
};

export const checkLocalServerAvailable = async (): Promise<boolean> => {
  try {
    const apiUrl = getApiBase();
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
