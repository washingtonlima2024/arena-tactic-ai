/**
 * Arena Play - Modo 100% Local
 * Todas as operações usam apenas o servidor Python local
 * 
 * IMPORTANTE: Este arquivo é a fonte única de verdade para a URL do servidor.
 * Outros arquivos (como apiClient.ts) devem importar getApiBase() daqui.
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

/**
 * Verifica se há uma URL de servidor configurada.
 * Retorna true se localhost ou URL do ngrok estiver disponível.
 */
export const hasServerUrlConfigured = (): boolean => {
  // Em localhost, sempre temos uma URL
  if (typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return true;
  }
  
  // URL customizada
  const stored = localStorage.getItem('arenaApiUrl');
  if (stored) return true;
  
  // URL do ngrok configurada
  const configuredNgrok = localStorage.getItem('ngrok_fallback_url');
  if (configuredNgrok) return true;
  
  return false;
};

/**
 * Retorna a URL base da API.
 * Prioridade: arenaApiUrl (custom) > localhost > ngrok configurado
 * 
 * Retorna null se nenhuma URL estiver configurada (preview sem ngrok).
 * 
 * EXPORTADO para uso em apiClient.ts e outros módulos.
 */
export const getApiBase = (): string | null => {
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
  
  // 4. Nenhuma URL configurada - retorna null
  return null;
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
