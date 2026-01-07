/**
 * Arena Play - API Client para servidor Python local
 * Substitui as chamadas Supabase por chamadas HTTP ao servidor local
 */

const getApiBase = () => localStorage.getItem('arenaApiUrl') || 'http://localhost:5000';

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

  // ============== Videos ==============
  getVideos: (matchId?: string) => apiRequest<any[]>(`/api/videos${matchId ? `?match_id=${matchId}` : ''}`),
  createVideo: (video: any) => apiRequest<any>('/api/videos', { method: 'POST', body: JSON.stringify(video) }),
  updateVideo: (id: string, video: any) => apiRequest<any>(`/api/videos/${id}`, { method: 'PUT', body: JSON.stringify(video) }),
  deleteVideo: (id: string) => apiRequest<any>(`/api/videos/${id}`, { method: 'DELETE' }),

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

  // ============== Thumbnails ==============
  getThumbnails: (matchId?: string) => apiRequest<any[]>(`/api/thumbnails${matchId ? `?match_id=${matchId}` : ''}`),
  createThumbnail: (thumbnail: any) => apiRequest<any>('/api/thumbnails', { method: 'POST', body: JSON.stringify(thumbnail) }),

  // ============== Settings ==============
  getSettings: () => apiRequest<any[]>('/api/settings'),
  upsertSetting: (setting: { setting_key: string; setting_value: string }) =>
    apiRequest<any>('/api/settings', { method: 'POST', body: JSON.stringify(setting) }),

  // ============== AI Services ==============
  analyzeMatch: (data: { matchId: string; transcription: string; homeTeam: string; awayTeam: string }) =>
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

  // ============== Search ==============
  search: (query: string) => apiRequest<any[]>(`/api/search?q=${encodeURIComponent(query)}`),

  // ============== Storage ==============
  getStorageUrl: (bucket: string, filename: string) => `${getApiBase()}/api/storage/${bucket}/${filename}`,
  listStorageFiles: (bucket: string) => apiRequest<{ files: any[] }>(`/api/storage/${bucket}`),

  uploadFile: async (bucket: string, file: File): Promise<{ url: string; filename: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${getApiBase()}/api/storage/${bucket}`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Upload failed');
    return response.json();
  },

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
