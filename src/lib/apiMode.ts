/**
 * Arena Play - Modo 100% Local
 * Todas as operações usam apenas o servidor Python local
 * 
 * Servidor padrão: http://10.0.0.20:5000
 */

// Servidor padrão fixo
const DEFAULT_SERVER_URL = 'http://10.0.0.20:5000';

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
 */
export const hasServerUrlConfigured = (): boolean => {
  return true; // Sempre configurado com IP fixo
};

/**
 * Retorna a URL base da API.
 * Prioridade: arenaApiUrl (custom) > IP fixo padrão
 */
export const getApiBase = (): string => {
  // 1. URL customizada (maior prioridade)
  const stored = localStorage.getItem('arenaApiUrl')?.trim();
  if (stored) return stored;
  
  // 2. IP fixo padrão
  return DEFAULT_SERVER_URL;
};

export const checkLocalServerAvailable = async (): Promise<boolean> => {
  try {
    const apiUrl = getApiBase();
    
    const response = await fetch(`${apiUrl}/health?light=true`, {
      signal: AbortSignal.timeout(5000)
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
