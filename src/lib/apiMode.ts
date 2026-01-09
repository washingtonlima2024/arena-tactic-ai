/**
 * Arena Play - Modo 100% Local
 * Todas as operações usam apenas o servidor Python local
 */

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

export const checkLocalServerAvailable = async (): Promise<boolean> => {
  try {
    const apiUrl = localStorage.getItem('arenaApiUrl') || 'http://localhost:5000';
    const response = await fetch(`${apiUrl}/health`, {
      signal: AbortSignal.timeout(3000),
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    });
    return response.ok;
  } catch {
    return false;
  }
};
