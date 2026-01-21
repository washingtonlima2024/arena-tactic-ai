/**
 * Arena Play - Configuração de API
 * 
 * Modo híbrido:
 * - Ambiente local: usa IP fixo (10.0.0.20:5000)
 * - Ambiente Lovable: usa Cloudflare Tunnel (se configurado)
 */

// Servidor local fixo
const LOCAL_SERVER_URL = 'http://10.0.0.20:5000';
const CLOUDFLARE_STORAGE_KEY = 'arena_cloudflare_url';

export type ApiMode = 'local' | 'cloudflare';

export type ConnectionMethod = 'local' | 'cloudflare';

export interface ActiveConnection {
  method: ConnectionMethod;
  url: string;
  label: string;
}

/**
 * Detecta se estamos rodando no Lovable Cloud (preview/produção)
 */
export const isLovableEnvironment = (): boolean => {
  const host = window.location.hostname;
  return host.includes('lovable.app') || host.includes('lovable.dev') || host.includes('lovableproject.com');
};

/**
 * Retorna a URL do Cloudflare Tunnel salva
 */
export const getCloudflareUrl = (): string | null => {
  return localStorage.getItem(CLOUDFLARE_STORAGE_KEY);
};

/**
 * Salva a URL do Cloudflare Tunnel
 */
export const setCloudflareUrl = (url: string): void => {
  if (url.trim()) {
    localStorage.setItem(CLOUDFLARE_STORAGE_KEY, url.replace(/\/$/, ''));
  } else {
    localStorage.removeItem(CLOUDFLARE_STORAGE_KEY);
  }
};

/**
 * Retorna a URL base da API
 * - Lovable Cloud: usa Cloudflare (se configurado)
 * - Local: usa IP fixo
 */
export const getApiBase = (): string => {
  if (isLovableEnvironment()) {
    const cloudflareUrl = getCloudflareUrl();
    if (cloudflareUrl) {
      return cloudflareUrl;
    }
    // Sem Cloudflare configurado - retorna local (vai falhar mas mostra aviso)
    console.warn('[ApiMode] Lovable environment detected but no Cloudflare URL configured');
  }
  return LOCAL_SERVER_URL;
};

/**
 * Retorna o modo atual da API
 */
export const getApiMode = (): ApiMode => {
  if (isLovableEnvironment() && getCloudflareUrl()) {
    return 'cloudflare';
  }
  return 'local';
};

export const setApiMode = (_mode: ApiMode) => {
  // No-op - modo é determinado automaticamente
};

export const isLocalMode = (): boolean => {
  return getApiMode() === 'local';
};

/**
 * Verifica se há URL do servidor configurada
 */
export const hasServerUrlConfigured = (): boolean => {
  if (isLovableEnvironment()) {
    return !!getCloudflareUrl();
  }
  return true; // Local sempre configurado
};

/**
 * Verifica se precisa configurar Cloudflare
 */
export const needsCloudflareConfig = (): boolean => {
  return isLovableEnvironment() && !getCloudflareUrl();
};

/**
 * Retorna informações sobre o método de conexão ativo
 */
export const getActiveConnectionMethod = (): ActiveConnection => {
  if (isLovableEnvironment()) {
    const cloudflareUrl = getCloudflareUrl();
    if (cloudflareUrl) {
      return { 
        method: 'cloudflare', 
        url: cloudflareUrl, 
        label: 'Cloudflare Tunnel' 
      };
    }
    return { 
      method: 'local', 
      url: LOCAL_SERVER_URL, 
      label: 'Não configurado (requer Cloudflare)' 
    };
  }
  return { 
    method: 'local', 
    url: LOCAL_SERVER_URL, 
    label: 'IP Local (10.0.0.20:5000)' 
  };
};

/**
 * Verifica se o servidor está disponível
 */
export const checkLocalServerAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${getApiBase()}/health?light=true`, {
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
  // No-op
};

export const isLocalEnvironment = (): boolean => {
  return !isLovableEnvironment();
};

export const isArenaPlayProduction = (): boolean => {
  return false;
};

export const isProductionEnvironment = (): boolean => {
  return isLovableEnvironment();
};
