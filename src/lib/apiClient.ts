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

  // ============== Matches ==============
  getMatches: () => apiRequest<any[]>('/api/matches'),
  getMatch: (id: string) => apiRequest<any>(`/api/matches/${id}`),
  createMatch: (match: any) => apiRequest<any>('/api/matches', { method: 'POST', body: JSON.stringify(match) }),
  updateMatch: (id: string, match: any) => apiRequest<any>(`/api/matches/${id}`, { method: 'PUT', body: JSON.stringify(match) }),
  deleteMatch: (id: string) => apiRequest<any>(`/api/matches/${id}`, { method: 'DELETE' }),

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

  // ============== Videos (with Supabase fallback) ==============
  getVideos: (matchId?: string) => apiRequest<any[]>(`/api/videos${matchId ? `?match_id=${matchId}` : ''}`),
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

  // ============== Settings ==============
  getSettings: () => apiRequest<any[]>('/api/settings'),
  upsertSetting: (setting: { setting_key: string; setting_value: string }) =>
    apiRequest<any>('/api/settings', { method: 'POST', body: JSON.stringify(setting) }),

  // ============== AI Services ==============
  analyzeMatch: (data: { matchId: string; transcription: string; homeTeam: string; awayTeam: string; gameStartMinute?: number; gameEndMinute?: number; halfType?: string }) =>
    apiRequest<any>('/api/analyze-match', { method: 'POST', body: JSON.stringify(data) }),

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

  // ============== Transcription & Live Events ==============
  transcribeAudio: (data: { audio: string; language?: string }) =>
    apiRequest<{ text: string }>('/api/transcribe-audio', { method: 'POST', body: JSON.stringify(data) }),

  transcribeLargeVideo: (data: { videoUrl: string; matchId?: string; language?: string }) =>
    apiRequest<{ success: boolean; text: string; srtContent?: string }>('/api/transcribe-large-video', { method: 'POST', body: JSON.stringify(data) }),

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
