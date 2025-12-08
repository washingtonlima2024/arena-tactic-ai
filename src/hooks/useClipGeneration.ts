import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface ClipConfig {
  eventId: string;
  eventMinute: number;
  eventSecond?: number;
  videoUrl: string;
  videoStartMinute: number;
  videoEndMinute: number;
  videoDurationSeconds: number;
  matchId: string;
  bufferBefore?: number; // seconds before event
  bufferAfter?: number;  // seconds after event
}

export interface ClipGenerationProgress {
  stage: 'idle' | 'loading' | 'downloading' | 'extracting' | 'uploading' | 'complete' | 'error';
  progress: number;
  message: string;
  currentClip?: number;
  totalClips?: number;
}

export function useClipGeneration() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingEventIds, setGeneratingEventIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ClipGenerationProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });

  const loadFFmpeg = useCallback(async () => {
    if (ffmpegRef.current && isLoaded) return true;

    try {
      setProgress({
        stage: 'loading',
        progress: 10,
        message: 'Carregando processador de vídeo...'
      });

      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg Clip]', message);
      });

      ffmpeg.on('progress', ({ progress: p }) => {
        setProgress(prev => ({
          ...prev,
          progress: Math.min(80, 30 + (p * 50)),
        }));
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setIsLoaded(true);
      return true;
    } catch (error) {
      console.error('Error loading FFmpeg:', error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: 'Erro ao carregar processador de vídeo'
      });
      return false;
    }
  }, [isLoaded]);

  // Calculate video timestamp from game minute
  const calculateVideoTimestamp = (
    eventMinute: number,
    eventSecond: number,
    videoStartMinute: number,
    videoEndMinute: number,
    videoDurationSeconds: number
  ): number => {
    const eventTotalMinutes = eventMinute + (eventSecond / 60);
    const videoRangeMinutes = videoEndMinute - videoStartMinute;
    
    if (videoRangeMinutes <= 0) return 0;
    
    const positionRatio = (eventTotalMinutes - videoStartMinute) / videoRangeMinutes;
    return Math.max(0, positionRatio * videoDurationSeconds);
  };

  const generateClip = useCallback(async (config: ClipConfig): Promise<string | null> => {
    const {
      eventId,
      eventMinute,
      eventSecond = 0,
      videoUrl,
      videoStartMinute,
      videoEndMinute,
      videoDurationSeconds,
      matchId,
      bufferBefore = 10,
      bufferAfter = 10
    } = config;

    setGeneratingEventIds(prev => new Set(prev).add(eventId));

    try {
      const loaded = await loadFFmpeg();
      if (!loaded || !ffmpegRef.current) {
        throw new Error('FFmpeg não carregado');
      }

      const ffmpeg = ffmpegRef.current;

      // Calculate event position in video
      const eventVideoSeconds = calculateVideoTimestamp(
        eventMinute,
        eventSecond,
        videoStartMinute,
        videoEndMinute,
        videoDurationSeconds
      );

      const startTime = Math.max(0, eventVideoSeconds - bufferBefore);
      const duration = bufferBefore + bufferAfter;

      console.log(`[ClipGen] Event ${eventId}: minute=${eventMinute}, videoSec=${eventVideoSeconds}, start=${startTime}, duration=${duration}`);

      setProgress({
        stage: 'downloading',
        progress: 15,
        message: 'Baixando vídeo...'
      });

      // Download video
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min timeout
      
      const response = await fetch(videoUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Erro ao baixar vídeo: HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(`[ClipGen] Video downloaded: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);

      await ffmpeg.writeFile('input.mp4', new Uint8Array(arrayBuffer));

      setProgress({
        stage: 'extracting',
        progress: 40,
        message: 'Extraindo clip...'
      });

      // Extract clip with FFmpeg
      const outputFile = 'clip.mp4';
      await ffmpeg.exec([
        '-ss', startTime.toString(),
        '-i', 'input.mp4',
        '-t', duration.toString(),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputFile
      ]);

      setProgress({
        stage: 'uploading',
        progress: 80,
        message: 'Enviando clip...'
      });

      // Read output and upload to Supabase Storage
      const data = await ffmpeg.readFile(outputFile);
      let clipBlob: Blob;
      if (typeof data === 'string') {
        clipBlob = new Blob([data], { type: 'video/mp4' });
      } else {
        clipBlob = new Blob([data.slice().buffer], { type: 'video/mp4' });
      }

      const fileName = `${matchId}/${eventId}.mp4`;
      const { error: uploadError } = await supabase.storage
        .from('event-clips')
        .upload(fileName, clipBlob, {
          contentType: 'video/mp4',
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('event-clips')
        .getPublicUrl(fileName);

      const clipUrl = urlData.publicUrl;

      // Update match_events with clip_url
      const { error: updateError } = await supabase
        .from('match_events')
        .update({ clip_url: clipUrl })
        .eq('id', eventId);

      if (updateError) {
        console.error('Error updating event with clip URL:', updateError);
      }

      // Cleanup FFmpeg files
      try {
        await ffmpeg.deleteFile('input.mp4');
        await ffmpeg.deleteFile(outputFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      setProgress({
        stage: 'complete',
        progress: 100,
        message: 'Clip gerado com sucesso!'
      });

      toast.success('Clip extraído e salvo!');
      return clipUrl;

    } catch (error) {
      console.error('Error generating clip:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setProgress({
        stage: 'error',
        progress: 0,
        message: `Erro: ${errorMessage}`
      });
      toast.error(`Erro ao gerar clip: ${errorMessage}`);
      return null;
    } finally {
      setGeneratingEventIds(prev => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
      if (generatingEventIds.size <= 1) {
        setIsGenerating(false);
      }
    }
  }, [loadFFmpeg, generatingEventIds]);

  const generateAllClips = useCallback(async (configs: ClipConfig[]): Promise<void> => {
    if (configs.length === 0) return;

    setIsGenerating(true);
    let completed = 0;

    for (const config of configs) {
      setProgress({
        stage: 'extracting',
        progress: (completed / configs.length) * 100,
        message: `Processando clip ${completed + 1}/${configs.length}...`,
        currentClip: completed + 1,
        totalClips: configs.length
      });

      await generateClip(config);
      completed++;
    }

    setProgress({
      stage: 'complete',
      progress: 100,
      message: `${configs.length} clips gerados com sucesso!`
    });

    setIsGenerating(false);
    toast.success(`${configs.length} clips extraídos e salvos!`);
  }, [generateClip]);

  const isGeneratingEvent = useCallback((eventId: string) => {
    return generatingEventIds.has(eventId);
  }, [generatingEventIds]);

  const reset = useCallback(() => {
    setProgress({
      stage: 'idle',
      progress: 0,
      message: ''
    });
  }, []);

  return {
    isLoaded,
    isGenerating,
    progress,
    generateClip,
    generateAllClips,
    isGeneratingEvent,
    generatingEventIds,
    reset
  };
}
