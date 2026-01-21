/**
 * Arena Play - Configuração de API
 * 
 * Modo simplificado: sempre usa IP local fixo (10.0.0.20:5000)
 * Front-end e back-end rodam na mesma máquina.
 */

// Servidor fixo para todas as requisições
const LOCAL_SERVER_URL = 'http://10.0.0.20:5000';

export type ApiMode = 'local';

export type ConnectionMethod = 'local';

export interface ActiveConnection {
  method: ConnectionMethod;
  url: string;
  label: string;
}

/**
 * Retorna a URL base da API - sempre o IP local fixo
 */
export const getApiBase = (): string => {
  return LOCAL_SERVER_URL;
};

/**
 * Sempre retorna 'local' - sem modo cloud
 */
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
 * Servidor sempre configurado com IP fixo
 */
export const hasServerUrlConfigured = (): boolean => {
  return true;
};

/**
 * Nunca precisa de URL em produção - IP fixo sempre disponível
 */
export const needsProductionApiUrl = (): boolean => {
  return false;
};

/**
 * Retorna informações sobre o método de conexão ativo
 */
export const getActiveConnectionMethod = (): ActiveConnection => {
  return { 
    method: 'local', 
    url: LOCAL_SERVER_URL, 
    label: 'IP Local (10.0.0.20:5000)' 
  };
};

/**
 * Verifica se o servidor local está disponível
 */
export const checkLocalServerAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${LOCAL_SERVER_URL}/health?light=true`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Verifica se o servidor está disponível
 */
export const checkAndRecoverConnection = async (): Promise<boolean> => {
  return await checkLocalServerAvailable();
};

// Funções legadas mantidas para compatibilidade (no-op)
export const cleanupLegacyTunnelUrls = (): void => {
  // No-op - não há mais túneis para limpar
};

export const isLocalEnvironment = (): boolean => {
  return true; // Sempre ambiente local
};

export const isArenaPlayProduction = (): boolean => {
  return false; // Nunca em produção externa
};

export const isProductionEnvironment = (): boolean => {
  return false; // Sempre local
};
