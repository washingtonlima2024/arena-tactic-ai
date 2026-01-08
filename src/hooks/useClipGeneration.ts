// Real clip extraction using FFmpeg.wasm
// Extracts 10-second clips (5s before + 5s after event) from original video

import { useState, useCallback, useRef } from 'react';
import { fetchFile } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';
import { getFFmpeg } from '@/lib/ffmpegSingleton';

// Timing constants in milliseconds
export const CLIP_BUFFER_BEFORE_MS = 3000; // 3 seconds before event
export const CLIP_BUFFER_AFTER_MS = 5000;  // 5 seconds after event

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

export interface ClipGenerationProgress {
  stage: 'idle' | 'loading' | 'downloading' | 'extracting' | 'uploading' | 'complete' | 'error';
  progress: number;
  message: string;
  currentEvent?: string;
  completedCount?: number;
  totalCount?: number;
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
    const bufferBefore = config.bufferBeforeMs ?? CLIP_BUFFER_BEFORE_MS;
    const bufferAfter = config.bufferAfterMs ?? CLIP_BUFFER_AFTER_MS;
    
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

      // Calculate timestamps
      const bufferBefore = config.bufferBeforeMs ?? CLIP_BUFFER_BEFORE_MS;
      const bufferAfter = config.bufferAfterMs ?? CLIP_BUFFER_AFTER_MS;
      const eventSeconds = config.eventMs / 1000;
      const startTimeSeconds = Math.max(0, eventSeconds - (bufferBefore / 1000));
      const durationSeconds = (bufferBefore + bufferAfter) / 1000;

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
        .update({ clip_url: clipUrl })
        .eq('id', config.eventId);

      if (updateError) {
        console.error('Erro ao atualizar evento:', updateError);
      }

      setProgress(prev => ({
        ...prev,
        stage: 'complete',
        progress: 100,
        message: 'Clip gerado com sucesso!'
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

      setProgress({
        stage: 'complete',
        progress: 100,
        message: `${completedCount} clips gerados com sucesso!`,
        completedCount,
        totalCount: eventsToProcess.length
      });

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
