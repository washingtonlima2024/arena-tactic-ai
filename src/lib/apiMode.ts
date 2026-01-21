/**
 * Arena Play - Configuração de API
 * 
 * Modo híbrido com auto-descoberta:
 * 1. Domínio de produção arenaplay.kakttus.com (proxy Nginx /api)
 * 2. Variável de ambiente VITE_API_BASE_URL (produção PM2 local)
 * 3. Auto-descoberta de servidor local (IPs comuns)
 * 4. Cloudflare Tunnel (fallback para acesso remoto)
 */

// Lista de endpoints locais para auto-descoberta
const LOCAL_ENDPOINTS = [
  'http://10.0.0.20:5000',     // IP fixo configurado
  'http://localhost:5000',      // Localhost
  'http://127.0.0.1:5000',      // Loopback
];

const DEFAULT_LOCAL_URL = 'http://10.0.0.20:5000';
const CLOUDFLARE_STORAGE_KEY = 'arena_cloudflare_url';
const DISCOVERED_SERVER_KEY = 'arena_discovered_server';

export type ApiMode = 'local' | 'cloudflare' | 'production' | 'nginx';
export type ConnectionMethod = 'local' | 'cloudflare' | 'production' | 'nginx' | 'discovering';

export interface ActiveConnection {
  method: ConnectionMethod;
  url: string;
  label: string;
}

// Cache de descoberta em memória
let discoveredServer: string | null = null;
let discoveryInProgress = false;
let discoveryPromise: Promise<string | null> | null = null;

/**
 * Detecta se estamos rodando no Lovable Cloud (preview/produção)
 */
export const isLovableEnvironment = (): boolean => {
  const host = window.location.hostname;
  return host.includes('lovable.app') || host.includes('lovable.dev') || host.includes('lovableproject.com');
};

/**
 * Detecta se estamos no domínio de produção Kakttus (proxy Nginx)
 */
export const isKakttusProduction = (): boolean => {
  const host = window.location.hostname;
  return host.includes('arenaplay.kakttus.com');
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
 * Retorna o servidor descoberto do cache
 */
export const getDiscoveredServer = (): string | null => {
  if (discoveredServer) return discoveredServer;
  return localStorage.getItem(DISCOVERED_SERVER_KEY);
};

/**
 * Salva o servidor descoberto
 */
export const setDiscoveredServer = (url: string | null): void => {
  discoveredServer = url;
  if (url) {
    localStorage.setItem(DISCOVERED_SERVER_KEY, url);
  } else {
    localStorage.removeItem(DISCOVERED_SERVER_KEY);
  }
};

/**
 * Verifica se está rodando em produção PM2 (com VITE_API_BASE_URL)
 */
export const isPM2Production = (): boolean => {
  return !!import.meta.env.VITE_API_BASE_URL;
};

/**
 * Auto-descobre o servidor local tentando múltiplos endpoints
 * Retorna a URL do primeiro servidor que responder
 */
export const autoDiscoverServer = async (): Promise<string | null> => {
  // Evitar múltiplas descobertas simultâneas
  if (discoveryInProgress && discoveryPromise) {
    return discoveryPromise;
  }
  
  discoveryInProgress = true;
  
  discoveryPromise = (async () => {
    console.log('[ApiMode] Iniciando auto-descoberta do servidor...');
    
    // Primeiro, tentar o servidor já descoberto anteriormente
    const cached = getDiscoveredServer();
    if (cached) {
      try {
        const response = await fetch(`${cached}/health?light=true`, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          console.log(`[ApiMode] Servidor em cache válido: ${cached}`);
          discoveredServer = cached;
          discoveryInProgress = false;
          return cached;
        }
      } catch {
        console.log(`[ApiMode] Servidor em cache inválido: ${cached}`);
        setDiscoveredServer(null);
      }
    }
    
    // Tentar cada endpoint em paralelo para máxima velocidade
    const results = await Promise.allSettled(
      LOCAL_ENDPOINTS.map(async (endpoint) => {
        try {
          const response = await fetch(`${endpoint}/health?light=true`, {
            signal: AbortSignal.timeout(3000),
          });
          if (response.ok) {
            return endpoint;
          }
          throw new Error('Server not OK');
        } catch {
          throw new Error(`Failed: ${endpoint}`);
        }
      })
    );
    
    // Encontrar o primeiro que funcionou
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        const url = result.value;
        console.log(`[ApiMode] Servidor descoberto: ${url}`);
        setDiscoveredServer(url);
        discoveryInProgress = false;
        return url;
      }
    }
    
    console.warn('[ApiMode] Nenhum servidor local encontrado');
    discoveryInProgress = false;
    return null;
  })();
  
  return discoveryPromise;
};

/**
 * Retorna a URL base da API
 * Prioridade:
 * 1. Domínio de produção Kakttus (proxy Nginx /api)
 * 2. Variável de ambiente VITE_API_BASE_URL (produção PM2)
 * 3. Servidor descoberto automaticamente
 * 4. Cloudflare Tunnel (fallback remoto)
 * 5. IP local padrão
 */
export const getApiBase = (): string => {
  // 1. Se estiver no domínio de produção kakttus, usar /api (proxy Nginx)
  if (isKakttusProduction()) {
    return '/api';
  }
  
  // 2. Variável de ambiente (produção PM2 local)
  const envApiUrl = import.meta.env.VITE_API_BASE_URL;
  if (envApiUrl) {
    return envApiUrl.replace(/\/$/, '');
  }
  
  // 3. Servidor descoberto automaticamente
  const discovered = getDiscoveredServer();
  if (discovered) {
    return discovered;
  }
  
  // 4. Cloudflare Tunnel como fallback
  const cloudflareUrl = getCloudflareUrl();
  if (cloudflareUrl) {
    return cloudflareUrl;
  }
  
  // 5. Default: IP local padrão
  return DEFAULT_LOCAL_URL;
};

/**
 * Retorna o modo atual da API
 */
export const getApiMode = (): ApiMode => {
  if (isKakttusProduction()) {
    return 'nginx';
  }
  if (isPM2Production()) {
    return 'production';
  }
  if (getDiscoveredServer()) {
    return 'local';
  }
  if (getCloudflareUrl()) {
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
 * Agora retorna true se tiver servidor descoberto OU cloudflare
 */
export const hasServerUrlConfigured = (): boolean => {
  if (isPM2Production()) return true;
  if (getDiscoveredServer()) return true;
  if (getCloudflareUrl()) return true;
  return false;
};

/**
 * Verifica se precisa configurar Cloudflare
 * Agora retorna false se conseguiu descobrir servidor local
 */
export const needsCloudflareConfig = (): boolean => {
  // Se tem variável de ambiente, não precisa
  if (isPM2Production()) return false;
  
  // Se descobriu servidor local, não precisa de Cloudflare
  if (getDiscoveredServer()) return false;
  
  // Se já tem Cloudflare configurado, não precisa
  if (getCloudflareUrl()) return false;
  
  // Só precisa se estiver no Lovable Cloud sem nenhuma configuração
  return isLovableEnvironment();
};

/**
 * Retorna informações sobre o método de conexão ativo
 */
export const getActiveConnectionMethod = (): ActiveConnection => {
  // Produção Kakttus (proxy Nginx)
  if (isKakttusProduction()) {
    return { 
      method: 'nginx', 
      url: '/api', 
      label: 'Produção (Nginx)' 
    };
  }
  
  // Produção PM2 local
  if (isPM2Production()) {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    return { 
      method: 'production', 
      url: envUrl, 
      label: 'Produção PM2' 
    };
  }
  
  // Servidor descoberto automaticamente
  const discovered = getDiscoveredServer();
  if (discovered) {
    const shortUrl = discovered.replace('http://', '').replace('https://', '');
    return { 
      method: 'local', 
      url: discovered, 
      label: `Local (${shortUrl})` 
    };
  }
  
  // Cloudflare Tunnel
  const cloudflareUrl = getCloudflareUrl();
  if (cloudflareUrl) {
    return { 
      method: 'cloudflare', 
      url: cloudflareUrl, 
      label: 'Cloudflare Tunnel' 
    };
  }
  
  // Fallback
  return { 
    method: 'local', 
    url: DEFAULT_LOCAL_URL, 
    label: 'Buscando servidor...' 
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
 * Verifica se o servidor está disponível e tenta recuperar
 */
export const checkAndRecoverConnection = async (): Promise<boolean> => {
  // Primeiro tentar o atual
  const currentAvailable = await checkLocalServerAvailable();
  if (currentAvailable) return true;
  
  // Se falhou, limpar cache e tentar descobrir novamente
  setDiscoveredServer(null);
  const newServer = await autoDiscoverServer();
  return !!newServer;
};

/**
 * Reseta o cache de descoberta para forçar nova busca
 */
export const resetDiscoveryCache = (): void => {
  discoveredServer = null;
  discoveryInProgress = false;
  discoveryPromise = null;
  localStorage.removeItem(DISCOVERED_SERVER_KEY);
};

// Funções legadas mantidas para compatibilidade
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
