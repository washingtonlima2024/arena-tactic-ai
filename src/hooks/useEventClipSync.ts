// Hook for reactive clip synchronization with events
// Automatically regenerates clips when events are created or modified
// Migrated to use apiClient for 100% local mode

import { useCallback, useRef } from 'react';
import { fetchFile } from '@ffmpeg/util';
import { apiClient } from '@/lib/apiClient';
import { getFFmpeg } from '@/lib/ffmpegSingleton';
import { CLIP_BUFFER_BEFORE_MS, CLIP_BUFFER_AFTER_MS, toMs } from './useClipGeneration';

// Event type translations for subtitles
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

export interface MatchEvent {
  id: string;
  match_id: string;
  event_type: string;
  minute: number | null;
  second: number | null;
  description: string | null;
  clip_url: string | null;
  clip_pending: boolean | null;
  video_id: string | null;
  match_half: string | null;
  metadata?: Record<string, unknown>;
}

export interface VideoInfo {
  id: string;
  file_url: string;
  video_type: string | null;
  start_minute: number | null;
  duration_seconds: number | null;
}

export interface ClipSyncStatus {
  eventId: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  message: string;
}

// Check if event needs clip regeneration based on changes
export function needsClipRegeneration(
  oldEvent: MatchEvent | null,
  newEvent: MatchEvent
): boolean {
  // Skip if clip_pending just changed to false (we just processed it)
  if (oldEvent?.clip_pending === true && newEvent.clip_pending === false) {
    return false;
  }
  
  // New event without clip
  if (!oldEvent && !newEvent.clip_url) return true;
  
  // Explicitly marked as pending
  if (newEvent.clip_pending === true) return true;
  
  // Changes in time
  if (oldEvent?.minute !== newEvent.minute) return true;
  if (oldEvent?.second !== newEvent.second) return true;
  
  // Changes in event type (affects subtitle)
  if (oldEvent?.event_type !== newEvent.event_type) return true;
  
  // Changes in description (affects subtitle)
  if (oldEvent?.description !== newEvent.description) return true;
  
  return false;
}

// Find video for event based on half/minute
export function findVideoForEvent(
  event: MatchEvent,
  videos: VideoInfo[]
): VideoInfo | null {
  if (!videos || videos.length === 0) return null;
  
  // Determine half based on match_half or minute
  const eventHalf = event.match_half || 
    ((event.minute || 0) < 45 ? 'first' : 'second');
  
  // Try to find specific half video
  const halfType = eventHalf === 'first' ? 'first_half' : 'second_half';
  const halfVideo = videos.find(v => v.video_type === halfType);
  if (halfVideo) return halfVideo;
  
  // Fall back to full video
  const fullVideo = videos.find(v => v.video_type === 'full');
  if (fullVideo) return fullVideo;
  
  // Return first available video
  return videos[0] || null;
}

// Convert milliseconds to FFmpeg timestamp
function msToFFmpegTimestamp(ms: number): string {
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}

export function useEventClipSync() {
  const processingRef = useRef<Set<string>>(new Set());

  // Generate clip for a single event
  const generateEventClip = useCallback(async (
    event: MatchEvent,
    video: VideoInfo,
    onProgress?: (status: ClipSyncStatus) => void
  ): Promise<string | null> => {
    // Prevent duplicate processing
    if (processingRef.current.has(event.id)) {
      console.log('[EventClipSync] Event already being processed:', event.id);
      return null;
    }

    processingRef.current.add(event.id);
    
    const updateProgress = (progress: number, message: string, status: ClipSyncStatus['status'] = 'processing') => {
      onProgress?.({
        eventId: event.id,
        status,
        progress,
        message
      });
    };

    try {
      updateProgress(5, 'Carregando processador de vídeo...');
      
      const ffmpeg = await getFFmpeg();
      
      // Calculate timestamps
      const videoStartMinute = video.start_minute || 0;
      const eventMinute = event.minute || 0;
      const eventSecond = event.second || 0;
      
      // Calculate event time relative to video
      const videoRelativeSeconds = (eventMinute - videoStartMinute) * 60 + eventSecond;
      let eventMs = Math.max(0, videoRelativeSeconds) * 1000;
      
      // Clamp to video duration
      if (video.duration_seconds) {
        eventMs = Math.min(eventMs, (video.duration_seconds - 1) * 1000);
      }
      
      const startTimeSeconds = Math.max(0, (eventMs - CLIP_BUFFER_BEFORE_MS) / 1000);
      const durationSeconds = (CLIP_BUFFER_BEFORE_MS + CLIP_BUFFER_AFTER_MS) / 1000;
      
      console.log(`[EventClipSync] Generating clip for event ${event.id}: ${eventMinute}'${eventSecond}" -> ${startTimeSeconds}s in video`);
      
      // Download video
      updateProgress(15, 'Baixando vídeo para extração...');
      const videoData = await fetchFile(video.file_url);
      console.log('[EventClipSync] Video downloaded:', (videoData.byteLength / (1024 * 1024)).toFixed(2), 'MB');
      
      await ffmpeg.writeFile('input.mp4', videoData);
      
      // Build FFmpeg command with subtitles
      updateProgress(40, 'Extraindo clip com legendas...');
      
      const eventLabel = EVENT_TYPE_LABELS[event.event_type] || event.event_type.toUpperCase();
      const minuteText = `${eventMinute}'`;
      const topText = `${minuteText} | ${eventLabel}`;
      const bottomText = event.description || '';
      
      const escapeText = (text: string) => text.replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/\\/g, "\\\\");
      
      const topFilter = `drawtext=text='${escapeText(topText)}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=30:box=1:boxcolor=black@0.6:boxborderw=8`;
      const bottomFilter = bottomText
        ? `drawtext=text='${escapeText(bottomText)}':fontsize=22:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-60:box=1:boxcolor=black@0.7:boxborderw=6`
        : null;
      
      const filters = bottomFilter ? `${topFilter},${bottomFilter}` : topFilter;
      const startTimestamp = msToFFmpegTimestamp(startTimeSeconds * 1000);
      
      await ffmpeg.exec([
        '-ss', startTimestamp,
        '-i', 'input.mp4',
        '-t', durationSeconds.toString(),
        '-vf', filters,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-avoid_negative_ts', 'make_zero',
        'output.mp4'
      ]);
      
      // Read output
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
      
      console.log('[EventClipSync] Clip extracted:', (clipBlob.size / (1024 * 1024)).toFixed(2), 'MB');
      
      // Clean up
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp4');
      
      // Upload to local server storage
      updateProgress(70, 'Enviando clip para armazenamento...');
      
      const filename = `${event.id}.mp4`;
      const uploadResult = await apiClient.uploadBlob(event.match_id, 'clips', clipBlob, filename);
      
      if (!uploadResult?.url) {
        throw new Error('Upload failed: no URL returned');
      }
      
      const clipUrl = uploadResult.url;
      
      // Update event with clip_url and mark as not pending via API
      updateProgress(90, 'Atualizando evento...');
      
      try {
        await apiClient.updateEvent(event.id, {
          clip_url: clipUrl,
          clip_pending: false
        });
      } catch (updateError) {
        console.error('[EventClipSync] Failed to update event:', updateError);
      }
      
      updateProgress(100, 'Clip gerado com sucesso!', 'done');
      console.log('[EventClipSync] Clip generated successfully:', clipUrl);
      
      return clipUrl;
      
    } catch (error) {
      console.error('[EventClipSync] Error generating clip:', error);
      updateProgress(0, error instanceof Error ? error.message : 'Erro desconhecido', 'error');
      return null;
    } finally {
      processingRef.current.delete(event.id);
    }
  }, []);

  // Check if an event is currently being processed
  const isProcessing = useCallback((eventId: string): boolean => {
    return processingRef.current.has(eventId);
  }, []);

  return {
    generateEventClip,
    isProcessing,
    needsClipRegeneration,
    findVideoForEvent
  };
}
