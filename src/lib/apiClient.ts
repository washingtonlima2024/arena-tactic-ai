/**
 * Arena Play - API Client para servidor Python local
 * Substitui as chamadas Supabase por chamadas HTTP ao servidor local
 * Com fallback para Supabase quando servidor local indisponível
 */

import { supabase } from '@/integrations/supabase/client';

const getApiBase = () => localStorage.getItem('arenaApiUrl') || 'http://localhost:5000';

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
    
    const response = await fetch(`${getApiBase()}/health`, { 
      signal: controller.signal 
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

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${getApiBase()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
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
  createEvent: (matchId: string, event: any) => apiRequest<any>(`/api/matches/${matchId}/events`, { method: 'POST', body: JSON.stringify(event) }),
  updateEvent: (id: string, event: any) => apiRequest<any>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(event) }),
  deleteEvent: (id: string) => apiRequest<any>(`/api/events/${id}`, { method: 'DELETE' }),

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

  // ============== AI Services (with Supabase fallback) ==============
  analyzeMatch: async (data: { matchId: string; transcription: string; homeTeam: string; awayTeam: string; gameStartMinute?: number; gameEndMinute?: number; halfType?: string }) => {
    return apiRequestWithFallback<any>(
      '/api/analyze-match',
      'analysis',
      { method: 'POST', body: JSON.stringify(data) },
      async () => {
        // Fallback to Supabase Edge Function
        console.log('[apiClient] Using Supabase Edge Function for match analysis');
        const { data: result, error } = await supabase.functions.invoke('analyze-match', {
          body: data
        });
        
        if (error) {
          console.error('[apiClient] Edge Function error:', error);
          throw new Error(error.message || 'Falha na análise via cloud');
        }
        
        return result;
      }
    );
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

  transcribeLargeVideo: async (data: { videoUrl: string; matchId?: string; language?: string }) => {
    return apiRequestWithFallback<{ success: boolean; text: string; srtContent?: string }>(
      '/api/transcribe-large-video',
      'transcription',
      { method: 'POST', body: JSON.stringify(data) },
      async () => {
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
        
        if (!result?.success || !result?.text) {
          throw new Error(result?.error || 'Resposta inválida da transcrição');
        }
        
        return {
          success: true,
          text: result.text,
          srtContent: result.srtContent || ''
        };
      }
    );
  },

  extractLiveEvents: (data: { transcript: string; homeTeam: string; awayTeam: string; currentScore: { home: number; away: number }; currentMinute: number }) =>
    apiRequest<{ events: any[] }>('/api/extract-live-events', { method: 'POST', body: JSON.stringify(data) }),

  // ============== Detection & Thumbnails ==============
  detectPlayers: (data: { imageBase64?: string; imageUrl?: string; frameTimestamp?: number; confidence?: number }) =>
    apiRequest<any>('/api/detect-players', { method: 'POST', body: JSON.stringify(data) }),

  generateThumbnailAI: (data: { prompt: string; eventId: string; matchId: string; eventType: string }) =>
    apiRequest<{ imageUrl: string }>('/api/generate-thumbnail', { method: 'POST', body: JSON.stringify(data) }),

  // ============== Search ==============
  search: (query: string) => apiRequest<any[]>(`/api/search?q=${encodeURIComponent(query)}`),

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
      const formData = new FormData();
      formData.append('file', file);
      if (filename) formData.append('filename', filename);
      const response = await fetch(`${getApiBase()}/api/storage/${matchId}/${subfolder}`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
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

  // ============== Video Processing ==============
  extractClip: async (data: {
    videoUrl: string;
    startSeconds: number;
    durationSeconds: number;
    filename?: string;
    includeVignettes?: boolean;
    openingVignette?: string;
    closingVignette?: string;
  }): Promise<Blob> => {
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
};

export default apiClient;
