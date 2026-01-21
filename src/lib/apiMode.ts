/**
 * Arena Play - Configuração de API
 * 
 * Modo híbrido com prioridades:
 * 1. Variável de ambiente VITE_API_BASE_URL (produção PM2)
 * 2. Cloudflare Tunnel (Lovable Cloud)
 * 3. IP fixo local (desenvolvimento)
 */

// Servidor local fixo
const LOCAL_SERVER_URL = 'http://10.0.0.20:5000';
const CLOUDFLARE_STORAGE_KEY = 'arena_cloudflare_url';

export type ApiMode = 'local' | 'cloudflare' | 'production';

export type ConnectionMethod = 'local' | 'cloudflare' | 'production';
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
 * Verifica se está rodando em produção PM2 (com VITE_API_BASE_URL)
 */
export const isPM2Production = (): boolean => {
  return !!import.meta.env.VITE_API_BASE_URL;
};

/**
 * Retorna a URL base da API
 * Prioridade:
 * 1. Variável de ambiente VITE_API_BASE_URL (produção PM2)
 * 2. Cloudflare Tunnel (Lovable Cloud)
 * 3. IP fixo local (desenvolvimento)
 */
export const getApiBase = (): string => {
  // 1. Variável de ambiente tem prioridade máxima (produção PM2)
  const envApiUrl = import.meta.env.VITE_API_BASE_URL;
  if (envApiUrl) {
    return envApiUrl.replace(/\/$/, '');
  }
  
  // 2. Lovable Cloud usa Cloudflare
  if (isLovableEnvironment()) {
    const cloudflareUrl = getCloudflareUrl();
    if (cloudflareUrl) {
      return cloudflareUrl;
    }
    // Sem Cloudflare configurado - retorna local (vai falhar mas mostra aviso)
    console.warn('[ApiMode] Lovable environment detected but no Cloudflare URL configured');
  }
  
  // 3. Fallback: IP local fixo
  return LOCAL_SERVER_URL;
};

/**
 * Retorna o modo atual da API
 */
export const getApiMode = (): ApiMode => {
  if (isPM2Production()) {
    return 'production';
  }
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
  // Produção PM2
  if (isPM2Production()) {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    return { 
      method: 'production', 
      url: envUrl, 
      label: 'Produção PM2' 
    };
  }
  
  // Lovable Cloud
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
  
  // Desenvolvimento local
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
  return isLovableEnvironment() || isPM2Production();
};
