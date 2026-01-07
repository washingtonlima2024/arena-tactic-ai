// Video compilation hook - combines clips with vignettes and subtitles
// Uses FFmpeg.wasm for all video processing

import { useState, useCallback, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
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

// Format dimensions
const FORMAT_DIMENSIONS = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 }
};

// Vignette durations in seconds
const VIGNETTE_DURATIONS = {
  opening: 3,
  clip: 2,
  transition: 1.5,
  closing: 2
};

export function useVideoCompilation() {
  const [isCompiling, setIsCompiling] = useState(false);
  const [progress, setProgress] = useState<CompilationProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const [isCancelled, setIsCancelled] = useState(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const cancelRef = useRef(false);

  const vignetteGenerator = useVignetteGenerator();

  // Load FFmpeg
  const loadFFmpeg = async () => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;

    setProgress({ stage: 'loading', progress: 5, message: 'Carregando processador de vídeo...' });

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    // Use UMD version for better browser compatibility
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
  };

  // Convert image to video segment
  const imageToVideo = async (
    ffmpeg: FFmpeg, 
    imageBlob: Blob, 
    outputName: string, 
    durationSeconds: number,
    dimensions: { width: number; height: number }
  ): Promise<void> => {
    const imageData = new Uint8Array(await imageBlob.arrayBuffer());
    await ffmpeg.writeFile('temp_image.png', imageData);

    await ffmpeg.exec([
      '-loop', '1',
      '-i', 'temp_image.png',
      '-t', durationSeconds.toString(),
      '-vf', `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:black`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      outputName
    ]);

    await ffmpeg.deleteFile('temp_image.png');
  };

  // Add subtitle to clip
  const addSubtitleToClip = async (
    ffmpeg: FFmpeg,
    inputName: string,
    outputName: string,
    subtitle: string,
    dimensions: { width: number; height: number }
  ): Promise<void> => {
    // Escape special characters for FFmpeg drawtext
    const escapedSubtitle = subtitle
      .replace(/'/g, "\\'")
      .replace(/:/g, "\\:")
      .replace(/\\/g, '\\\\');

    const fontSize = Math.round(dimensions.width / 30);
    const boxPadding = Math.round(fontSize / 2);
    const yPosition = dimensions.height - fontSize * 3;

    await ffmpeg.exec([
      '-i', inputName,
      '-vf', `drawtext=text='${escapedSubtitle}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=black@0.7:boxborderw=${boxPadding}`,
      '-c:v', 'libx264',
      '-c:a', 'copy',
      '-pix_fmt', 'yuv420p',
      outputName
    ]);
  };

  // Process single clip (format and optionally add subtitle)
  const processClip = async (
    ffmpeg: FFmpeg,
    clipBlob: Blob,
    outputName: string,
    dimensions: { width: number; height: number },
    subtitle?: string
  ): Promise<void> => {
    const clipData = new Uint8Array(await clipBlob.arrayBuffer());
    await ffmpeg.writeFile('temp_clip.mp4', clipData);

    if (subtitle) {
      // First scale, then add subtitle
      await ffmpeg.exec([
        '-i', 'temp_clip.mp4',
        '-vf', `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:black`,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        'temp_scaled.mp4'
      ]);

      await addSubtitleToClip(ffmpeg, 'temp_scaled.mp4', outputName, subtitle, dimensions);
      await ffmpeg.deleteFile('temp_scaled.mp4');
    } else {
      await ffmpeg.exec([
        '-i', 'temp_clip.mp4',
        '-vf', `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:black`,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        outputName
      ]);
    }

    await ffmpeg.deleteFile('temp_clip.mp4');
  };

  // Download single clip
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

  // Compile multiple clips with vignettes and subtitles
  const compilePlaylist = useCallback(async (config: CompilationConfig): Promise<Blob | null> => {
    if (config.clips.length === 0) return null;

    setIsCompiling(true);
    cancelRef.current = false;
    setIsCancelled(false);

    const dimensions = FORMAT_DIMENSIONS[config.format];
    const vignetteConfig = { ...dimensions, format: config.format };

    try {
      const ffmpeg = await loadFFmpeg();
      if (cancelRef.current) return null;

      const segments: string[] = [];
      let currentStep = 0;
      const totalSteps = config.clips.length + (config.includeVignettes ? 2 : 0);

      // Generate opening vignette
      if (config.includeVignettes) {
        setProgress({
          stage: 'generating-vignettes',
          progress: 10,
          message: 'Gerando vinheta de abertura...',
          currentStep: ++currentStep,
          totalSteps
        });

        const openingBlob = await vignetteGenerator.generateOpeningVignette({
          homeTeam: config.matchInfo.homeTeam,
          awayTeam: config.matchInfo.awayTeam,
          homeScore: config.matchInfo.homeScore,
          awayScore: config.matchInfo.awayScore
        }, vignetteConfig);

        await imageToVideo(ffmpeg, openingBlob, 'opening.mp4', VIGNETTE_DURATIONS.opening, dimensions);
        segments.push('opening.mp4');
      }

      // Process each clip
      for (let i = 0; i < config.clips.length; i++) {
        if (cancelRef.current) {
          setProgress({ stage: 'idle', progress: 0, message: 'Compilação cancelada' });
          return null;
        }

        const clip = config.clips[i];
        currentStep++;

        setProgress({
          stage: 'processing',
          progress: 15 + (i / config.clips.length) * 60,
          message: `Processando clip ${i + 1}/${config.clips.length} (${clip.minute}')`,
          currentStep,
          totalSteps
        });

        // Generate clip intro vignette
        if (config.includeVignettes) {
          const clipVignetteBlob = await vignetteGenerator.generateClipVignette({
            eventType: clip.eventType,
            minute: clip.minute,
            title: clip.description || clip.eventType.replace(/_/g, ' '),
            thumbnailUrl: clip.thumbnailUrl
          }, vignetteConfig);

          await imageToVideo(ffmpeg, clipVignetteBlob, `clip_intro_${i}.mp4`, VIGNETTE_DURATIONS.clip, dimensions);
          segments.push(`clip_intro_${i}.mp4`);
        }

        // Download and process clip
        setProgress(prev => ({ ...prev, message: `Baixando clip ${i + 1}...` }));
        const clipResponse = await fetch(clip.clipUrl);
        const clipBlob = await clipResponse.blob();

        await processClip(
          ffmpeg,
          clipBlob,
          `clip_${i}.mp4`,
          dimensions,
          config.includeSubtitles ? clip.description : undefined
        );
        segments.push(`clip_${i}.mp4`);

        // Generate transition vignette (if not last clip)
        if (config.includeVignettes && i < config.clips.length - 1) {
          const nextClip = config.clips[i + 1];
          const transitionBlob = await vignetteGenerator.generateTransitionVignette({
            nextMinute: nextClip.minute,
            nextEventType: nextClip.eventType
          }, vignetteConfig);

          await imageToVideo(ffmpeg, transitionBlob, `transition_${i}.mp4`, VIGNETTE_DURATIONS.transition, dimensions);
          segments.push(`transition_${i}.mp4`);
        }
      }

      // Generate closing vignette
      if (config.includeVignettes) {
        setProgress({
          stage: 'generating-vignettes',
          progress: 80,
          message: 'Gerando vinheta de encerramento...',
          currentStep: ++currentStep,
          totalSteps
        });

        const closingBlob = await vignetteGenerator.generateClosingVignette({
          clipCount: config.clips.length
        }, vignetteConfig);

        await imageToVideo(ffmpeg, closingBlob, 'closing.mp4', VIGNETTE_DURATIONS.closing, dimensions);
        segments.push('closing.mp4');
      }

      // Create concat file
      setProgress({
        stage: 'concatenating',
        progress: 85,
        message: 'Concatenando segmentos...'
      });

      const concatContent = segments.map(s => `file '${s}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatContent);

      // Concatenate all segments
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        'output.mp4'
      ]);

      // Read final output
      const outputData = await ffmpeg.readFile('output.mp4');
      let outputBlob: Blob;
      if (outputData instanceof Uint8Array) {
        const buffer = new ArrayBuffer(outputData.length);
        const view = new Uint8Array(buffer);
        view.set(outputData);
        outputBlob = new Blob([buffer], { type: 'video/mp4' });
      } else {
        outputBlob = new Blob([outputData], { type: 'video/mp4' });
      }

      // Cleanup
      for (const segment of segments) {
        try {
          await ffmpeg.deleteFile(segment);
        } catch { /* ignore */ }
      }
      await ffmpeg.deleteFile('concat.txt');
      await ffmpeg.deleteFile('output.mp4');

      setProgress({
        stage: 'complete',
        progress: 100,
        message: 'Vídeo compilado com sucesso!'
      });

      return outputBlob;

    } catch (error) {
      console.error('Erro na compilação:', error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erro na compilação'
      });
      return null;
    } finally {
      setIsCompiling(false);
    }
  }, [vignetteGenerator]);

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
    cancelRef.current = true;
    setIsCancelled(true);
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setProgress({ stage: 'idle', progress: 0, message: '' });
    setIsCompiling(false);
    setIsCancelled(false);
    cancelRef.current = false;
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
