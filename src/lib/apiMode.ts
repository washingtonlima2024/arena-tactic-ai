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
  // Pegar URL do localStorage ou usar fallback inteligente
  const getApiBase = () => {
    const stored = localStorage.getItem('arenaApiUrl');
    if (stored) return stored;
    
    // Em ambiente local, usar localhost
    if (typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://localhost:5000';
    }
    
    // Fallback para ngrok (preview Lovable)
    return 'https://75c7a7f57d85.ngrok-free.app';
  };

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
