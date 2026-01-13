/**
 * Arena Play - API Client para servidor Python local
 * Modo 100% Local - Sem dependências de Supabase
 */

import { getApiBase } from './apiMode';

// Re-exporta getApiBase para manter compatibilidade com código existente
export { getApiBase };

// Check if local server is available
let serverAvailable: boolean | null = null;
let lastServerCheck = 0;
const SERVER_CHECK_INTERVAL = 30000; // 30 seconds

export async function isLocalServerAvailable(): Promise<boolean> {
  const now = Date.now();
  if (serverAvailable !== null && (now - lastServerCheck) < SERVER_CHECK_INTERVAL) {
    return serverAvailable;
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    // Usar health check light para resposta mais rápida
    const response = await fetch(`${getApiBase()}/health?light=true`, { 
      signal: controller.signal,
      headers: { 'ngrok-skip-browser-warning': 'true' }
    });
    clearTimeout(timeout);
    
    serverAvailable = response.ok;
    lastServerCheck = now;
    return serverAvailable;
  } catch {
    serverAvailable = false;
    lastServerCheck = now;
    return false;
  }
}

// Reset server availability cache (para forçar nova verificação)
export function resetServerAvailability(): void {
  serverAvailable = null;
  lastServerCheck = 0;
}

// Erro customizado para servidor offline
class LocalServerOfflineError extends Error {
  constructor() {
    super(
      'Servidor Python não disponível.\n\n' +
      'Para usar o Arena Play:\n' +
      '1. Abra o terminal na pasta video-processor\n' +
      '2. Execute: python server.py\n' +
      '3. Aguarde "Running on http://localhost:5000"'
    );
    this.name = 'LocalServerOfflineError';
  }
}

/**
 * Normaliza URLs de storage local para usar a base de API atual.
 * Corrige URLs localhost:5000 para usar o túnel configurado (ngrok/cloudflare).
 */
export function normalizeStorageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  const apiBase = getApiBase();
  
  // Se já é a mesma base, retornar como está
  if (url.startsWith(apiBase)) return url;
  
  // Substituir localhost:5000 ou 127.0.0.1:5000 pela base atual
  if (url.includes('localhost:5000') || url.includes('127.0.0.1:5000')) {
    return url
      .replace('http://localhost:5000', apiBase)
      .replace('http://127.0.0.1:5000', apiBase);
  }
  
  // Se é caminho relativo /api/storage/..., prefixar com base
  if (url.startsWith('/api/storage/')) {
    return `${apiBase}${url}`;
  }
  
  return url;
}

// Headers padrão para compatibilidade com túneis (ngrok, Cloudflare)
const getDefaultHeaders = () => ({
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
  'Accept': 'application/json',
  'Cache-Control': 'no-cache',
});

// Timeout padrão (60s) para operações normais
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 60000 // 60 segundos padrão
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const apiBase = getApiBase();

  try {
    console.log(`[API] ${options.method || 'GET'} ${endpoint} → ${apiBase}`);
    
    const response = await fetch(`${apiBase}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...getDefaultHeaders(),
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Requisição expirou - o servidor demorou muito para responder');
    }
    // Log detalhado para debug de problemas de conexão
    console.error(`[API] Erro em ${endpoint}:`, error.message);
    throw error;
  }
}

// Retry com exponential backoff para operações críticas
async function apiRequestWithRetry<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 60000,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiRequest<T>(endpoint, options, timeoutMs);
    } catch (error: any) {
      lastError = error;
      console.warn(`[API] Tentativa ${attempt}/${maxRetries} falhou para ${endpoint}:`, error.message);
      
      // Não tentar novamente se for erro de timeout ou servidor offline
      if (error.message?.includes('expirou') || error.name === 'LocalServerOfflineError') {
        throw error;
      }
      
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[API] Aguardando ${delay}ms antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Todas as tentativas falharam');
}

// Timeout longo (30 minutos) para operações de transcrição/análise
async function apiRequestLongRunning<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 1800000 // 30 minutos padrão
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const apiBase = getApiBase();

  try {
    console.log(`[API-LongRunning] ${options.method || 'GET'} ${endpoint} → ${apiBase} (timeout: ${Math.round(timeoutMs/60000)}min)`);
    
    const response = await fetch(`${apiBase}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...getDefaultHeaders(),
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      const mins = Math.round(timeoutMs / 60000);
      throw new Error(`Operação expirou após ${mins} minutos - verifique o servidor ou tente com arquivo menor`);
    }
    console.error(`[API-LongRunning] Erro em ${endpoint}:`, error.message);
    throw error;
  }
}

// Versão com retry para operações longas críticas
async function apiRequestLongRunningWithRetry<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 1800000,
  maxRetries: number = 2
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiRequestLongRunning<T>(endpoint, options, timeoutMs);
    } catch (error: any) {
      lastError = error;
      console.warn(`[API-LongRunning] Tentativa ${attempt}/${maxRetries} falhou para ${endpoint}:`, error.message);
      
      // Não tentar novamente se for erro de timeout
      if (error.message?.includes('expirou')) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = 3000; // 3 segundos entre tentativas longas
        console.log(`[API-LongRunning] Aguardando ${delay}ms antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Todas as tentativas falharam');
}

// Video info interface
export interface VideoInfo {
  path: string;
  filename: string;
  width: number;
  height: number;
  resolution: string;
  resolution_label: string;
  codec: string;
  codec_name: string;
  duration_seconds: number;
  duration_formatted: string;
  size_bytes: number;
  size_mb: number;
  size_formatted: string;
  bitrate_kbps: number;
  fps: number;
  needs_conversion: boolean;
  estimated_size_480p_mb: number;
}

// Wrapper para verificar servidor antes de requisição
async function ensureServerAvailable(): Promise<void> {
  const available = await isLocalServerAvailable();
  if (!available) {
    throw new LocalServerOfflineError();
  }
}

export const apiClient = {
  // ============== Generic Methods ==============
  get: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  post: <T = any>(endpoint: string, data?: any) => apiRequest<T>(endpoint, { 
    method: 'POST', 
    body: data ? JSON.stringify(data) : undefined 
  }),
  put: <T = any>(endpoint: string, data?: any) => apiRequest<T>(endpoint, { 
    method: 'PUT', 
    body: data ? JSON.stringify(data) : undefined 
  }),
  delete: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),

  // ============== Configuration ==============
  setApiUrl: (url: string) => localStorage.setItem('arenaApiUrl', url),
  getApiUrl: () => getApiBase(),
  isServerAvailable: isLocalServerAvailable,
  resetServerCache: resetServerAvailability,

  // ============== Health ==============
  health: () => apiRequest<{ status: string; ffmpeg: boolean }>('/health'),
  
  // ============== AI Status ==============
  checkAiStatus: () => apiRequest<{
    lovable: boolean;
    gemini: boolean;
    openai: boolean;
    elevenlabs: boolean;
    ollama: boolean;
    anyConfigured: boolean;
    anyTranscription: boolean;
    anyAnalysis: boolean;
    message: string;
    providers: {
      lovable: { configured: boolean; enabled: boolean; keySet: boolean };
      gemini: { configured: boolean; enabled: boolean; keySet: boolean };
      openai: { configured: boolean; enabled: boolean; keySet: boolean };
      elevenlabs: { configured: boolean; enabled: boolean; keySet: boolean };
      ollama: { configured: boolean; url?: string; model?: string };
    };
  }>('/api/ai-status'),

  // ============== Teams ==============
  getTeams: () => apiRequest<any[]>('/api/teams'),
  getTeam: (id: string) => apiRequest<any>(`/api/teams/${id}`),
  createTeam: (team: any) => apiRequest<any>('/api/teams', { method: 'POST', body: JSON.stringify(team) }),
  updateTeam: (id: string, team: any) => apiRequest<any>(`/api/teams/${id}`, { method: 'PUT', body: JSON.stringify(team) }),
  deleteTeam: (id: string) => apiRequest<any>(`/api/teams/${id}`, { method: 'DELETE' }),

  // ============== Matches ==============
  getMatches: () => apiRequest<any[]>('/api/matches'),
  getMatch: (id: string) => apiRequest<any>(`/api/matches/${id}`),
  createMatch: (match: any) => apiRequest<any>('/api/matches', { method: 'POST', body: JSON.stringify(match) }),
  updateMatch: (id: string, match: any) => apiRequest<any>(`/api/matches/${id}`, { method: 'PUT', body: JSON.stringify(match) }),
  deleteMatch: (id: string) => apiRequest<any>(`/api/matches/${id}`, { method: 'DELETE' }),
  
  // Garante que a partida existe no Supabase Cloud (sincroniza do SQLite se necessário)
  ensureMatchInSupabase: async (matchId: string): Promise<{ success: boolean; synced: boolean; message: string }> => {
    try {
      const result = await apiRequest<{ success: boolean; synced: boolean; message: string }>(
        `/api/matches/${matchId}/ensure-supabase`,
        { method: 'POST' }
      );
      return result;
    } catch (error: any) {
      console.error('[API] Erro ao sincronizar partida com Supabase:', error);
      return { success: false, synced: false, message: error.message || 'Erro ao sincronizar' };
    }
  },

  // ============== Events ==============
  getMatchEvents: (matchId: string) => apiRequest<any[]>(`/api/matches/${matchId}/events`),
  getEvent: (id: string) => apiRequest<any>(`/api/events/${id}`),
  createEvent: (matchId: string, event: any) => apiRequest<any>(`/api/matches/${matchId}/events`, { method: 'POST', body: JSON.stringify(event) }),
  updateEvent: (id: string, event: any) => apiRequest<any>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(event) }),
  deleteEvent: (id: string) => apiRequest<any>(`/api/events/${id}`, { method: 'DELETE' }),

  // ============== Players ==============
  getPlayers: (teamId?: string) => apiRequest<any[]>(`/api/players${teamId ? `?team_id=${teamId}` : ''}`),
  createPlayer: (player: any) => apiRequest<any>('/api/players', { method: 'POST', body: JSON.stringify(player) }),
  updatePlayer: (id: string, player: any) => apiRequest<any>(`/api/players/${id}`, { method: 'PUT', body: JSON.stringify(player) }),
  deletePlayer: (id: string) => apiRequest<any>(`/api/players/${id}`, { method: 'DELETE' }),

  // ============== Videos ==============
  getVideos: (matchId?: string) => apiRequest<any[]>(`/api/videos${matchId ? `?match_id=${matchId}` : ''}`),
  getVideo: async (videoId: string): Promise<any | null> => {
    try {
      return await apiRequest<any>(`/api/videos/${videoId}`, { method: 'GET' });
    } catch {
      return null;
    }
  },
  createVideo: (video: any) => apiRequest<any>('/api/videos', { method: 'POST', body: JSON.stringify(video) }),
  updateVideo: (id: string, video: any) => apiRequest<any>(`/api/videos/${id}`, { method: 'PUT', body: JSON.stringify(video) }),
  deleteVideo: (id: string) => apiRequest<any>(`/api/videos/${id}`, { method: 'DELETE' }),
  
  // Sincroniza vídeos do storage com o banco de dados
  syncVideos: async (matchId: string): Promise<{
    success: boolean;
    synced: number;
    videos: any[];
    message: string;
  }> => {
    // Usar retry para sincronização de vídeos (operação crítica)
    return apiRequestWithRetry(`/api/videos/sync/${matchId}`, { method: 'POST' }, 60000, 3);
  },

  // ============== Analysis Jobs ==============
  getAnalysisJobs: (matchId?: string) => apiRequest<any[]>(`/api/analysis-jobs${matchId ? `?match_id=${matchId}` : ''}`),
  getAnalysisJob: (id: string) => apiRequest<any>(`/api/analysis-jobs/${id}`),
  createAnalysisJob: (job: any) => apiRequest<any>('/api/analysis-jobs', { method: 'POST', body: JSON.stringify(job) }),
  updateAnalysisJob: (id: string, job: any) => apiRequest<any>(`/api/analysis-jobs/${id}`, { method: 'PUT', body: JSON.stringify(job) }),

  // ============== Audio ==============
  getAudio: (matchId?: string, audioType?: string) => {
    const params = new URLSearchParams();
    if (matchId) params.set('match_id', matchId);
    if (audioType) params.set('audio_type', audioType);
    return apiRequest<any[]>(`/api/audio?${params}`);
  },
  createAudio: (audio: any) => apiRequest<any>('/api/audio', { method: 'POST', body: JSON.stringify(audio) }),
  updateAudio: (id: string, data: any) => apiRequest<any>(`/api/audio/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ============== Thumbnails ==============
  getThumbnails: (matchId?: string) => apiRequest<any[]>(`/api/thumbnails${matchId ? `?match_id=${matchId}` : ''}`),
  createThumbnail: (thumbnail: any) => apiRequest<any>('/api/thumbnails', { method: 'POST', body: JSON.stringify(thumbnail) }),
  regenerateThumbnails: (matchId: string) => apiRequest<{
    success: boolean;
    message: string;
    generated: number;
    errors: number;
    total_events: number;
    results: Array<{
      event_id: string;
      event_type?: string;
      minute?: number;
      thumbnail_url?: string;
      status: string;
      error?: string;
    }>;
  }>(`/api/matches/${matchId}/regenerate-thumbnails`, { method: 'POST' }),

  // ============== Settings ==============
  getSettings: () => apiRequest<any[]>('/api/settings'),
  upsertSetting: (setting: { setting_key: string; setting_value: string }) => 
    apiRequest<any>('/api/settings', { method: 'POST', body: JSON.stringify(setting) }),

  // ============== AI Services ==============
  analyzeMatch: async (data: { 
    matchId: string; 
    transcription: string; 
    homeTeam: string; 
    awayTeam: string; 
    gameStartMinute?: number; 
    gameEndMinute?: number; 
    halfType?: string;
    autoClip?: boolean;
    includeSubtitles?: boolean;
    skipValidation?: boolean;
    // Match data for sync when using Edge Function fallback
    matchData?: {
      home_team?: { id: string; name: string; short_name?: string; logo_url?: string; primary_color?: string; secondary_color?: string };
      away_team?: { id: string; name: string; short_name?: string; logo_url?: string; primary_color?: string; secondary_color?: string };
      home_score?: number;
      away_score?: number;
      match_date?: string;
      competition?: string;
      venue?: string;
      status?: string;
    };
  }) => {
    const body = {
      matchId: data.matchId,
      transcription: data.transcription,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      gameStartMinute: data.gameStartMinute ?? 0,
      gameEndMinute: data.gameEndMinute ?? (data.halfType === 'second' ? 90 : 45),
      halfType: data.halfType ?? 'first',
      autoClip: data.autoClip ?? true,
      includeSubtitles: data.includeSubtitles ?? true,
      skipValidation: data.skipValidation ?? false,
    };

    // Try local server first
    const localServerAvailable = await isLocalServerAvailable();
    
    if (localServerAvailable) {
      try {
        // Usar timeout longo (10 minutos) com retry para análise de IA
        const result = await apiRequestLongRunningWithRetry<any>('/api/analyze-match', { 
          method: 'POST', 
          body: JSON.stringify(body)
        }, 600000, 2); // 10 minutos, 2 tentativas
        
        return result;
      } catch (error) {
        console.warn('[API] Local server analysis failed, trying Edge Function fallback...', error);
      }
    }
    
    // Fallback to Edge Function if local server fails or is unavailable
    console.log('[API] Using Edge Function fallback for analysis');
    return apiClient.analyzeMatchViaEdgeFunction(data);
  },
  
  // Edge Function fallback for analysis
  analyzeMatchViaEdgeFunction: async (data: { 
    matchId: string; 
    transcription: string; 
    homeTeam: string; 
    awayTeam: string; 
    gameStartMinute?: number; 
    gameEndMinute?: number; 
    halfType?: string;
    autoClip?: boolean;
    includeSubtitles?: boolean;
    skipValidation?: boolean;
    // Match data for sync (optional but recommended)
    matchData?: {
      home_team?: { id: string; name: string; short_name?: string; logo_url?: string; primary_color?: string; secondary_color?: string };
      away_team?: { id: string; name: string; short_name?: string; logo_url?: string; primary_color?: string; secondary_color?: string };
      home_score?: number;
      away_score?: number;
      match_date?: string;
      competition?: string;
      venue?: string;
      status?: string;
    };
  }) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase não configurado para fallback');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: ALWAYS sync match before analysis via Edge Function
    // ═══════════════════════════════════════════════════════════════
    console.log('[analyzeMatchViaEdgeFunction] Sincronizando partida antes da análise...');
    
    // Generate proper UUIDs for fallback teams if matchData not provided
    const generateUUID = () => crypto.randomUUID();
    
    const syncPayload = {
      id: data.matchId,
      home_team: data.matchData?.home_team || { id: generateUUID(), name: data.homeTeam },
      away_team: data.matchData?.away_team || { id: generateUUID(), name: data.awayTeam },
      home_score: data.matchData?.home_score || 0,
      away_score: data.matchData?.away_score || 0,
      match_date: data.matchData?.match_date || new Date().toISOString(),
      competition: data.matchData?.competition || null,
      venue: data.matchData?.venue || null,
      status: data.matchData?.status || 'analyzing'
    };
    
    try {
      const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(syncPayload),
      });
      
      const syncResult = await syncResponse.json();
      
      if (!syncResult.success) {
        console.error('[analyzeMatchViaEdgeFunction] ✗ Sync falhou:', syncResult.error);
        throw new Error(`Failed to sync match before analysis: ${syncResult.error}`);
      }
      
      console.log('[analyzeMatchViaEdgeFunction] ✓ Partida sincronizada com sucesso');
      
      // Aguardar propagação
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (syncError) {
      console.error('[analyzeMatchViaEdgeFunction] ✗ Erro no sync:', syncError);
      throw new Error(`Failed to sync match: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Call analyze-match Edge Function
    // ═══════════════════════════════════════════════════════════════
    const body = {
      matchId: data.matchId,
      transcription: data.transcription,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      gameStartMinute: data.gameStartMinute ?? 0,
      gameEndMinute: data.gameEndMinute ?? (data.halfType === 'second' ? 90 : 45),
      halfType: data.halfType ?? 'first',
    };
    
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Edge Function error: ${response.status}`);
    }
    
    return response.json();
  },

  generateNarration: (data: any) =>
    apiRequest<any>('/api/generate-narration', { method: 'POST', body: JSON.stringify(data) }),

  generatePodcast: (data: any) =>
    apiRequest<any>('/api/generate-podcast', { method: 'POST', body: JSON.stringify(data) }),

  chatbot: (data: { message: string; matchContext?: any; conversationHistory?: any[]; withAudio?: boolean }) =>
    apiRequest<{ text: string; audioContent?: string }>('/api/chatbot', { method: 'POST', body: JSON.stringify(data) }),

  teamChatbot: (data: { message: string; teamName: string; teamType: string; matchContext?: any; conversationHistory?: any[]; withAudio?: boolean }) =>
    apiRequest<{ text: string; audioContent?: string }>('/api/team-chatbot', { method: 'POST', body: JSON.stringify(data) }),

  tts: (data: { text: string; voice?: string }) =>
    apiRequest<{ audioContent: string }>('/api/tts', { method: 'POST', body: JSON.stringify(data) }),

  analyzeGoalPlay: (data: { description: string; scorer?: string; assister?: string; team?: string }) =>
    apiRequest<any>('/api/analyze-goal-play', { method: 'POST', body: JSON.stringify(data) }),

  // ============== Transcription ==============
  transcribeAudio: (data: { audio: string; language?: string }) =>
    apiRequest<{ text: string }>('/api/transcribe-audio', { method: 'POST', body: JSON.stringify(data) }),

  transcribeLargeVideo: async (data: { videoUrl: string; matchId?: string; language?: string; sizeBytes?: number; halfType?: 'first' | 'second' }): Promise<{ success: boolean; text: string; srtContent?: string; audioPath?: string; srtPath?: string; txtPath?: string; requiresLocalServer?: boolean; suggestion?: string }> => {
    await ensureServerAvailable();
    
    // Usar timeout longo (30 minutos) para transcrição via servidor local
    return apiRequestLongRunning<{ success: boolean; text: string; srtContent?: string; audioPath?: string; srtPath?: string; txtPath?: string; requiresLocalServer?: boolean; suggestion?: string }>(
      '/api/transcribe-large-video',
      { method: 'POST', body: JSON.stringify(data) },
      1800000 // 30 minutos
    );
  },

  /**
   * Transcribe a video by first splitting it into parts.
   * Recommended for very large videos (>500MB) for better reliability.
   */
  transcribeSplitVideo: async (data: { 
    videoUrl: string; 
    matchId?: string; 
    numParts?: number; 
    halfType?: 'first' | 'second';
    halfDuration?: number;
  }): Promise<{ 
    success: boolean; 
    text: string; 
    srtContent?: string; 
    partsTranscribed?: number;
    totalParts?: number;
    parts?: Array<{ part: number; text: string; startMinute: number }>;
  }> => {
    await ensureServerAvailable();
    
    // Usar timeout longo (30 minutos) para transcrição com divisão
    return apiRequestLongRunning('/api/transcribe-split-video', { 
      method: 'POST', 
      body: JSON.stringify({
        videoUrl: data.videoUrl,
        matchId: data.matchId,
        numParts: data.numParts || 2,
        halfType: data.halfType || 'first',
        halfDuration: data.halfDuration || 45
      })
    }, 1800000); // 30 minutos
  },

  extractLiveEvents: (data: { transcript: string; homeTeam: string; awayTeam: string; currentScore: { home: number; away: number }; currentMinute: number }) =>
    apiRequest<{ events: any[] }>('/api/extract-live-events', { method: 'POST', body: JSON.stringify(data) }),

  // ============== Detection & Thumbnails ==============
  detectPlayers: (data: { imageBase64?: string; imageUrl?: string; frameTimestamp?: number; confidence?: number }) =>
    apiRequest<any>('/api/detect-players', { method: 'POST', body: JSON.stringify(data) }),

  generateThumbnailAI: async (data: { prompt: string; eventId: string; matchId: string; eventType: string }) => {
    await ensureServerAvailable();
    return apiRequest<{ imageUrl: string }>('/api/generate-thumbnail', { method: 'POST', body: JSON.stringify(data) });
  },

  // ============== Search ==============
  search: (query: string) => apiRequest<any[]>(`/api/search?q=${encodeURIComponent(query)}`),

  // ============== Process Match Pipeline ==============
  processMatch: async (data: {
    matchId: string;
    videos: Array<{ url: string; videoType: string; startMinute: number; endMinute: number }>;
    homeTeam: string;
    awayTeam: string;
    autoClip?: boolean;
    autoTactical?: boolean;
  }) => {
    return apiRequest<{
      success: boolean;
      matchId: string;
      videos: any[];
      totalEvents: number;
      totalClips: number;
      homeScore: number;
      awayScore: number;
      tacticalAnalysis?: any;
      errors: string[];
    }>('/api/process-match', { method: 'POST', body: JSON.stringify(data) });
  },

  // ============== Clips by Half ==============
  getClipsByHalf: (matchId: string) => 
    apiRequest<{
      first_half: Array<{ filename: string; url: string; size: number }>;
      second_half: Array<{ filename: string; url: string; size: number }>;
      full: Array<{ filename: string; url: string; size: number }>;
      extra: Array<{ filename: string; url: string; size: number }>;
    }>(`/api/clips/${matchId}`),

  // ============== Clip Regeneration ==============
  regenerateClips: async (matchId: string, options?: {
    event_types?: string[];
    force_subtitles?: boolean;
    use_category_timings?: boolean;
  }): Promise<{
    success: boolean;
    regenerated: number;
    failed: number;
    total_events: number;
    timings_used: Record<string, { pre: number; post: number; total: number }>;
    message: string;
  }> => {
    await ensureServerAvailable();
    return apiRequestLongRunning(`/api/matches/${matchId}/regenerate-clips`, {
      method: 'POST',
      body: JSON.stringify(options || { use_category_timings: true, force_subtitles: true })
    }, 600000); // 10 minutes timeout
  },

  getClipConfig: () => 
    apiRequest<{
      config: Record<string, { pre_buffer: number; post_buffer: number }>;
      description: string;
    }>('/api/clip-config'),

  // ============== Storage (organized by match) ==============
  // Structure: storage/{match_id}/{subfolder}/{filename}
  // Subfolders: videos, clips, images, audio, texts, srt, json
  
  getStorageUrl: (matchId: string, subfolder: string, filename: string) => 
    `${getApiBase()}/api/storage/${matchId}/${subfolder}/${filename}`,
  
  getMatchStorage: (matchId: string, subfolder?: string) => 
    apiRequest<{ files: any[]; stats: any }>(`/api/storage/${matchId}${subfolder ? `?subfolder=${subfolder}` : ''}`),
  
  listSubfolderFiles: (matchId: string, subfolder: string) => 
    apiRequest<{ files: any[] }>(`/api/storage/${matchId}/${subfolder}`),
  
  getAllStorageStats: () => apiRequest<any>('/api/storage'),

  /**
   * Get the cover/thumbnail image for a match video.
   * Looks for cover-*.jpg files in the images subfolder.
   */
  getVideoCover: async (matchId: string): Promise<string | null> => {
    try {
      const result = await apiRequest<{ files: Array<{ filename: string; url: string }> }>(
        `/api/storage/${matchId}/images`
      );
      
      // Find the most recent cover image
      const coverFiles = result.files?.filter(f => f.filename.startsWith('cover-') && f.filename.endsWith('.jpg'));
      if (coverFiles && coverFiles.length > 0) {
        // Sort by name (contains timestamp) to get the most recent
        coverFiles.sort((a, b) => b.filename.localeCompare(a.filename));
        return normalizeStorageUrl(coverFiles[0].url);
      }
      return null;
    } catch {
      return null;
    }
  },

  uploadFile: async (matchId: string, subfolder: string, file: File, filename?: string): Promise<{ url: string; filename: string; match_id: string; subfolder: string }> => {
    await ensureServerAvailable();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutos
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (filename) formData.append('filename', filename);
      const response = await fetch(`${getApiBase()}/api/storage/${matchId}/${subfolder}`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Upload expirou - arquivo muito grande ou conexão lenta');
      }
      throw error;
    }
  },

  uploadBlob: async (matchId: string, subfolder: string, blob: Blob, filename: string): Promise<{ url: string; filename: string; match_id: string; subfolder: string }> => {
    const formData = new FormData();
    formData.append('file', blob, filename);
    const response = await fetch(`${getApiBase()}/api/storage/${matchId}/${subfolder}`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Upload failed');
    return response.json();
  },

  deleteMatchFile: (matchId: string, subfolder: string, filename: string) =>
    apiRequest<{ success: boolean }>(`/api/storage/${matchId}/${subfolder}/${filename}`, { method: 'DELETE' }),
  
  deleteMatchStorage: (matchId: string) =>
    apiRequest<{ success: boolean }>(`/api/storage/${matchId}`, { method: 'DELETE' }),
  
  // ============== Maintenance ==============
  cleanupOrphanRecords: () =>
    apiRequest<{ success: boolean; deleted: Record<string, number>; message: string }>('/api/maintenance/cleanup-orphans', { method: 'POST' }),

  // ============== Local File Linking (Optimized for Local Environment) ==============
  // Links a local file path directly without uploading - much faster for large files
  
  linkLocalFile: async (data: { 
    local_path: string; 
    match_id: string; 
    subfolder?: string;
    video_type?: 'full' | 'first_half' | 'second_half' | 'clip';
  }): Promise<{
    success: boolean;
    video: any;
    local_path: string;
    file_size: number;
    file_size_mb: number;
    duration_seconds: number | null;
    symlink_created: boolean;
    already_exists?: boolean;
  }> => {
    await ensureServerAvailable();
    return apiRequest('/api/storage/link-local', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }, 30000); // 30 segundos timeout
  },

  browseLocalDirectory: (path?: string) => apiRequest<{
    current_path: string;
    parent_path: string | null;
    directories: Array<{ name: string; path: string; type: 'directory' }>;
    files: Array<{ name: string; path: string; type: 'video'; size: number; size_mb: number }>;
  }>(`/api/storage/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),

  // ============== Video Processing ==============
  extractClip: async (data: {
    eventId?: string;
    matchId?: string;
    videoUrl: string;
    startSeconds: number;
    durationSeconds: number;
    filename?: string;
    includeVignettes?: boolean;
    openingVignette?: string;
    closingVignette?: string;
  }): Promise<Blob> => {
    await ensureServerAvailable();
    
    const response = await fetch(`${getApiBase()}/extract-clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Extract clip failed');
    return response.blob();
  },

  extractBatch: async (data: {
    videoUrl: string;
    clips: Array<{ eventId: string; startSeconds: number; durationSeconds: number; title: string }>;
    includeVignettes?: boolean;
    openingVignette?: string;
    closingVignette?: string;
  }): Promise<Blob> => {
    const response = await fetch(`${getApiBase()}/extract-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Extract batch failed');
    return response.blob();
  },

  getVignettes: () => apiRequest<{ vignettes: Array<{ name: string; size: number }> }>('/vignettes'),

  // Video info
  getVideoInfo: (path: string): Promise<VideoInfo> => 
    apiRequest<VideoInfo>('/api/video/info', {
      method: 'POST',
      body: JSON.stringify({ path })
    }),

  // ============== Video Conversion ==============
  startVideoConversion: (data: {
    input_path: string;
    match_id: string;
    video_type?: 'full' | 'first_half' | 'second_half';
  }) => apiRequest<{
    job_id: string;
    status: string;
    message: string;
  }>('/api/video/convert', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  getConversionStatus: (jobId: string) => apiRequest<{
    job_id: string;
    status: 'pending' | 'converting' | 'completed' | 'error';
    progress: number;
    output_path?: string;
    output_filename?: string;
    output_url?: string;
    output_size?: number;
    savings_percent?: number;
    error?: string;
  }>(`/api/video/convert/status/${jobId}`),

  // Link local file with optional 480p conversion
  linkLocalFileWithConversion: async (data: { 
    local_path: string; 
    match_id: string; 
    subfolder?: string;
    video_type?: 'full' | 'first_half' | 'second_half' | 'clip';
    convert_to_480p?: boolean;
  }): Promise<{
    success: boolean;
    video: any;
    local_path: string;
    file_size: number;
    file_size_mb: number;
    duration_seconds: number | null;
    symlink_created: boolean;
    conversion_job_id?: string;
  }> => {
    // First link the file
    const linkResult = await apiRequest<{
      success: boolean;
      video: any;
      local_path: string;
      file_size: number;
      file_size_mb: number;
      duration_seconds: number | null;
      symlink_created: boolean;
    }>('/api/storage/link-local', {
      method: 'POST',
      body: JSON.stringify({
        local_path: data.local_path,
        match_id: data.match_id,
        subfolder: data.subfolder,
        video_type: data.video_type
      })
    });

    // If conversion requested, start it
    if (data.convert_to_480p && linkResult.success) {
      try {
        const conversionResult = await apiRequest<{
          job_id: string;
          status: string;
        }>('/api/video/convert', {
          method: 'POST',
          body: JSON.stringify({
            input_path: data.local_path,
            match_id: data.match_id,
            video_type: data.video_type || 'full'
          })
        });
        return {
          ...linkResult,
          conversion_job_id: conversionResult.job_id
        };
      } catch (err) {
        console.error('[linkLocalFileWithConversion] Conversion start failed:', err);
        // Still return success for linking, conversion can be retried
        return linkResult;
      }
    }

    return linkResult;
  },

  // ============== SRT Upload & File Listing ==============
  uploadSrt: async (matchId: string, content: string, halfType: 'first' | 'second' | 'full' = 'full'): Promise<{
    success: boolean;
    srtPath: string;
    txtPath: string;
    srtUrl: string;
    txtUrl: string;
    textLength: number;
  }> => {
    return apiRequest(`/api/matches/${matchId}/srt`, {
      method: 'POST',
      body: JSON.stringify({ content, halfType })
    });
  },

  listMatchFiles: async (matchId: string): Promise<{
    matchId: string;
    stats: { total_files: number; total_size: number; total_size_mb: number };
    files: {
      videos: any[];
      clips: any[];
      srt: any[];
      texts: any[];
      audio: any[];
      images: any[];
      json: any[];
    };
  }> => {
    return apiRequest(`/api/matches/${matchId}/files`);
  },

  // ============== Async Processing Pipeline ==============
  startAsyncProcessing: async (data: {
    matchId: string;
    videos: Array<{ url: string; halfType: 'first' | 'second'; videoType: string; startMinute: number; endMinute: number; sizeMB?: number }>;
    homeTeam: string;
    awayTeam: string;
    autoClip?: boolean;
    autoAnalysis?: boolean;
  }) => {
    await ensureServerAvailable();
    
    return apiRequest<{ jobId: string; status: string }>('/api/process-match-async', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  getAsyncProcessingStatus: async (jobId: string) => {
    return apiRequest<{
      jobId: string;
      status: 'queued' | 'preparing' | 'splitting' | 'transcribing' | 'analyzing' | 'clipping' | 'complete' | 'error';
      stage: string;
      progress: number;
      progressMessage: string;
      partsCompleted: number;
      totalParts: number;
      partsStatus: Array<{
        part: number;
        halfType: 'first' | 'second';
        status: 'pending' | 'splitting' | 'transcribing' | 'done' | 'error';
        progress: number;
        message?: string;
      }>;
      estimatedTimeRemaining?: number;
      error?: string;
      eventsDetected?: number;
      clipsGenerated?: number;
    }>(`/api/process-match-async/status/${jobId}`);
  },

  cancelAsyncProcessing: async (jobId: string) => {
    return apiRequest<{ success: boolean }>(`/api/process-match-async/${jobId}`, {
      method: 'DELETE'
    });
  },

  // ============== Transfer Commands (Direct File Transfer) ==============
  getTransferCommands: async (matchId: string): Promise<{
    match_id: string;
    destination_path: string;
    hostname: string;
    ip: string;
    commands: {
      scp: { description: string; single_file: string; multiple_files: string; folder: string };
      rsync: { description: string; single_file: string; folder: string };
      windows_network: { description: string; copy: string; xcopy: string };
      curl: { description: string; command: string };
      powershell: { description: string; command: string };
    };
    sync_after: string;
    notes: string[];
  }> => {
    return apiRequest(`/api/storage/transfer-command/${matchId}`);
  },

  uploadVideoDirect: async (matchId: string, file: File, videoType: string = 'full'): Promise<{
    success: boolean;
    video: any;
    file_path: string;
    file_size: number;
    file_size_mb: number;
    duration_seconds: number | null;
  }> => {
    await ensureServerAvailable();
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('video_type', videoType);
    
    const response = await fetch(`${getApiBase()}/api/storage/${matchId}/videos/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return response.json();
  },

  // ============== URL Download (Server-side) ==============
  downloadVideoFromUrl: async (matchId: string, url: string, videoType: string = 'full', filename?: string): Promise<{
    job_id: string;
    status: string;
    filename: string;
    message: string;
  }> => {
    await ensureServerAvailable();
    return apiRequest(`/api/storage/${matchId}/videos/download-url`, {
      method: 'POST',
      body: JSON.stringify({ url, video_type: videoType, filename })
    });
  },

  getDownloadStatus: async (jobId: string): Promise<{
    job_id: string;
    status: 'downloading' | 'completed' | 'failed';
    progress: number;
    bytes_downloaded: number;
    total_bytes: number | null;
    filename: string;
    error?: string;
    video?: any;
    started_at?: string;
    completed_at?: string;
  }> => {
    return apiRequest(`/api/storage/download-status/${jobId}`);
  },

  listDownloadJobs: async (matchId?: string): Promise<{
    jobs: Array<{
      job_id: string;
      status: string;
      progress: number;
      filename: string;
      match_id: string;
      started_at?: string;
      completed_at?: string;
    }>;
    count: number;
  }> => {
    return apiRequest(`/api/storage/download-jobs${matchId ? `?match_id=${matchId}` : ''}`);
  },

  // ============== Live Match Finalization ==============
  /**
   * Link events to video and generate clips after live broadcast ends.
   * This function:
   * 1. Updates all events with video_id = null to link to the final video
   * 2. Triggers clip extraction for each event
   */
  finalizeLiveMatchClips: async (matchId: string, videoId: string): Promise<{
    success: boolean;
    eventsLinked: number;
    clipsGenerated: number;
    errors: string[];
  }> => {
    await ensureServerAvailable();
    
    return apiRequestLongRunning<{
      success: boolean;
      eventsLinked: number;
      clipsGenerated: number;
      errors: string[];
    }>('/api/finalize-live-clips', {
      method: 'POST',
      body: JSON.stringify({ matchId, videoId })
    }, 600000); // 10 minutos
  },

  // ============== Live Match Full Analysis ==============
  /**
   * Executa o pipeline completo de análise após transmissão ao vivo.
   * 
   * Este processo:
   * 1. Transcreve o vídeo gravado usando IA
   * 2. Analisa a transcrição para detectar eventos (gols, cartões, faltas, etc.)
   * 3. Gera clips de vídeo para cada evento detectado
   * 4. Atualiza o placar e status da partida
   */
  analyzeLiveMatch: async (matchId: string, videoId: string, homeTeam: string, awayTeam: string, onProgress?: (step: string, progress: number) => void): Promise<{
    success: boolean;
    eventsDetected: number;
    clipsGenerated: number;
    homeScore: number;
    awayScore: number;
    transcription?: string;
    errors: string[];
  }> => {
    await ensureServerAvailable();
    
    return apiRequestLongRunning<{
      success: boolean;
      eventsDetected: number;
      clipsGenerated: number;
      homeScore: number;
      awayScore: number;
      transcription?: string;
      errors: string[];
    }>('/api/analyze-live-match', {
      method: 'POST',
      body: JSON.stringify({ matchId, videoId, homeTeam, awayTeam })
    }, 1800000); // 30 minutos para partida completa
  },

  // ============== Admin API (Local) ==============
  admin: {
    // Organizations
    getOrganizations: () => apiRequest<any[]>('/api/admin/organizations'),
    createOrganization: (data: any) => apiRequest<any>('/api/admin/organizations', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
    updateOrganization: (id: string, data: any) => apiRequest<any>(`/api/admin/organizations/${id}`, { 
      method: 'PUT', 
      body: JSON.stringify(data) 
    }),
    deleteOrganization: (id: string) => apiRequest<any>(`/api/admin/organizations/${id}`, { 
      method: 'DELETE' 
    }),

    // Subscription Plans
    getSubscriptionPlans: () => apiRequest<any[]>('/api/admin/subscription-plans'),
    createSubscriptionPlan: (data: any) => apiRequest<any>('/api/admin/subscription-plans', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
    updateSubscriptionPlan: (id: string, data: any) => apiRequest<any>(`/api/admin/subscription-plans/${id}`, { 
      method: 'PUT', 
      body: JSON.stringify(data) 
    }),

    // Users
    getUsers: () => apiRequest<any[]>('/api/admin/users'),
    updateUserRole: (userId: string, role: string) => apiRequest<any>(`/api/admin/users/${userId}/role`, { 
      method: 'PUT', 
      body: JSON.stringify({ role }) 
    }),
    updateUserOrganization: (userId: string, organizationId: string | null) => apiRequest<any>(`/api/admin/users/${userId}/organization`, { 
      method: 'PUT', 
      body: JSON.stringify({ organization_id: organizationId }) 
    }),
    updateUserProfile: (userId: string, data: any) => apiRequest<any>(`/api/admin/users/${userId}/profile`, { 
      method: 'PUT', 
      body: JSON.stringify(data) 
    }),

    // Credit Transactions
    getCreditTransactions: (limit?: number) => apiRequest<any[]>(`/api/admin/credit-transactions${limit ? `?limit=${limit}` : ''}`),
    addCredits: (data: { organization_id: string; amount: number; transaction_type: string; description?: string }) => 
      apiRequest<any>('/api/admin/credit-transactions', { 
        method: 'POST', 
        body: JSON.stringify(data) 
      }),

    // Stats
    getStats: () => apiRequest<any>('/api/admin/stats'),
  },
};

export default apiClient;
