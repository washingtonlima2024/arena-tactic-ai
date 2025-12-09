import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface ClipConfig {
  eventId: string;
  // Segundos diretos do vídeo (do metadata)
  videoSecondStart: number;
  videoSecondEnd: number;
  videoUrl: string;
  matchId: string;
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
        console.log('[FFmpeg]', message);
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
      console.error('Erro ao carregar FFmpeg:', error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: 'Erro ao carregar processador de vídeo'
      });
      return false;
    }
  }, [isLoaded]);

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
    toast.info('Extração cancelada');
  }, []);

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
      if (!reader) throw new Error('Reader não disponível');

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
          progress: 10 + (receivedBytes / totalBytes) * 20,
          message: `Baixando vídeo... ${downloadedMB.toFixed(1)}MB / ${totalMB.toFixed(1)}MB`,
          downloadedMB,
          totalMB
        });
      }

      const videoData = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        videoData.set(chunk, offset);
        offset += chunk.length;
      }

      console.log(`Vídeo baixado: ${(receivedBytes / (1024 * 1024)).toFixed(2)}MB`);
      return videoData;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return null;
      }
      throw error;
    }
  }, [isCancelled]);

  // Extrai clip usando segundos diretos
  const extractSingleClip = useCallback(async (
    ffmpeg: FFmpeg,
    config: ClipConfig,
    clipIndex: number,
    totalClips: number
  ): Promise<string | null> => {
    const { eventId, videoSecondStart, videoSecondEnd, matchId } = config;

    const startTime = Math.max(0, videoSecondStart);
    const duration = videoSecondEnd - videoSecondStart;

    console.log(`[Clip ${clipIndex + 1}/${totalClips}] ${eventId}: ${startTime}s -> ${videoSecondEnd}s (duração: ${duration}s)`);

    const baseProgress = 30 + ((clipIndex / totalClips) * 50);
    
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
      console.error(`Erro no upload do clip ${eventId}:`, uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('event-clips')
      .getPublicUrl(fileName);

    const clipUrl = urlData.publicUrl;

    await supabase
      .from('match_events')
      .update({ clip_url: clipUrl })
      .eq('id', eventId);

    try {
      await ffmpeg.deleteFile(outputFile);
    } catch (e) {}

    return clipUrl;
  }, []);

  // Gerar todos os clips de uma vez
  const generateAllClips = useCallback(async (configs: ClipConfig[]): Promise<void> => {
    if (configs.length === 0) return;

    setIsGenerating(true);
    setIsCancelled(false);
    setGeneratingEventIds(new Set(configs.map(c => c.eventId)));

    try {
      const loaded = await loadFFmpeg();
      if (!loaded || !ffmpegRef.current) {
        throw new Error('FFmpeg não carregado');
      }

      const ffmpeg = ffmpegRef.current;

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

      setProgress({
        stage: 'extracting',
        progress: 30,
        message: 'Preparando extração...'
      });

      await ffmpeg.writeFile('input.mp4', videoData);

      let completed = 0;
      for (const config of configs) {
        if (isCancelled) break;

        const clipUrl = await extractSingleClip(ffmpeg, config, completed, configs.length);
        if (clipUrl) {
          completed++;
        }
      }

      try {
        await ffmpeg.deleteFile('input.mp4');
      } catch (e) {}

      if (!isCancelled) {
        setProgress({
          stage: 'complete',
          progress: 100,
          message: `${completed} clips gerados!`,
          currentClip: completed,
          totalClips: configs.length
        });
        toast.success(`${completed} clips extraídos!`);
      }

    } catch (error) {
      console.error('Erro na geração de clips:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setProgress({
        stage: 'error',
        progress: 0,
        message: `Erro: ${errorMessage}`
      });
      toast.error(`Erro: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
      setGeneratingEventIds(new Set());
    }
  }, [loadFFmpeg, downloadVideoWithProgress, extractSingleClip, isCancelled]);

  // Gerar um único clip
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
          message: 'Clip gerado!'
        });
        toast.success('Clip extraído!');
      }

      return clipUrl;

    } catch (error) {
      console.error('Erro ao gerar clip:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setProgress({
        stage: 'error',
        progress: 0,
        message: `Erro: ${errorMessage}`
      });
      toast.error(`Erro: ${errorMessage}`);
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
    isGeneratingEvent,
    generatingEventIds,
    reset,
    cancel,
    isCancelled
  };
}
