/**
 * Arena Play - Detecção Automática de Ambiente
 * 
 * - Localhost/desenvolvimento: usa IP fixo 10.0.0.20:5000
 * - Produção (domínio externo): requer URL pública configurada
 */

// Servidor padrão para rede local
const LOCAL_SERVER_URL = 'http://10.0.0.20:5000';

export type ApiMode = 'local';

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
 * Verifica se há uma URL de servidor configurada.
 * Em produção, requer URL customizada.
 */
export const hasServerUrlConfigured = (): boolean => {
  const stored = localStorage.getItem('arenaApiUrl')?.trim();
  
  if (isLocalEnvironment()) {
    return true; // Em ambiente local, sempre tem o IP fixo
  }
  
  // Em produção, precisa de URL pública configurada
  return !!stored;
};

/**
 * Verifica se está em produção sem URL configurada
 */
export const needsProductionApiUrl = (): boolean => {
  return isProductionEnvironment() && !localStorage.getItem('arenaApiUrl')?.trim();
};

/**
 * Retorna a URL base da API.
 * - Prioridade 1: URL customizada (arenaApiUrl)
 * - Prioridade 2: IP fixo local (apenas se em ambiente local)
 */
export const getApiBase = (): string => {
  // 1. URL customizada (maior prioridade)
  const stored = localStorage.getItem('arenaApiUrl')?.trim();
  if (stored) return stored;
  
  // 2. Em ambiente local, usar IP fixo
  if (isLocalEnvironment()) {
    return LOCAL_SERVER_URL;
  }
  
  // 3. Em produção sem URL configurada - retornar vazio
  // O ServerStatusIndicator vai alertar o usuário
  return '';
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
