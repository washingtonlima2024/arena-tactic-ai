import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { toast } from 'sonner';
import { SmartClip } from '@/components/smart-editor/ClipsList';

export interface VignetteConfig {
  channelName: string;
  openingText: string;
  transitionText: string;
  closingText: string;
}

export interface RenderConfig {
  videoUrl: string;
  clips: SmartClip[];
  vignettes: VignetteConfig;
  format?: {
    width: number;
    height: number;
  };
}

export interface RenderProgress {
  stage: 'loading' | 'downloading' | 'extracting' | 'vignettes' | 'encoding' | 'complete' | 'error';
  progress: number;
  message: string;
  currentStep?: number;
  totalSteps?: number;
}

export function useSmartVideoRender() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState<RenderProgress>({
    stage: 'loading',
    progress: 0,
    message: 'Inicializando...'
  });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const abortRef = useRef(false);

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

      ffmpeg.on('progress', ({ progress: p }) => {
        setProgress(prev => ({
          ...prev,
          progress: Math.min(prev.progress + (p * 5), 95)
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
        message: 'Erro ao carregar processador'
      });
      return false;
    }
  }, [isLoaded]);

  // Generate vignette video using FFmpeg filters
  const generateVignette = async (
    ffmpeg: FFmpeg,
    type: 'opening' | 'transition' | 'closing',
    text: string,
    channelName: string,
    outputFile: string,
    width: number,
    height: number,
    duration: number = 3
  ) => {
    // Color gradients based on type
    const colors = {
      opening: { start: '0x10b981', end: '0x0d9488' },
      transition: { start: '0x1e293b', end: '0x334155' },
      closing: { start: '0x0891b2', end: '0x10b981' }
    };

    const color = colors[type];
    
    // Create solid color background with gradient effect simulation
    // FFmpeg doesn't have gradient easily, so we use a solid color
    const bgColor = type === 'transition' ? '0x1e293b' : '0x10b981';
    
    // Text styling
    const fontSize = type === 'transition' ? Math.floor(height / 12) : Math.floor(height / 8);
    const channelFontSize = Math.floor(height / 20);
    
    // Build filter for text overlay
    let filterComplex = '';
    
    if (type === 'opening' || type === 'closing') {
      // Channel name + main text
      filterComplex = `color=c=${bgColor}:s=${width}x${height}:d=${duration},` +
        `drawtext=text='${channelName}':fontsize=${channelFontSize}:fontcolor=white@0.7:x=(w-tw)/2:y=h/3:` +
        `enable='between(t,0.3,${duration - 0.3})',` +
        `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=white:x=(w-tw)/2:y=(h-th)/2:` +
        `enable='between(t,0.5,${duration - 0.3})',` +
        `fade=t=in:st=0:d=0.5,fade=t=out:st=${duration - 0.5}:d=0.5`;
    } else {
      // Transition - just main text
      filterComplex = `color=c=${bgColor}:s=${width}x${height}:d=${duration},` +
        `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=white:x=(w-tw)/2:y=(h-th)/2:` +
        `enable='between(t,0.3,${duration - 0.3})',` +
        `fade=t=in:st=0:d=0.3,fade=t=out:st=${duration - 0.3}:d=0.3`;
    }

    // Generate silent audio track
    await ffmpeg.exec([
      '-f', 'lavfi',
      '-i', filterComplex,
      '-f', 'lavfi',
      '-i', `anullsrc=r=44100:cl=stereo:d=${duration}`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-y',
      outputFile
    ]);
  };

  const renderSmartVideo = useCallback(async (config: RenderConfig): Promise<string | null> => {
    setIsRendering(true);
    setVideoUrl(null);
    abortRef.current = false;

    const { videoUrl: sourceUrl, clips, vignettes } = config;
    const width = config.format?.width || 1280;
    const height = config.format?.height || 720;
    const enabledClips = clips.filter(c => c.is_enabled);

    if (enabledClips.length === 0) {
      toast.error('Selecione pelo menos um clip');
      setIsRendering(false);
      return null;
    }

    try {
      // Load FFmpeg
      const loaded = await loadFFmpeg();
      if (!loaded || !ffmpegRef.current) {
        throw new Error('FFmpeg não carregado');
      }

      const ffmpeg = ffmpegRef.current;
      const filesToConcat: string[] = [];

      // Step 1: Download source video
      setProgress({
        stage: 'downloading',
        progress: 10,
        message: 'Baixando vídeo fonte...'
      });

      console.log('[SmartRender] Downloading source video...');
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error('Falha ao baixar vídeo');
      
      const videoData = await response.arrayBuffer();
      console.log(`[SmartRender] Video downloaded: ${(videoData.byteLength / 1024 / 1024).toFixed(2)}MB`);
      
      await ffmpeg.writeFile('source.mp4', new Uint8Array(videoData));

      if (abortRef.current) throw new Error('Cancelado');

      // Step 2: Generate opening vignette
      setProgress({
        stage: 'vignettes',
        progress: 20,
        message: 'Gerando vinheta de abertura...',
        currentStep: 1,
        totalSteps: enabledClips.length + 2
      });

      await generateVignette(
        ffmpeg,
        'opening',
        vignettes.openingText,
        vignettes.channelName,
        'vignette_opening.mp4',
        width,
        height,
        3
      );
      filesToConcat.push('vignette_opening.mp4');

      if (abortRef.current) throw new Error('Cancelado');

      // Step 3: Extract clips and add transitions
      for (let i = 0; i < enabledClips.length; i++) {
        const clip = enabledClips[i];
        
        setProgress({
          stage: 'extracting',
          progress: 25 + (i / enabledClips.length) * 50,
          message: `Extraindo clip ${i + 1}/${enabledClips.length}: ${clip.title || 'Clip'}...`,
          currentStep: i + 2,
          totalSteps: enabledClips.length + 2
        });

        const clipFile = `clip_${i}.mp4`;
        const duration = clip.end_second - clip.start_second;

        // Extract clip from source video
        await ffmpeg.exec([
          '-ss', clip.start_second.toString(),
          '-i', 'source.mp4',
          '-t', duration.toString(),
          '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ar', '44100',
          '-y',
          clipFile
        ]);

        filesToConcat.push(clipFile);

        if (abortRef.current) throw new Error('Cancelado');

        // Add transition vignette between clips (not after last)
        if (i < enabledClips.length - 1) {
          setProgress({
            stage: 'vignettes',
            progress: 25 + ((i + 0.5) / enabledClips.length) * 50,
            message: 'Gerando transição...'
          });

          const transitionFile = `transition_${i}.mp4`;
          await generateVignette(
            ffmpeg,
            'transition',
            vignettes.transitionText,
            vignettes.channelName,
            transitionFile,
            width,
            height,
            2
          );
          filesToConcat.push(transitionFile);
        }

        if (abortRef.current) throw new Error('Cancelado');
      }

      // Step 4: Generate closing vignette
      setProgress({
        stage: 'vignettes',
        progress: 80,
        message: 'Gerando vinheta de encerramento...'
      });

      await generateVignette(
        ffmpeg,
        'closing',
        vignettes.closingText,
        vignettes.channelName,
        'vignette_closing.mp4',
        width,
        height,
        3
      );
      filesToConcat.push('vignette_closing.mp4');

      if (abortRef.current) throw new Error('Cancelado');

      // Step 5: Concatenate all files
      setProgress({
        stage: 'encoding',
        progress: 85,
        message: 'Montando vídeo final...'
      });

      // Create concat list
      const concatList = filesToConcat.map(f => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('concat_list.txt', concatList);

      console.log('[SmartRender] Concatenating files:', filesToConcat);

      // Final concat
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat_list.txt',
        '-c', 'copy',
        '-movflags', '+faststart',
        '-y',
        'output.mp4'
      ]);

      setProgress({
        stage: 'encoding',
        progress: 95,
        message: 'Finalizando...'
      });

      // Read output
      const outputData = await ffmpeg.readFile('output.mp4');
      let blob: Blob;
      if (typeof outputData === 'string') {
        blob = new Blob([outputData], { type: 'video/mp4' });
      } else {
        blob = new Blob([outputData.slice().buffer], { type: 'video/mp4' });
      }

      const url = URL.createObjectURL(blob);
      setVideoUrl(url);

      // Cleanup
      for (const file of [...filesToConcat, 'source.mp4', 'concat_list.txt', 'output.mp4']) {
        try { await ffmpeg.deleteFile(file); } catch {}
      }

      setProgress({
        stage: 'complete',
        progress: 100,
        message: 'Vídeo renderizado com sucesso!'
      });

      toast.success('Vídeo renderizado!');
      return url;

    } catch (error) {
      console.error('[SmartRender] Error:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      setProgress({
        stage: 'error',
        progress: 0,
        message: `Erro: ${message}`
      });
      if (message !== 'Cancelado') {
        toast.error(`Erro na renderização: ${message}`);
      }
      return null;
    } finally {
      setIsRendering(false);
    }
  }, [loadFFmpeg]);

  const cancel = useCallback(() => {
    abortRef.current = true;
    setProgress({
      stage: 'error',
      progress: 0,
      message: 'Cancelado pelo usuário'
    });
    toast.info('Renderização cancelada');
  }, []);

  const downloadVideo = useCallback((url: string, filename: string = 'smart_video.mp4') => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const reset = useCallback(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoUrl(null);
    setProgress({
      stage: 'loading',
      progress: 0,
      message: 'Inicializando...'
    });
  }, [videoUrl]);

  return {
    isLoaded,
    isRendering,
    progress,
    videoUrl,
    renderSmartVideo,
    cancel,
    downloadVideo,
    reset
  };
}

export default useSmartVideoRender;
