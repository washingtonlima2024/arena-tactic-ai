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

// Wrapper para verificar servidor antes de requisição
async function ensureServerAvailable(): Promise<void> {
  const available = await isLocalServerAvailable();
  if (!available) {
    throw new LocalServerOfflineError();
  }
}

export const apiClient = {
  // ============== Configuration ==============
  setApiUrl: (url: string) => localStorage.setItem('arenaApiUrl', url),
  getApiUrl: () => getApiBase(),
  isServerAvailable: isLocalServerAvailable,
  resetServerCache: resetServerAvailability,

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
    return apiRequest(`/api/videos/sync/${matchId}`, { method: 'POST' });
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
  }) => {
    await ensureServerAvailable();
    
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

    // Usar timeout longo (10 minutos) para análise de IA
    return apiRequestLongRunning<any>('/api/analyze-match', { 
      method: 'POST', 
      body: JSON.stringify(body)
    }, 600000); // 10 minutos
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

  transcribeLargeVideo: async (data: { videoUrl: string; matchId?: string; language?: string; sizeBytes?: number }): Promise<{ success: boolean; text: string; srtContent?: string; requiresLocalServer?: boolean; suggestion?: string }> => {
    await ensureServerAvailable();
    
    // Usar timeout longo (30 minutos) para transcrição via servidor local
    return apiRequestLongRunning<{ success: boolean; text: string; srtContent?: string; requiresLocalServer?: boolean; suggestion?: string }>(
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
};

export default apiClient;
