// Real clip extraction using FFmpeg.wasm
// Extracts 10-second clips (5s before + 5s after event) from original video
// Also generates thumbnail from clip frame automatically

import { useState, useCallback, useRef } from 'react';
import { fetchFile } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';
import { getFFmpeg } from '@/lib/ffmpegSingleton';
import { apiClient } from '@/lib/apiClient';

// Timing constants in milliseconds - SYNC WITH BACKEND EVENT_CLIP_CONFIG
// Default fallback values (category-specific timings below)
export const CLIP_BUFFER_BEFORE_MS = 15000; // 15 seconds before event (default)
export const CLIP_BUFFER_AFTER_MS = 15000;  // 15 seconds after event (default)

// Category-specific clip timings (in milliseconds) - SYNC WITH video-processor/server.py
export const EVENT_CLIP_TIMINGS: Record<string, { before: number; after: number }> = {
  // Alta importância - contexto longo
  goal: { before: 20000, after: 15000 },        // 35s total
  penalty: { before: 15000, after: 20000 },     // 35s
  red_card: { before: 15000, after: 10000 },    // 25s
  
  // Média importância
  shot_on_target: { before: 12000, after: 8000 },  // 20s
  shot: { before: 10000, after: 8000 },            // 18s
  save: { before: 12000, after: 8000 },            // 20s
  yellow_card: { before: 10000, after: 8000 },     // 18s
  corner: { before: 8000, after: 15000 },          // 23s
  free_kick: { before: 8000, after: 15000 },       // 23s
  
  // Eventos curtos
  foul: { before: 8000, after: 5000 },             // 13s
  offside: { before: 8000, after: 5000 },          // 13s
  substitution: { before: 5000, after: 5000 },     // 10s
  clearance: { before: 6000, after: 4000 },        // 10s
  tackle: { before: 6000, after: 4000 },           // 10s
  interception: { before: 6000, after: 4000 },     // 10s
  pass: { before: 5000, after: 5000 },             // 10s
  cross: { before: 6000, after: 6000 },            // 12s
  
  // Eventos táticos
  high_press: { before: 10000, after: 10000 },     // 20s
  transition: { before: 8000, after: 12000 },      // 20s
  buildup: { before: 10000, after: 10000 },        // 20s
  
  // Padrão
  default: { before: 15000, after: 15000 }         // 30s
};

// Helper function to get timing for event type
export function getEventTimings(eventType: string): { before: number; after: number } {
  return EVENT_CLIP_TIMINGS[eventType] || EVENT_CLIP_TIMINGS.default;
}

export interface ClipConfig {
  eventId: string;
  eventMs: number; // Event time in milliseconds
  videoUrl: string;
  matchId: string;
  bufferBeforeMs?: number;
  bufferAfterMs?: number;
  // Subtitle overlay options
  eventType?: string;
  eventMinute?: number;
  eventDescription?: string;
}

export interface ClipPlaybackInfo {
  eventId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
}

// Event type translations for display
const EVENT_TYPE_LABELS: Record<string, string> = {
  'goal': 'GOL',
  'shot': 'CHUTE',
  'shot_on_target': 'CHUTE NO GOL',
  'foul': 'FALTA',
  'corner': 'ESCANTEIO',
  'offside': 'IMPEDIMENTO',
  'yellow_card': 'CARTÃO AMARELO',
  'red_card': 'CARTÃO VERMELHO',
  'substitution': 'SUBSTITUIÇÃO',
  'penalty': 'PÊNALTI',
  'free_kick': 'TIRO LIVRE',
  'save': 'DEFESA',
  'clearance': 'CORTE',
  'tackle': 'DESARME',
  'pass': 'PASSE',
  'cross': 'CRUZAMENTO',
  'header': 'CABECEIO',
  'dribble': 'DRIBLE',
  'interception': 'INTERCEPTAÇÃO',
};

// Badge colors based on event type
const EVENT_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  goal: { bg: '#10b981', text: '#ffffff' },
  shot: { bg: '#f59e0b', text: '#ffffff' },
  shot_on_target: { bg: '#f59e0b', text: '#ffffff' },
  save: { bg: '#3b82f6', text: '#ffffff' },
  foul: { bg: '#ef4444', text: '#ffffff' },
  yellow_card: { bg: '#eab308', text: '#000000' },
  red_card: { bg: '#dc2626', text: '#ffffff' },
  corner: { bg: '#8b5cf6', text: '#ffffff' },
  penalty: { bg: '#ec4899', text: '#ffffff' },
  offside: { bg: '#6366f1', text: '#ffffff' },
};

export interface ClipGenerationProgress {
  stage: 'idle' | 'loading' | 'downloading' | 'extracting' | 'uploading' | 'thumbnail' | 'complete' | 'error';
  progress: number;
  message: string;
  currentEvent?: string;
  completedCount?: number;
  totalCount?: number;
  thumbnailsGenerated?: number; // Counter for generated thumbnails
}

// Helper: Convert minute + second to milliseconds
export function toMs(minute: number, second: number = 0): number {
  return (minute * 60 + second) * 1000;
}

// Helper: Convert milliseconds to FFmpeg timestamp format (HH:MM:SS.mmm)
function msToFFmpegTimestamp(ms: number): string {
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}

// Helper: Extract frame from video blob and create thumbnail with overlay
async function extractThumbnailFromClip(
  clipBlob: Blob,
  config: {
    eventId: string;
    eventType?: string;
    eventMinute?: number;
    matchId: string;
  }
): Promise<string | null> {
  console.log('[Thumbnail] 🎬 Iniciando extração para evento:', config.eventId, 'tipo:', config.eventType, 'minuto:', config.eventMinute);
  
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    
    const objectUrl = URL.createObjectURL(clipBlob);
    let timeoutId: ReturnType<typeof setTimeout>;
    let resolved = false;
    
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
      video.remove();
    };
    
    const safeResolve = (value: string | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(value);
    };
    
    video.onloadedmetadata = () => {
      try {
        console.log('[Thumbnail] ✓ Metadados carregados - duração:', video.duration?.toFixed(2) + 's', 'dimensões:', video.videoWidth, 'x', video.videoHeight);
        // Seek to 3 seconds (where the event actually happens after the buffer)
        const seekTime = Math.min(3, video.duration - 0.1);
        console.log('[Thumbnail] Buscando frame em:', seekTime.toFixed(2) + 's');
        video.currentTime = seekTime;
      } catch (err) {
        console.error('[Thumbnail] ⚠ Erro ao processar metadados:', err);
        safeResolve(null);
      }
    };
    
    video.onseeked = async () => {
      try {
        console.log('[Thumbnail] ✓ Frame capturado em:', video.currentTime?.toFixed(2) + 's');
        
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('[Thumbnail] ⚠ Falha ao obter contexto 2D do canvas');
          canvas.remove();
          safeResolve(null);
          return;
        }
        
        // Draw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Add overlay with event info
        const eventLabel = config.eventType ? (EVENT_TYPE_LABELS[config.eventType] || config.eventType.toUpperCase().replace(/_/g, ' ')) : '';
        const minute = config.eventMinute ?? 0;
        const colors = EVENT_BADGE_COLORS[config.eventType || ''] || { bg: '#10b981', text: '#ffffff' };
        
        const scale = canvas.width / 1280;
        const padding = 20 * scale;
        const badgeHeight = 50 * scale;
        const fontSize = 28 * scale;
        const minuteFontSize = 36 * scale;
        
        // Draw semi-transparent gradient at bottom
        const gradient = ctx.createLinearGradient(0, canvas.height - 120 * scale, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, canvas.height - 120 * scale, canvas.width, 120 * scale);
        
        // Draw event type badge (bottom left)
        if (eventLabel) {
          ctx.font = `bold ${fontSize}px sans-serif`;
          const textMetrics = ctx.measureText(eventLabel);
          const badgeWidth = textMetrics.width + 30 * scale;
          const badgeX = padding;
          const badgeY = canvas.height - padding - badgeHeight;
          const radius = 8 * scale;
          
          // Badge background with rounded corners
          ctx.fillStyle = colors.bg;
          ctx.beginPath();
          ctx.moveTo(badgeX + radius, badgeY);
          ctx.lineTo(badgeX + badgeWidth - radius, badgeY);
          ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + radius);
          ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - radius);
          ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY + badgeHeight, badgeX + badgeWidth - radius, badgeY + badgeHeight);
          ctx.lineTo(badgeX + radius, badgeY + badgeHeight);
          ctx.quadraticCurveTo(badgeX, badgeY + badgeHeight, badgeX, badgeY + badgeHeight - radius);
          ctx.lineTo(badgeX, badgeY + radius);
          ctx.quadraticCurveTo(badgeX, badgeY, badgeX + radius, badgeY);
          ctx.closePath();
          ctx.fill();
          
          // Badge text
          ctx.fillStyle = colors.text;
          ctx.textBaseline = 'middle';
          ctx.fillText(eventLabel, badgeX + 15 * scale, badgeY + badgeHeight / 2);
        }
        
        // Draw minute badge (bottom right)
        const minuteText = `${minute}'`;
        ctx.font = `bold ${minuteFontSize}px sans-serif`;
        const minuteMetrics = ctx.measureText(minuteText);
        const minuteBadgeWidth = minuteMetrics.width + 30 * scale;
        const minuteBadgeX = canvas.width - padding - minuteBadgeWidth;
        const badgeY = canvas.height - padding - badgeHeight;
        const radius = 8 * scale;
        
        // Minute badge background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.beginPath();
        ctx.moveTo(minuteBadgeX + radius, badgeY);
        ctx.lineTo(minuteBadgeX + minuteBadgeWidth - radius, badgeY);
        ctx.quadraticCurveTo(minuteBadgeX + minuteBadgeWidth, badgeY, minuteBadgeX + minuteBadgeWidth, badgeY + radius);
        ctx.lineTo(minuteBadgeX + minuteBadgeWidth, badgeY + badgeHeight - radius);
        ctx.quadraticCurveTo(minuteBadgeX + minuteBadgeWidth, badgeY + badgeHeight, minuteBadgeX + minuteBadgeWidth - radius, badgeY + badgeHeight);
        ctx.lineTo(minuteBadgeX + radius, badgeY + badgeHeight);
        ctx.quadraticCurveTo(minuteBadgeX, badgeY + badgeHeight, minuteBadgeX, badgeY + badgeHeight - radius);
        ctx.lineTo(minuteBadgeX, badgeY + radius);
        ctx.quadraticCurveTo(minuteBadgeX, badgeY, minuteBadgeX + radius, badgeY);
        ctx.closePath();
        ctx.fill();
        
        // Green accent line
        ctx.fillStyle = '#10b981';
        ctx.fillRect(minuteBadgeX, badgeY + 5 * scale, 4 * scale, badgeHeight - 10 * scale);
        
        // Minute text
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(minuteText, minuteBadgeX + 15 * scale, badgeY + badgeHeight / 2);
        
        // Convert to blob and upload
        console.log('[Thumbnail] Gerando blob da imagem...');
        const imageBlob = await new Promise<Blob | null>((res) => {
          canvas.toBlob((b) => res(b), 'image/jpeg', 0.90);
        });
        
        if (!imageBlob) {
          console.error('[Thumbnail] ⚠ Falha ao gerar blob da imagem');
          canvas.remove();
          safeResolve(null);
          return;
        }
        
        console.log('[Thumbnail] ✓ Blob gerado:', (imageBlob.size / 1024).toFixed(1) + 'KB');
        
        // Upload to local storage
        const fileName = `${config.eventId}-frame.jpg`;
        console.log('[Thumbnail] Fazendo upload:', fileName);
        const uploadResult = await apiClient.uploadBlob(config.matchId, 'images', imageBlob, fileName);
        const imageUrl = uploadResult.url;
        const title = `${eventLabel} - ${minute}'`;
        
        console.log('[Thumbnail] ✓ Upload concluído:', imageUrl);
        
        // Save to database
        console.log('[Thumbnail] Salvando no banco de dados...');
        await apiClient.createThumbnail({
          event_id: config.eventId,
          match_id: config.matchId,
          image_url: imageUrl,
          event_type: config.eventType || 'event',
          title
        });
        
        console.log('[Thumbnail] ✓✓ Thumbnail gerada com sucesso para evento:', config.eventId);
        
        canvas.remove();
        safeResolve(imageUrl);
      } catch (err) {
        console.error('[Thumbnail] ⚠ Erro ao extrair thumbnail:', err);
        safeResolve(null);
      }
    };
    
    video.onerror = (e) => {
      console.error('[Thumbnail] ⚠ Erro ao carregar vídeo:', e);
      safeResolve(null);
    };
    
    // Set timeout - increased to 20s for larger clips
    timeoutId = setTimeout(() => {
      console.warn('[Thumbnail] ⚠ TIMEOUT após 20s para evento:', config.eventId);
      safeResolve(null);
    }, 20000);
    
    video.src = objectUrl;
    video.load();
  });
}

export function useClipGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ClipGenerationProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const [generatingEventIds, setGeneratingEventIds] = useState<Set<string>>(new Set());
  const [isCancelled, setIsCancelled] = useState(false);
  
  const cancelRef = useRef(false);

  // Load FFmpeg using singleton
  const loadFFmpeg = async () => {
    console.log('[ClipGeneration] Loading FFmpeg via singleton...');
    setProgress({ stage: 'loading', progress: 5, message: 'Carregando processador de vídeo...' });
    
    const ffmpeg = await getFFmpeg();
    console.log('[ClipGeneration] FFmpeg ready');
    return ffmpeg;
  };

  // Calculate playback timestamps for a clip (without extraction)
  const getClipPlaybackInfo = useCallback((config: ClipConfig): ClipPlaybackInfo => {
    // Use category-specific timings if not overridden
    const eventTimings = getEventTimings(config.eventType || 'default');
    const bufferBefore = config.bufferBeforeMs ?? eventTimings.before;
    const bufferAfter = config.bufferAfterMs ?? eventTimings.after;
    
    const eventSeconds = config.eventMs / 1000;
    const startTimeSeconds = Math.max(0, eventSeconds - (bufferBefore / 1000));
    const endTimeSeconds = eventSeconds + (bufferAfter / 1000);
    const durationSeconds = endTimeSeconds - startTimeSeconds;
    
    return {
      eventId: config.eventId,
      startTimeSeconds,
      endTimeSeconds,
      durationSeconds
    };
  }, []);

  // Generate a single clip
  const generateClip = useCallback(async (
    config: ClipConfig
  ): Promise<string | null> => {
    if (cancelRef.current) return null;
    
    setGeneratingEventIds(prev => new Set([...prev, config.eventId]));
    
    try {
      // Load FFmpeg
      const ffmpeg = await loadFFmpeg();
      if (cancelRef.current) return null;

      // Use category-specific timings if not overridden
      const eventTimings = getEventTimings(config.eventType || 'default');
      const bufferBefore = config.bufferBeforeMs ?? eventTimings.before;
      const bufferAfter = config.bufferAfterMs ?? eventTimings.after;
      const eventSeconds = config.eventMs / 1000;
      const startTimeSeconds = Math.max(0, eventSeconds - (bufferBefore / 1000));
      const durationSeconds = (bufferBefore + bufferAfter) / 1000;
      
      console.log(`[ClipGeneration] Using timing for ${config.eventType}: ${bufferBefore/1000}s before, ${bufferAfter/1000}s after = ${durationSeconds}s total`);

      // Download video
      setProgress(prev => ({
        ...prev,
        stage: 'downloading',
        progress: 15,
        message: 'Baixando vídeo para extração...',
        currentEvent: config.eventId
      }));

      const videoData = await fetchFile(config.videoUrl);
      if (cancelRef.current) return null;
      
      console.log('Vídeo baixado:', (videoData.byteLength / (1024 * 1024)).toFixed(2), 'MB');

      // Write to FFmpeg filesystem
      await ffmpeg.writeFile('input.mp4', videoData);

      // Build FFmpeg command - with or without subtitles
      const hasSubtitles = config.eventType || config.eventMinute !== undefined;
      
      if (hasSubtitles) {
        // With subtitles - requires re-encoding
        setProgress(prev => ({
          ...prev,
          stage: 'extracting',
          progress: 40,
          message: `Extraindo clip com legendas (${Math.round(startTimeSeconds)}s - ${Math.round(startTimeSeconds + durationSeconds)}s)...`
        }));

        const startTimestamp = msToFFmpegTimestamp(startTimeSeconds * 1000);
        
        // Build subtitle text
        const eventLabel = config.eventType ? (EVENT_TYPE_LABELS[config.eventType] || config.eventType.toUpperCase()) : '';
        const minuteText = config.eventMinute !== undefined ? `${config.eventMinute}'` : '';
        const topText = [minuteText, eventLabel].filter(Boolean).join(' | ');
        const bottomText = config.eventDescription || '';
        
        // Build drawtext filters - escape special characters
        const escapeText = (text: string) => text.replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/\\/g, "\\\\");
        
        // Top bar with minute and event type
        const topFilter = topText ? 
          `drawtext=text='${escapeText(topText)}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=30:box=1:boxcolor=black@0.6:boxborderw=8` : '';
        
        // Bottom subtitle with description
        const bottomFilter = bottomText ?
          `drawtext=text='${escapeText(bottomText)}':fontsize=22:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-60:box=1:boxcolor=black@0.7:boxborderw=6` : '';
        
        // Combine filters
        const filters = [topFilter, bottomFilter].filter(Boolean).join(',');
        
        const ffmpegArgs = [
          '-ss', startTimestamp,
          '-i', 'input.mp4',
          '-t', durationSeconds.toString(),
          '-vf', filters || 'null',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-avoid_negative_ts', 'make_zero',
          'output.mp4'
        ];
        
        await ffmpeg.exec(ffmpegArgs);
      } else {
        // Without subtitles - fast stream copy
        setProgress(prev => ({
          ...prev,
          stage: 'extracting',
          progress: 40,
          message: `Extraindo clip (${Math.round(startTimeSeconds)}s - ${Math.round(startTimeSeconds + durationSeconds)}s)...`
        }));

        const startTimestamp = msToFFmpegTimestamp(startTimeSeconds * 1000);
        
        await ffmpeg.exec([
          '-ss', startTimestamp,
          '-i', 'input.mp4',
          '-t', durationSeconds.toString(),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          'output.mp4'
        ]);
      }

      if (cancelRef.current) {
        await ffmpeg.deleteFile('input.mp4');
        return null;
      }

      // Read the output
      const clipData = await ffmpeg.readFile('output.mp4');
      let clipBlob: Blob;
      if (clipData instanceof Uint8Array) {
        const buffer = new ArrayBuffer(clipData.length);
        const view = new Uint8Array(buffer);
        view.set(clipData);
        clipBlob = new Blob([buffer], { type: 'video/mp4' });
      } else {
        clipBlob = new Blob([clipData], { type: 'video/mp4' });
      }

      console.log('Clip extraído:', (clipBlob.size / (1024 * 1024)).toFixed(2), 'MB');

      // Clean up FFmpeg filesystem
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp4');

      // Upload to Supabase Storage
      setProgress(prev => ({
        ...prev,
        stage: 'uploading',
        progress: 70,
        message: 'Enviando clip...'
      }));

      const filePath = `${config.matchId}/${config.eventId}.mp4`;
      const { error: uploadError } = await supabase.storage
        .from('event-clips')
        .upload(filePath, clipBlob, {
          contentType: 'video/mp4',
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('event-clips')
        .getPublicUrl(filePath);

      const clipUrl = urlData.publicUrl;

      // Update match_events with clip_url
      const { error: updateError } = await supabase
        .from('match_events')
        .update({ clip_url: clipUrl, clip_pending: false })
        .eq('id', config.eventId);

      if (updateError) {
        console.error('Erro ao atualizar evento:', updateError);
      }

      // Auto-generate thumbnail from clip
      setProgress(prev => ({
        ...prev,
        stage: 'thumbnail',
        progress: 85,
        message: 'Gerando capa do clip...'
      }));

      let thumbnailGenerated = false;
      try {
        const thumbnailUrl = await extractThumbnailFromClip(clipBlob, {
          eventId: config.eventId,
          eventType: config.eventType,
          eventMinute: config.eventMinute,
          matchId: config.matchId
        });
        
        if (thumbnailUrl) {
          thumbnailGenerated = true;
          console.log('[ClipGen] ✓ Thumbnail gerada automaticamente:', config.eventId, '->', thumbnailUrl);
        } else {
          console.warn('[ClipGen] ⚠ Thumbnail retornou null para evento:', config.eventId);
        }
      } catch (thumbError) {
        console.error('[ClipGen] ✗ Erro ao gerar thumbnail automática:', thumbError);
        // Continue - thumbnail generation is not critical
      }

      setProgress(prev => ({
        ...prev,
        stage: 'complete',
        progress: 100,
        message: thumbnailGenerated ? 'Clip e capa gerados com sucesso!' : 'Clip gerado (capa falhou)',
        thumbnailsGenerated: (prev.thumbnailsGenerated || 0) + (thumbnailGenerated ? 1 : 0)
      }));

      return clipUrl;

    } catch (error) {
      console.error('Erro na geração do clip:', error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      });
      return null;
    } finally {
      setGeneratingEventIds(prev => {
        const next = new Set(prev);
        next.delete(config.eventId);
        return next;
      });
    }
  }, []);

  // Generate multiple clips with progress tracking
  // Now accepts videoStartMinute to calculate correct video-relative timestamps
  const generateAllClips = useCallback(async (
    events: Array<{
      id: string;
      minute: number;
      second?: number;
      event_type?: string;
      description?: string;
      metadata?: { eventMs?: number; videoSecond?: number };
    }>,
    videoUrl: string,
    matchId: string,
    options?: {
      limit?: number;
      videoStartMinute?: number; // Game minute where video starts
      videoDurationSeconds?: number; // Actual video duration
      addSubtitles?: boolean; // Add hard subtitles with event info
    }
  ): Promise<void> => {
    const limit = options?.limit ?? 20;
    const videoStartMinute = options?.videoStartMinute ?? 0;
    const videoDurationSeconds = options?.videoDurationSeconds;
    const addSubtitles = options?.addSubtitles ?? true; // Default: add subtitles
    
    setIsGenerating(true);
    cancelRef.current = false;
    setIsCancelled(false);

    const eventsToProcess = events.slice(0, limit);
    let completedCount = 0;

    setProgress({
      stage: 'loading',
      progress: 0,
      message: `Preparando para extrair ${eventsToProcess.length} clips...`,
      completedCount: 0,
      totalCount: eventsToProcess.length
    });

    try {
      // Load FFmpeg once
      await loadFFmpeg();

      for (const event of eventsToProcess) {
        if (cancelRef.current) {
          setProgress(prev => ({
            ...prev,
            stage: 'idle',
            message: 'Extração cancelada'
          }));
          break;
        }

        // Calculate event time in ms - relative to video, not game time
        let eventMs: number;
        
        // If event minute is greater than video duration, we need to calculate offset
        const gameTimeSeconds = (event.minute * 60) + (event.second || 0);
        const videoRelativeSeconds = (event.minute - videoStartMinute) * 60 + (event.second || 0);
        
        // Check if we need to use game-time offset calculation
        if (videoDurationSeconds && gameTimeSeconds > videoDurationSeconds) {
          // Event timestamp exceeds video duration - calculate relative to video start
          eventMs = Math.max(0, videoRelativeSeconds) * 1000;
          console.log(`Recalculating timestamp for event ${event.id}: game time ${event.minute}' -> video time ${videoRelativeSeconds}s`);
        } else if (event.metadata?.eventMs !== undefined) {
          // Check if eventMs is reasonable for video duration
          if (videoDurationSeconds && event.metadata.eventMs / 1000 > videoDurationSeconds) {
            // eventMs is game time, recalculate
            eventMs = Math.max(0, videoRelativeSeconds) * 1000;
          } else {
            eventMs = event.metadata.eventMs;
          }
        } else if (event.metadata?.videoSecond !== undefined) {
          // Check if videoSecond is reasonable for video duration
          if (videoDurationSeconds && event.metadata.videoSecond > videoDurationSeconds) {
            // videoSecond is game time, recalculate
            eventMs = Math.max(0, videoRelativeSeconds) * 1000;
          } else {
            eventMs = event.metadata.videoSecond * 1000;
          }
        } else {
          // Use game-time calculation if video start offset is provided
          if (videoStartMinute > 0) {
            eventMs = Math.max(0, videoRelativeSeconds) * 1000;
          } else {
            eventMs = toMs(event.minute, event.second || 0);
          }
        }
        
        // Clamp to video duration if available
        if (videoDurationSeconds) {
          eventMs = Math.min(eventMs, (videoDurationSeconds - 1) * 1000);
        }

        setProgress(prev => ({
          ...prev,
          progress: Math.round((completedCount / eventsToProcess.length) * 100),
          message: `Extraindo clip ${completedCount + 1}/${eventsToProcess.length} (${event.minute}' -> ${Math.round(eventMs/1000)}s no vídeo)`,
          currentEvent: event.id,
          completedCount,
          totalCount: eventsToProcess.length
        }));

        await generateClip({
          eventId: event.id,
          eventMs,
          videoUrl,
          matchId,
          // Add subtitle info if enabled
          eventType: addSubtitles ? event.event_type : undefined,
          eventMinute: addSubtitles ? event.minute : undefined,
          eventDescription: addSubtitles ? event.description : undefined
        });

        completedCount++;
      }

      setProgress(prev => ({
        stage: 'complete',
        progress: 100,
        message: `${completedCount} clips gerados com sucesso! (${prev.thumbnailsGenerated || 0} capas)`,
        completedCount,
        totalCount: eventsToProcess.length,
        thumbnailsGenerated: prev.thumbnailsGenerated || 0
      }));

    } catch (error) {
      console.error('Erro na geração em lote:', error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    } finally {
      setIsGenerating(false);
    }
  }, [generateClip]);

  // Cancel ongoing generation
  const cancel = useCallback(() => {
    cancelRef.current = true;
    setIsCancelled(true);
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setProgress({ stage: 'idle', progress: 0, message: '' });
    setIsGenerating(false);
    setIsCancelled(false);
    cancelRef.current = false;
    setGeneratingEventIds(new Set());
  }, []);

  // Check if specific event is being generated
  const isGeneratingEvent = useCallback((eventId: string): boolean => {
    return generatingEventIds.has(eventId);
  }, [generatingEventIds]);

  return {
    isGenerating,
    progress,
    getClipPlaybackInfo,
    generateClip,
    generateAllClips,
    cancel,
    isGeneratingEvent,
    reset,
    isCancelled,
    // Legacy compatibility
    isLoaded: true, // Singleton handles loading
    generatingEventIds,
    generateAllClipsOptimized: generateAllClips
  };
}
