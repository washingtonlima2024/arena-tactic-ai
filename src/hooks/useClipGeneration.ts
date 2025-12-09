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
  bufferBefore?: number;
  bufferAfter?: number;
}

export interface ClipGenerationProgress {
  stage: 'idle' | 'loading' | 'downloading' | 'extracting' | 'uploading' | 'complete' | 'error';
  progress: number;
  message: string;
  currentClip?: number;
  totalClips?: number;
  downloadedMB?: number;
  totalMB?: number;
}

export function useClipGeneration() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
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
        progress: 5,
        message: 'Carregando processador de vídeo...'
      });

      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg Clip]', message);
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setIsLoaded(true);
      setProgress({
        stage: 'loading',
        progress: 10,
        message: 'Processador pronto!'
      });
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

  // Cancel current operation
  const cancel = useCallback(() => {
    setIsCancelled(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setProgress({
      stage: 'idle',
      progress: 0,
      message: 'Operação cancelada'
    });
    setIsGenerating(false);
    setGeneratingEventIds(new Set());
    toast.info('Extração de clips cancelada');
  }, []);

  // Download video with progress tracking
  const downloadVideoWithProgress = useCallback(async (url: string): Promise<Uint8Array | null> => {
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch(url, { 
        signal: abortControllerRef.current.signal 
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      const totalMB = totalBytes / (1024 * 1024);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        if (isCancelled) {
          reader.cancel();
          return null;
        }

        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedBytes += value.length;
        const downloadedMB = receivedBytes / (1024 * 1024);

        setProgress({
          stage: 'downloading',
          progress: 10 + (receivedBytes / totalBytes) * 20, // 10-30%
          message: `Baixando vídeo... ${downloadedMB.toFixed(1)}MB / ${totalMB.toFixed(1)}MB`,
          downloadedMB,
          totalMB
        });
      }

      // Combine chunks
      const videoData = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        videoData.set(chunk, offset);
        offset += chunk.length;
      }

      console.log(`[ClipGen] Video downloaded: ${(receivedBytes / (1024 * 1024)).toFixed(2)}MB`);
      return videoData;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return null;
      }
      throw error;
    }
  }, [isCancelled]);

  // Extract single clip from already loaded video
  const extractSingleClip = useCallback(async (
    ffmpeg: FFmpeg,
    config: ClipConfig,
    clipIndex: number,
    totalClips: number
  ): Promise<string | null> => {
    const {
      eventId,
      eventMinute,
      eventSecond = 0,
      videoStartMinute,
      videoEndMinute,
      videoDurationSeconds,
      matchId,
      bufferBefore = 10,
      bufferAfter = 10
    } = config;

    const eventVideoSeconds = calculateVideoTimestamp(
      eventMinute,
      eventSecond,
      videoStartMinute,
      videoEndMinute,
      videoDurationSeconds
    );

    const startTime = Math.max(0, eventVideoSeconds - bufferBefore);
    const duration = bufferBefore + bufferAfter;

    console.log(`[ClipGen] Extracting clip ${clipIndex + 1}/${totalClips}: event=${eventId}, start=${startTime.toFixed(1)}s, duration=${duration}s`);

    const baseProgress = 30 + ((clipIndex / totalClips) * 50); // 30-80%
    
    setProgress({
      stage: 'extracting',
      progress: baseProgress,
      message: `Extraindo clip ${clipIndex + 1}/${totalClips}...`,
      currentClip: clipIndex + 1,
      totalClips
    });

    const outputFile = `clip_${clipIndex}.mp4`;
    
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

    // Read and upload
    setProgress({
      stage: 'uploading',
      progress: baseProgress + 3,
      message: `Salvando clip ${clipIndex + 1}/${totalClips}...`,
      currentClip: clipIndex + 1,
      totalClips
    });

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
      console.error(`Upload error for clip ${eventId}:`, uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('event-clips')
      .getPublicUrl(fileName);

    const clipUrl = urlData.publicUrl;

    // Update database
    await supabase
      .from('match_events')
      .update({ clip_url: clipUrl })
      .eq('id', eventId);

    // Cleanup clip file
    try {
      await ffmpeg.deleteFile(outputFile);
    } catch (e) {
      // Ignore
    }

    return clipUrl;
  }, []);

  // OPTIMIZED: Generate all clips with single download
  const generateAllClipsOptimized = useCallback(async (configs: ClipConfig[]): Promise<void> => {
    if (configs.length === 0) return;

    setIsGenerating(true);
    setIsCancelled(false);
    setGeneratingEventIds(new Set(configs.map(c => c.eventId)));

    try {
      // 1. Load FFmpeg
      const loaded = await loadFFmpeg();
      if (!loaded || !ffmpegRef.current) {
        throw new Error('FFmpeg não carregado');
      }

      const ffmpeg = ffmpegRef.current;

      // 2. Download video ONCE
      setProgress({
        stage: 'downloading',
        progress: 10,
        message: 'Iniciando download do vídeo...'
      });

      const videoUrl = configs[0].videoUrl;
      const videoData = await downloadVideoWithProgress(videoUrl);

      if (!videoData || isCancelled) {
        setIsGenerating(false);
        return;
      }

      // 3. Write video to FFmpeg memory
      setProgress({
        stage: 'extracting',
        progress: 30,
        message: 'Preparando extração...'
      });

      await ffmpeg.writeFile('input.mp4', videoData);

      // 4. Extract each clip (video already in memory)
      let completed = 0;
      for (const config of configs) {
        if (isCancelled) break;

        const clipUrl = await extractSingleClip(ffmpeg, config, completed, configs.length);
        if (clipUrl) {
          completed++;
        }
      }

      // 5. Cleanup input file
      try {
        await ffmpeg.deleteFile('input.mp4');
      } catch (e) {
        // Ignore
      }

      if (!isCancelled) {
        setProgress({
          stage: 'complete',
          progress: 100,
          message: `${completed} clips gerados com sucesso!`,
          currentClip: completed,
          totalClips: configs.length
        });
        toast.success(`${completed} clips extraídos e salvos!`);
      }

    } catch (error) {
      console.error('Error in batch clip generation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setProgress({
        stage: 'error',
        progress: 0,
        message: `Erro: ${errorMessage}`
      });
      toast.error(`Erro ao gerar clips: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
      setGeneratingEventIds(new Set());
    }
  }, [loadFFmpeg, downloadVideoWithProgress, extractSingleClip, isCancelled]);

  // Single clip generation (for individual extraction)
  const generateClip = useCallback(async (config: ClipConfig): Promise<string | null> => {
    setGeneratingEventIds(prev => new Set(prev).add(config.eventId));
    setIsGenerating(true);

    try {
      const loaded = await loadFFmpeg();
      if (!loaded || !ffmpegRef.current) {
        throw new Error('FFmpeg não carregado');
      }

      const ffmpeg = ffmpegRef.current;

      setProgress({
        stage: 'downloading',
        progress: 15,
        message: 'Baixando vídeo...'
      });

      const videoData = await downloadVideoWithProgress(config.videoUrl);
      if (!videoData) return null;

      await ffmpeg.writeFile('input.mp4', videoData);

      const clipUrl = await extractSingleClip(ffmpeg, config, 0, 1);

      try {
        await ffmpeg.deleteFile('input.mp4');
      } catch (e) {}

      if (clipUrl) {
        setProgress({
          stage: 'complete',
          progress: 100,
          message: 'Clip gerado com sucesso!'
        });
        toast.success('Clip extraído e salvo!');
      }

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
        next.delete(config.eventId);
        return next;
      });
      if (generatingEventIds.size <= 1) {
        setIsGenerating(false);
      }
    }
  }, [loadFFmpeg, downloadVideoWithProgress, extractSingleClip, generatingEventIds]);

  // Legacy function name for compatibility
  const generateAllClips = generateAllClipsOptimized;

  const isGeneratingEvent = useCallback((eventId: string) => {
    return generatingEventIds.has(eventId);
  }, [generatingEventIds]);

  const reset = useCallback(() => {
    setProgress({
      stage: 'idle',
      progress: 0,
      message: ''
    });
    setIsCancelled(false);
  }, []);

  return {
    isLoaded,
    isGenerating,
    progress,
    generateClip,
    generateAllClips,
    generateAllClipsOptimized,
    isGeneratingEvent,
    generatingEventIds,
    reset,
    cancel,
    isCancelled
  };
}
