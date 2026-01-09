/**
 * Arena Play - API Client para servidor Python local
 * Substitui as chamadas Supabase por chamadas HTTP ao servidor local
 * Com fallback para Supabase quando servidor local indisponível
 */

import { supabase } from '@/integrations/supabase/client';

// Prioriza localhost quando disponível, fallback para ngrok
const getApiBase = () => {
  const stored = localStorage.getItem('arenaApiUrl');
  if (stored) return stored;
  
  // Em ambiente local (localhost/127.0.0.1), usar servidor local diretamente
  if (typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:5000';
  }
  
  // Fallback para ngrok (acesso remoto/preview)
  return 'https://75c7a7f57d85.ngrok-free.app';
};

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

// Timeout padrão (60s) para operações normais
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 60000 // 60 segundos padrão
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getApiBase()}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
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
    throw error;
  }
}

// Timeout longo (30 minutos) para operações de transcrição/análise
async function apiRequestLongRunning<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 1800000 // 30 minutos padrão
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getApiBase()}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
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
    throw error;
  }
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

// Fallback API request with Supabase
async function apiRequestWithFallback<T>(
  endpoint: string,
  tableName: string,
  options: RequestInit = {},
  supabaseFallback?: () => Promise<T>
): Promise<T> {
  const serverUp = await isLocalServerAvailable();
  
  if (serverUp) {
    return apiRequest<T>(endpoint, options);
  }
  
  // Fallback to Supabase
  if (supabaseFallback) {
    console.log(`[apiClient] Local server unavailable, using Supabase fallback for ${tableName}`);
    return supabaseFallback();
  }
  
  throw new Error(`Local server unavailable and no fallback for ${endpoint}`);
}
// Upload to Supabase Storage as fallback
async function uploadToSupabase(
  matchId: string, 
  subfolder: string, 
  file: File, 
  filename?: string
): Promise<{ url: string; filename: string; match_id: string; subfolder: string }> {
  const sanitizedFilename = filename || `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const path = `${matchId}/${subfolder}/${sanitizedFilename}`;
  
  // Upload to match-videos bucket
  const { data, error } = await supabase.storage
    .from('match-videos')
    .upload(path, file, { 
      cacheControl: '3600',
      upsert: true 
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('match-videos')
    .getPublicUrl(path);

  return {
    url: urlData.publicUrl,
    filename: sanitizedFilename,
    match_id: matchId,
    subfolder
  };
}

export const apiClient = {
  // ============== Configuration ==============
  setApiUrl: (url: string) => localStorage.setItem('arenaApiUrl', url),
  getApiUrl: () => getApiBase(),

  // ============== Health ==============
  health: () => apiRequest<{ status: string; ffmpeg: boolean }>('/health'),

  // ============== Teams ==============
  getTeams: () => apiRequest<any[]>('/api/teams'),
  getTeam: (id: string) => apiRequest<any>(`/api/teams/${id}`),
  createTeam: (team: any) => apiRequest<any>('/api/teams', { method: 'POST', body: JSON.stringify(team) }),
  updateTeam: (id: string, team: any) => apiRequest<any>(`/api/teams/${id}`, { method: 'PUT', body: JSON.stringify(team) }),
  deleteTeam: (id: string) => apiRequest<any>(`/api/teams/${id}`, { method: 'DELETE' }),

  // ============== Matches (with Supabase fallback) ==============
  getMatches: async () => {
    return apiRequestWithFallback<any[]>(
      '/api/matches',
      'matches',
      {},
      async () => {
        const { data, error } = await supabase
          .from('matches')
          .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
          .order('match_date', { ascending: false });
        if (error) throw new Error(error.message);
        return data || [];
      }
    );
  },
  
  getMatch: async (id: string) => {
    return apiRequestWithFallback<any>(
      `/api/matches/${id}`,
      'matches',
      {},
      async () => {
        const { data, error } = await supabase
          .from('matches')
          .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
          .eq('id', id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      }
    );
  },
  
  createMatch: async (match: any) => {
    return apiRequestWithFallback<any>(
      '/api/matches',
      'matches',
      { method: 'POST', body: JSON.stringify(match) },
      async () => {
        const { data, error } = await supabase
          .from('matches')
          .insert(match)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data;
      }
    );
  },
  
  updateMatch: async (id: string, match: any) => {
    return apiRequestWithFallback<any>(
      `/api/matches/${id}`,
      'matches',
      { method: 'PUT', body: JSON.stringify(match) },
      async () => {
        const { data, error } = await supabase
          .from('matches')
          .update({ ...match, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data;
      }
    );
  },
  deleteMatch: async (id: string) => {
    return apiRequestWithFallback<any>(
      `/api/matches/${id}`,
      'matches',
      { method: 'DELETE' },
      async () => {
        // Cascade delete all related data
        await supabase.from('analysis_jobs').delete().eq('match_id', id);
        await supabase.from('match_events').delete().eq('match_id', id);
        await supabase.from('videos').delete().eq('match_id', id);
        await supabase.from('generated_audio').delete().eq('match_id', id);
        await supabase.from('thumbnails').delete().eq('match_id', id);
        await supabase.from('chatbot_conversations').delete().eq('match_id', id);
        
        const { error } = await supabase.from('matches').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return { success: true };
      }
    );
  },

  // ============== Events (with Supabase fallback) ==============
  getMatchEvents: async (matchId: string) => {
    return apiRequestWithFallback<any[]>(
      `/api/matches/${matchId}/events`,
      'match_events',
      {},
      async () => {
        const { data, error } = await supabase
          .from('match_events')
          .select('*')
          .eq('match_id', matchId)
          .order('minute', { ascending: true });
        if (error) throw new Error(error.message);
        return data || [];
      }
    );
  },
  getEvent: (id: string) => apiRequest<any>(`/api/events/${id}`),
  
  createEvent: async (matchId: string, event: any) => {
    return apiRequestWithFallback<any>(
      `/api/matches/${matchId}/events`,
      'match_events',
      { method: 'POST', body: JSON.stringify(event) },
      async () => {
        const { data, error } = await supabase
          .from('match_events')
          .insert({ ...event, match_id: matchId, clip_pending: true })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data;
      }
    );
  },
  
  updateEvent: async (id: string, event: any) => {
    return apiRequestWithFallback<any>(
      `/api/events/${id}`,
      'match_events',
      { method: 'PUT', body: JSON.stringify(event) },
      async () => {
        // If time or type changed, mark clip as pending
        const updateData = { ...event };
        if (event.minute !== undefined || event.second !== undefined || event.event_type !== undefined || event.description !== undefined) {
          updateData.clip_pending = true;
        }
        
        const { data, error } = await supabase
          .from('match_events')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data;
      }
    );
  },
  
  deleteEvent: async (id: string) => {
    return apiRequestWithFallback<any>(
      `/api/events/${id}`,
      'match_events',
      { method: 'DELETE' },
      async () => {
        const { error } = await supabase
          .from('match_events')
          .delete()
          .eq('id', id);
        if (error) throw new Error(error.message);
        return { success: true };
      }
    );
  },

  // ============== Players ==============
  getPlayers: (teamId?: string) => apiRequest<any[]>(`/api/players${teamId ? `?team_id=${teamId}` : ''}`),
  createPlayer: (player: any) => apiRequest<any>('/api/players', { method: 'POST', body: JSON.stringify(player) }),
  updatePlayer: (id: string, player: any) => apiRequest<any>(`/api/players/${id}`, { method: 'PUT', body: JSON.stringify(player) }),
  deletePlayer: (id: string) => apiRequest<any>(`/api/players/${id}`, { method: 'DELETE' }),

  // ============== Videos (with Supabase fallback) ==============
  getVideos: async (matchId?: string) => {
    return apiRequestWithFallback<any[]>(
      `/api/videos${matchId ? `?match_id=${matchId}` : ''}`,
      'videos',
      {},
      async () => {
        let query = supabase.from('videos').select('*');
        if (matchId) {
          query = query.eq('match_id', matchId);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return data || [];
      }
    );
  },
  createVideo: async (video: any) => {
    return apiRequestWithFallback<any>(
      '/api/videos',
      'videos',
      { method: 'POST', body: JSON.stringify(video) },
      async () => {
        const { data, error } = await supabase
          .from('videos')
          .insert(video)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data;
      }
    );
  },
  updateVideo: (id: string, video: any) => apiRequest<any>(`/api/videos/${id}`, { method: 'PUT', body: JSON.stringify(video) }),
  deleteVideo: (id: string) => apiRequest<any>(`/api/videos/${id}`, { method: 'DELETE' }),

  // ============== Analysis Jobs (with Supabase fallback) ==============
  getAnalysisJobs: (matchId?: string) => apiRequest<any[]>(`/api/analysis-jobs${matchId ? `?match_id=${matchId}` : ''}`),
  getAnalysisJob: (id: string) => apiRequest<any>(`/api/analysis-jobs/${id}`),
  createAnalysisJob: async (job: any) => {
    return apiRequestWithFallback<any>(
      '/api/analysis-jobs',
      'analysis_jobs',
      { method: 'POST', body: JSON.stringify(job) },
      async () => {
        const { data, error } = await supabase
          .from('analysis_jobs')
          .insert(job)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data;
      }
    );
  },
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

  // ============== Settings (with Supabase fallback) ==============
  getSettings: async () => {
    return apiRequestWithFallback<any[]>(
      '/api/settings',
      'api_settings',
      {},
      async () => {
        const { data, error } = await supabase
          .from('api_settings')
          .select('*')
          .order('setting_key');
        if (error) throw new Error(error.message);
        return data || [];
      }
    );
  },
  
  upsertSetting: async (setting: { setting_key: string; setting_value: string }) => {
    return apiRequestWithFallback<any>(
      '/api/settings',
      'api_settings',
      { method: 'POST', body: JSON.stringify(setting) },
      async () => {
        const { data, error } = await supabase
          .from('api_settings')
          .upsert(
            { 
              setting_key: setting.setting_key, 
              setting_value: setting.setting_value,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'setting_key' }
          )
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data;
      }
    );
  },

  // ============== AI Services (com fallback para Edge Functions) ==============
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
    };

    const serverUp = await isLocalServerAvailable();
    
    if (serverUp) {
      // Usar timeout longo (10 minutos) para análise de IA
      return apiRequestLongRunning<any>('/api/analyze-match', { 
        method: 'POST', 
        body: JSON.stringify(body)
      }, 600000); // 10 minutos
    }
    
    // Fallback para Edge Function do Lovable Cloud
    console.log('[apiClient] Servidor local indisponível, usando Edge Function analyze-match...');
    const { data: result, error } = await supabase.functions.invoke('analyze-match', { body });
    
    if (error) {
      console.error('[apiClient] Edge Function analyze-match error:', error);
      throw new Error(error.message || 'Falha na análise via cloud');
    }
    
    return result;
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

  // ============== Transcription & Live Events (with Supabase fallback) ==============
  transcribeAudio: (data: { audio: string; language?: string }) =>
    apiRequest<{ text: string }>('/api/transcribe-audio', { method: 'POST', body: JSON.stringify(data) }),

  transcribeLargeVideo: async (data: { videoUrl: string; matchId?: string; language?: string; sizeBytes?: number }): Promise<{ success: boolean; text: string; srtContent?: string; requiresLocalServer?: boolean; suggestion?: string }> => {
    const sizeMB = (data.sizeBytes || 0) / (1024 * 1024);
    const serverUp = await isLocalServerAvailable();
    
    // Vídeos > 500MB EXIGEM servidor local
    if (sizeMB > 500 && !serverUp) {
      console.warn(`[apiClient] Vídeo de ${sizeMB.toFixed(0)}MB requer servidor local`);
      return {
        success: false,
        text: '',
        requiresLocalServer: true,
        suggestion: `Vídeo de ${sizeMB.toFixed(0)}MB detectado. Para processar:\n` +
          `1. Abra o terminal na pasta video-processor\n` +
          `2. Execute: python server.py\n` +
          `3. Use o modo "Arquivo Local" na interface`
      };
    }
    
    // Usar timeout longo (30 minutos) para transcrição via servidor local
    if (serverUp) {
      return apiRequestLongRunning<{ success: boolean; text: string; srtContent?: string; requiresLocalServer?: boolean; suggestion?: string }>(
        '/api/transcribe-large-video',
        { method: 'POST', body: JSON.stringify(data) },
        1800000 // 30 minutos
      );
    }
    
    // Fallback to Supabase Edge Function
    console.log('[apiClient] Using Supabase Edge Function for transcription');
    const { data: result, error } = await supabase.functions.invoke('transcribe-large-video', {
      body: { 
        videoUrl: data.videoUrl, 
        matchId: data.matchId,
        language: data.language || 'pt'
      }
    });
    
    if (error) {
      console.error('[apiClient] Edge Function error:', error);
      throw new Error(error.message || 'Falha na transcrição via cloud');
    }
    
    // Check if video is too large and requires local server
    if (result?.requiresLocalServer) {
      console.warn('[apiClient] Video requires local server:', result.suggestion);
      return {
        success: false,
        text: '',
        requiresLocalServer: true,
        suggestion: result.suggestion || 'Use o servidor Python local para processar este vídeo.'
      };
    }
    
    if (!result?.success || !result?.text) {
      throw new Error(result?.error || 'Resposta inválida da transcrição');
    }
    
    return {
      success: true,
      text: result.text,
      srtContent: result.srtContent || ''
    };
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
    const serverUp = await isLocalServerAvailable();
    
    if (!serverUp) {
      throw new Error('Transcrição com divisão só está disponível com o servidor Python local. Inicie com: cd video-processor && python server.py');
    }
    
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
    const serverUp = await isLocalServerAvailable();
    
    if (serverUp) {
      return apiRequest<{ imageUrl: string }>('/api/generate-thumbnail', { method: 'POST', body: JSON.stringify(data) });
    }
    
    // Fallback to Supabase Edge Function
    console.log('[apiClient] Using Supabase Edge Function for thumbnail generation');
    const { data: result, error } = await supabase.functions.invoke('generate-thumbnail', { body: data });
    
    if (error) throw error;
    return result as { imageUrl: string };
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

  uploadFile: async (matchId: string, subfolder: string, file: File, filename?: string): Promise<{ url: string; filename: string; match_id: string; subfolder: string }> => {
    // Try local server first, fallback to Supabase
    const serverUp = await isLocalServerAvailable();
    
    if (serverUp) {
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
    } else {
      // Fallback to Supabase Storage
      console.log('[apiClient] Local server unavailable, using Supabase Storage fallback');
      return uploadToSupabase(matchId, subfolder, file, filename);
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
  }> => {
    const serverUp = await isLocalServerAvailable();
    if (!serverUp) {
      throw new Error('Servidor Python não disponível. O modo "Arquivo Local" requer o servidor rodando em localhost:5000');
    }
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
  }): Promise<Blob | { clipUrl: string; success: boolean }> => {
    const isLocalAvailable = await isLocalServerAvailable();
    
    if (isLocalAvailable) {
      // Usar servidor local (retorna Blob)
      const response = await fetch(`${getApiBase()}/extract-clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Extract clip failed');
      return response.blob();
    }
    
    // Fallback: usar Edge Function
    console.log('[extractClip] Servidor local indisponível, usando Edge Function...');
    const { data: result, error } = await supabase.functions.invoke('extract-clip', {
      body: {
        eventId: data.eventId,
        matchId: data.matchId,
        videoUrl: data.videoUrl,
        startSeconds: data.startSeconds,
        durationSeconds: data.durationSeconds
      }
    });
    
    if (error) throw error;
    return result as { clipUrl: string; success: boolean };
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

  // ============== Async Processing Pipeline ==============
  startAsyncProcessing: async (data: {
    matchId: string;
    videos: Array<{ url: string; halfType: 'first' | 'second'; videoType: string; startMinute: number; endMinute: number; sizeMB?: number }>;
    homeTeam: string;
    awayTeam: string;
    autoClip?: boolean;
    autoAnalysis?: boolean;
  }) => {
    const serverUp = await isLocalServerAvailable();
    
    if (!serverUp) {
      throw new Error('Processamento assíncrono só está disponível com o servidor Python local. Inicie com: cd video-processor && python server.py');
    }
    
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
};

export default apiClient;
