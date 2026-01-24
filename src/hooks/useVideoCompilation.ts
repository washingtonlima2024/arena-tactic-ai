// Video compilation hook - delegates all processing to backend Python server
// No longer uses FFmpeg.wasm - all video processing is done server-side

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useVignetteGenerator } from './useVignetteGenerator';

export interface CompilationClip {
  id: string;
  clipUrl: string;
  eventType: string;
  minute: number;
  description?: string;
  thumbnailUrl?: string;
}

export interface CompilationConfig {
  clips: CompilationClip[];
  includeVignettes: boolean;
  includeSubtitles: boolean;
  format: '9:16' | '16:9' | '1:1' | '4:5';
  matchInfo: {
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
  };
}

export interface CompilationProgress {
  stage: 'idle' | 'loading' | 'downloading' | 'generating-vignettes' | 'processing' | 'concatenating' | 'complete' | 'error';
  progress: number;
  message: string;
  currentStep?: number;
  totalSteps?: number;
}

export function useVideoCompilation() {
  const [isCompiling, setIsCompiling] = useState(false);
  const [progress, setProgress] = useState<CompilationProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const [isCancelled, setIsCancelled] = useState(false);

  const vignetteGenerator = useVignetteGenerator();

  // Download single clip directly
  const downloadSingleClip = useCallback(async (
    clipUrl: string,
    filename: string
  ): Promise<void> => {
    try {
      setProgress({ stage: 'downloading', progress: 20, message: 'Baixando clip...' });
      
      const response = await fetch(clipUrl);
      const blob = await response.blob();
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress({ stage: 'complete', progress: 100, message: 'Download concluído!' });
    } catch (error) {
      console.error('Erro no download:', error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erro no download'
      });
    }
  }, []);

  // Compile playlist via backend server
  const compilePlaylist = useCallback(async (config: CompilationConfig): Promise<Blob | null> => {
    if (config.clips.length === 0) return null;

    setIsCompiling(true);
    setIsCancelled(false);

    try {
      setProgress({
        stage: 'processing',
        progress: 10,
        message: 'Enviando para compilação no servidor...'
      });

      // Send compilation request to backend via generic post
      const result = await apiClient.post<{ videoUrl?: string; success?: boolean }>('/api/compile-playlist', {
        clipIds: config.clips.map(c => c.id),
        format: config.format,
        includeVignettes: config.includeVignettes,
        includeSubtitles: config.includeSubtitles,
        matchInfo: config.matchInfo
      });

      if (result?.videoUrl) {
        setProgress({
          stage: 'downloading',
          progress: 80,
          message: 'Baixando vídeo compilado...'
        });

        // Download the compiled video
        const response = await fetch(result.videoUrl);
        const blob = await response.blob();

        setProgress({
          stage: 'complete',
          progress: 100,
          message: 'Vídeo compilado com sucesso!'
        });

        return blob;
      } else {
        throw new Error('Servidor não retornou URL do vídeo. Use o download individual de clips.');
      }

    } catch (error) {
      console.error('Erro na compilação:', error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: 'Compilação não disponível. Use o download individual de clips.'
      });
      return null;
    } finally {
      setIsCompiling(false);
    }
  }, []);

  // Download compiled video
  const downloadCompilation = useCallback(async (config: CompilationConfig): Promise<void> => {
    const blob = await compilePlaylist(config);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.matchInfo.homeTeam}_vs_${config.matchInfo.awayTeam}_highlights.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [compilePlaylist]);

  // Cancel compilation
  const cancel = useCallback(() => {
    setIsCancelled(true);
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setProgress({ stage: 'idle', progress: 0, message: '' });
    setIsCompiling(false);
    setIsCancelled(false);
  }, []);

  return {
    isCompiling,
    progress,
    isCancelled,
    downloadSingleClip,
    compilePlaylist,
    downloadCompilation,
    cancel,
    reset
  };
}
