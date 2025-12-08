import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { toast } from 'sonner';

export interface VideoGenerationConfig {
  clips: {
    id: string;
    url: string;
    startTime: number;
    endTime: number;
    title: string;
  }[];
  format: {
    width: number;
    height: number;
    ratio: string;
  };
  includeVignettes: boolean;
  vignetteColor?: string;
  outputName?: string;
}

export interface GenerationProgress {
  stage: 'loading' | 'processing' | 'encoding' | 'finalizing' | 'complete' | 'error';
  progress: number;
  message: string;
  currentClip?: number;
  totalClips?: number;
}

export function useVideoGeneration() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress>({
    stage: 'loading',
    progress: 0,
    message: 'Inicializando...'
  });
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

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
        console.log('[FFmpeg]', message);
      });

      ffmpeg.on('progress', ({ progress: p }) => {
        setProgress(prev => ({
          ...prev,
          progress: Math.min(90, 20 + (p * 70)),
          message: `Processando... ${Math.round(p * 100)}%`
        }));
      });

      // Load FFmpeg WASM from CDN
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setIsLoaded(true);
      setProgress({
        stage: 'processing',
        progress: 20,
        message: 'Processador carregado!'
      });

      return true;
    } catch (error) {
      console.error('Error loading FFmpeg:', error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: 'Erro ao carregar processador de vídeo'
      });
      toast.error('Erro ao carregar o processador de vídeo');
      return false;
    }
  }, [isLoaded]);

  const generateHighlightsVideo = useCallback(async (config: VideoGenerationConfig): Promise<string | null> => {
    setIsGenerating(true);
    setGeneratedVideoUrl(null);

    try {
      const loaded = await loadFFmpeg();
      if (!loaded || !ffmpegRef.current) {
        throw new Error('FFmpeg não carregado');
      }

      const ffmpeg = ffmpegRef.current;
      const { clips, format, includeVignettes, outputName = 'highlights' } = config;

      if (clips.length === 0) {
        throw new Error('Nenhum clipe selecionado');
      }

      setProgress({
        stage: 'processing',
        progress: 25,
        message: 'Preparando clipes...',
        currentClip: 0,
        totalClips: clips.length
      });

      // Download and write each clip to FFmpeg virtual filesystem
      const clipFiles: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        setProgress({
          stage: 'processing',
          progress: 25 + (i / clips.length) * 30,
          message: `Baixando clipe ${i + 1}/${clips.length}... (pode demorar)`,
          currentClip: i + 1,
          totalClips: clips.length
        });

        try {
          console.log(`[VideoGen] Downloading clip ${i + 1}: ${clip.url.substring(0, 50)}...`);
          const inputFile = `input_${i}.mp4`;
          
          // Use fetch with timeout for large files
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout
          
          const response = await fetch(clip.url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          console.log(`[VideoGen] Clip ${i + 1} downloaded: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);
          
          await ffmpeg.writeFile(inputFile, new Uint8Array(arrayBuffer));
          clipFiles.push(inputFile);
          console.log(`[VideoGen] Clip ${i + 1} written to FFmpeg`);
        } catch (error) {
          console.error(`[VideoGen] Error loading clip ${i}:`, error);
          // Continue with other clips
        }
      }

      if (clipFiles.length === 0) {
        throw new Error('Não foi possível carregar nenhum clipe');
      }

      setProgress({
        stage: 'encoding',
        progress: 60,
        message: 'Montando vídeo...'
      });

      // Create concat file list
      const concatList = clipFiles.map(f => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('concat_list.txt', concatList);

      // Build FFmpeg command for concatenation with scaling
      const outputFile = `${outputName}.mp4`;
      
      // Use filter_complex for scaling and concatenation
      if (clipFiles.length === 1) {
        // Single clip - just scale
        await ffmpeg.exec([
          '-i', clipFiles[0],
          '-vf', `scale=${format.width}:${format.height}:force_original_aspect_ratio=decrease,pad=${format.width}:${format.height}:(ow-iw)/2:(oh-ih)/2:black`,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          outputFile
        ]);
      } else {
        // Multiple clips - scale each and concat
        // First, scale each video
        const scaledFiles: string[] = [];
        for (let i = 0; i < clipFiles.length; i++) {
          const scaledFile = `scaled_${i}.mp4`;
          setProgress({
            stage: 'encoding',
            progress: 60 + (i / clipFiles.length) * 20,
            message: `Processando clipe ${i + 1}/${clipFiles.length}...`,
            currentClip: i + 1,
            totalClips: clipFiles.length
          });

          await ffmpeg.exec([
            '-i', clipFiles[i],
            '-vf', `scale=${format.width}:${format.height}:force_original_aspect_ratio=decrease,pad=${format.width}:${format.height}:(ow-iw)/2:(oh-ih)/2:black`,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            scaledFile
          ]);
          scaledFiles.push(scaledFile);
        }

        // Create new concat list with scaled files
        const scaledConcatList = scaledFiles.map(f => `file '${f}'`).join('\n');
        await ffmpeg.writeFile('scaled_concat.txt', scaledConcatList);

        setProgress({
          stage: 'finalizing',
          progress: 85,
          message: 'Finalizando vídeo...'
        });

        // Concatenate scaled videos
        await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', 'scaled_concat.txt',
          '-c', 'copy',
          '-movflags', '+faststart',
          outputFile
        ]);

        // Cleanup scaled files
        for (const file of scaledFiles) {
          try {
            await ffmpeg.deleteFile(file);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      }

      setProgress({
        stage: 'finalizing',
        progress: 95,
        message: 'Gerando arquivo final...'
      });

      // Read output file and create blob URL
      const data = await ffmpeg.readFile(outputFile);
      // Handle the FileData type properly
      let videoBlob: Blob;
      if (typeof data === 'string') {
        // If it's a string, convert to blob
        videoBlob = new Blob([data], { type: 'video/mp4' });
      } else {
        // If it's Uint8Array, slice it to get a regular ArrayBuffer
        videoBlob = new Blob([data.slice().buffer], { type: 'video/mp4' });
      }
      const videoUrl = URL.createObjectURL(videoBlob);

      // Cleanup input files
      for (const file of clipFiles) {
        try {
          await ffmpeg.deleteFile(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      try {
        await ffmpeg.deleteFile('concat_list.txt');
        await ffmpeg.deleteFile('scaled_concat.txt');
        await ffmpeg.deleteFile(outputFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      setGeneratedVideoUrl(videoUrl);
      setProgress({
        stage: 'complete',
        progress: 100,
        message: 'Vídeo gerado com sucesso!'
      });

      toast.success('Vídeo de melhores momentos gerado!');
      return videoUrl;

    } catch (error) {
      console.error('Error generating video:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setProgress({
        stage: 'error',
        progress: 0,
        message: `Erro: ${errorMessage}`
      });
      toast.error(`Erro ao gerar vídeo: ${errorMessage}`);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [loadFFmpeg]);

  const downloadVideo = useCallback((url: string, filename: string = 'highlights.mp4') => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const reset = useCallback(() => {
    if (generatedVideoUrl) {
      URL.revokeObjectURL(generatedVideoUrl);
    }
    setGeneratedVideoUrl(null);
    setProgress({
      stage: 'loading',
      progress: 0,
      message: 'Inicializando...'
    });
  }, [generatedVideoUrl]);

  return {
    isLoaded,
    isGenerating,
    progress,
    generatedVideoUrl,
    generateHighlightsVideo,
    downloadVideo,
    reset
  };
}
