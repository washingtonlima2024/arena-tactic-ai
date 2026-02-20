// Video compilation hook - client-side rendering with Canvas API + MediaRecorder
// Embeds vignettes directly into the exported video without server dependency

import { useState, useCallback, useRef } from 'react';
import { useVignetteGenerator } from './useVignetteGenerator';
import type {
  OpeningVignetteData,
  ClipVignetteData,
  TransitionVignetteData,
  ClosingVignetteData,
  VignetteConfig,
} from './useVignetteGenerator';

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

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 720, height: 1280 },
  '16:9': { width: 1280, height: 720 },
  '1:1':  { width: 720, height: 720 },
  '4:5':  { width: 720, height: 900 },
};

// Render an image on canvas for a specified duration
function renderImageOnCanvas(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
  durationMs: number,
  cancelRef: React.MutableRefObject<boolean>
): Promise<void> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    let rafId: number;

    const draw = (now: number) => {
      if (cancelRef.current) { resolve(); return; }
      ctx.drawImage(bitmap, 0, 0, width, height);
      if (now - startTime < durationMs) {
        rafId = requestAnimationFrame(draw);
      } else {
        resolve();
      }
    };
    rafId = requestAnimationFrame(draw);

    // Safety timeout
    setTimeout(() => {
      cancelAnimationFrame(rafId);
      resolve();
    }, durationMs + 200);
  });
}

// Render a video element on canvas until it ends
function renderVideoOnCanvas(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  cancelRef: React.MutableRefObject<boolean>
): Promise<void> {
  return new Promise((resolve) => {
    let rafId: number;

    const draw = () => {
      if (cancelRef.current) { resolve(); return; }
      if (!video.ended && !video.paused) {
        ctx.drawImage(video, 0, 0, width, height);
      }
      if (!video.ended) {
        rafId = requestAnimationFrame(draw);
      } else {
        resolve();
      }
    };

    video.addEventListener('ended', () => {
      cancelAnimationFrame(rafId);
      resolve();
    }, { once: true });

    video.addEventListener('error', () => {
      cancelAnimationFrame(rafId);
      resolve();
    }, { once: true });

    rafId = requestAnimationFrame(draw);
  });
}

// Load image from URL as ImageBitmap
async function loadImageBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    return createImageBitmap(img);
  } catch {
    return null;
  }
}

// Load blob as ImageBitmap
async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

// Load video from URL and prepare for rendering
function createVideoElement(url: string, muted = true): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = muted;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    const onReady = () => {
      video.removeEventListener('canplaythrough', onReady);
      video.removeEventListener('error', onError);
      resolve(video);
    };
    const onError = () => {
      video.removeEventListener('canplaythrough', onReady);
      video.removeEventListener('error', onError);
      reject(new Error(`Falha ao carregar vídeo: ${url}`));
    };

    video.addEventListener('canplaythrough', onReady);
    video.addEventListener('error', onError);
    video.load();
  });
}

export function useVideoCompilation() {
  const [isCompiling, setIsCompiling] = useState(false);
  const [progress, setProgress] = useState<CompilationProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const cancelRef = useRef(false);

  const vignetteGenerator = useVignetteGenerator();

  // Download single clip directly (no vignette)
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

  // Core compilation pipeline using Canvas API + MediaRecorder
  const compilePlaylist = useCallback(async (config: CompilationConfig): Promise<Blob | null> => {
    if (config.clips.length === 0) return null;

    setIsCompiling(true);
    cancelRef.current = false;

    const { width, height } = FORMAT_DIMENSIONS[config.format] ?? FORMAT_DIMENSIONS['16:9'];
    const vigConfig: VignetteConfig = { width, height, format: config.format };

    try {
      // --- Stage: generating-vignettes ---
      let openingBitmap: ImageBitmap | null = null;
      const clipBitmaps: (ImageBitmap | null)[] = [];
      const transitionBitmaps: (ImageBitmap | null)[] = [];
      let closingBitmap: ImageBitmap | null = null;

      if (config.includeVignettes) {
        setProgress({
          stage: 'generating-vignettes',
          progress: 5,
          message: 'Gerando vinheta de abertura...',
          currentStep: 1,
          totalSteps: config.clips.length * 2 + 3
        });

        const openingData: OpeningVignetteData = {
          homeTeam: config.matchInfo.homeTeam,
          awayTeam: config.matchInfo.awayTeam,
          homeScore: config.matchInfo.homeScore,
          awayScore: config.matchInfo.awayScore,
        };
        const openingBlob = await vignetteGenerator.generateOpeningVignette(openingData, vigConfig);
        openingBitmap = await blobToImageBitmap(openingBlob);

        for (let i = 0; i < config.clips.length; i++) {
          if (cancelRef.current) break;
          const clip = config.clips[i];

          setProgress({
            stage: 'generating-vignettes',
            progress: 5 + ((i + 1) / config.clips.length) * 20,
            message: `Gerando vinheta do clip ${i + 1}/${config.clips.length}...`,
            currentStep: i + 2,
            totalSteps: config.clips.length * 2 + 3
          });

          const clipData: ClipVignetteData = {
            eventType: clip.eventType,
            minute: clip.minute,
            title: clip.description ?? `${clip.minute}'`,
            thumbnailUrl: clip.thumbnailUrl,
          };
          const clipBlob = await vignetteGenerator.generateClipVignette(clipData, vigConfig);
          clipBitmaps.push(await blobToImageBitmap(clipBlob));

          // Transition (between clips, not after the last one)
          if (i < config.clips.length - 1) {
            const nextClip = config.clips[i + 1];
            const transData: TransitionVignetteData = {
              nextMinute: nextClip.minute,
              nextEventType: nextClip.eventType,
            };
            const transBlob = await vignetteGenerator.generateTransitionVignette(transData, vigConfig);
            transitionBitmaps.push(await blobToImageBitmap(transBlob));
          }
        }

        setProgress({
          stage: 'generating-vignettes',
          progress: 28,
          message: 'Gerando vinheta de encerramento...'
        });

        const closingData: ClosingVignetteData = { clipCount: config.clips.length };
        const closingBlob = await vignetteGenerator.generateClosingVignette(closingData, vigConfig);
        closingBitmap = await blobToImageBitmap(closingBlob);
      }

      if (cancelRef.current) throw new Error('Cancelado pelo usuário');

      // --- Stage: processing ---
      setProgress({
        stage: 'processing',
        progress: 30,
        message: 'Iniciando renderização no canvas...'
      });

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      // Fill black initially
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // Setup MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
        ? 'video/mp4;codecs=avc1'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const stream = canvas.captureStream(30);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.start(100); // collect chunks every 100ms

      const totalClips = config.clips.length;

      // --- Render sequence ---

      // 1. Opening vignette (3 seconds)
      if (openingBitmap && !cancelRef.current) {
        setProgress({ stage: 'processing', progress: 32, message: 'Renderizando abertura...' });
        await renderImageOnCanvas(ctx, openingBitmap, width, height, 3000, cancelRef);
      }

      // 2. For each clip
      for (let i = 0; i < config.clips.length; i++) {
        if (cancelRef.current) break;
        const clip = config.clips[i];
        const progressBase = 35 + (i / totalClips) * 55;

        // 2a. Clip vignette (2 seconds)
        const clipBitmap = clipBitmaps[i];
        if (clipBitmap && !cancelRef.current) {
          setProgress({
            stage: 'processing',
            progress: progressBase,
            message: `Renderizando vinheta do clip ${i + 1}/${totalClips}...`,
            currentStep: i + 1,
            totalSteps: totalClips
          });
          await renderImageOnCanvas(ctx, clipBitmap, width, height, 2000, cancelRef);
        }

        // 2b. Video clip
        if (!cancelRef.current) {
          setProgress({
            stage: 'processing',
            progress: progressBase + (0.5 / totalClips) * 55,
            message: `Renderizando clip ${i + 1}/${totalClips}...`,
            currentStep: i + 1,
            totalSteps: totalClips
          });

          try {
            const video = await createVideoElement(clip.clipUrl);
            video.muted = true;
            await video.play();
            await renderVideoOnCanvas(ctx, video, width, height, cancelRef);
            video.pause();
            video.src = '';
          } catch (err) {
            console.warn(`Falha ao renderizar clip ${i + 1}:`, err);
            // Fallback: show thumbnail or black for 5s
            if (clip.thumbnailUrl) {
              const thumbBitmap = await loadImageBitmap(clip.thumbnailUrl);
              if (thumbBitmap) {
                await renderImageOnCanvas(ctx, thumbBitmap, width, height, 5000, cancelRef);
              }
            } else {
              ctx.fillStyle = '#000000';
              ctx.fillRect(0, 0, width, height);
              ctx.fillStyle = '#ffffff';
              ctx.font = `bold ${width * 0.05}px system-ui`;
              ctx.textAlign = 'center';
              ctx.fillText(`${clip.minute}'`, width / 2, height / 2);
              await new Promise(r => setTimeout(r, 5000));
            }
          }
        }

        // 2c. Transition vignette (1.5s) — not after the last clip
        const transitionBitmap = transitionBitmaps[i];
        if (transitionBitmap && i < config.clips.length - 1 && !cancelRef.current) {
          setProgress({
            stage: 'processing',
            progress: progressBase + (0.8 / totalClips) * 55,
            message: `Renderizando transição ${i + 1}...`
          });
          await renderImageOnCanvas(ctx, transitionBitmap, width, height, 1500, cancelRef);
        }
      }

      // 3. Closing vignette (2 seconds)
      if (closingBitmap && !cancelRef.current) {
        setProgress({ stage: 'concatenating', progress: 92, message: 'Renderizando encerramento...' });
        await renderImageOnCanvas(ctx, closingBitmap, width, height, 2000, cancelRef);
      }

      if (cancelRef.current) throw new Error('Cancelado pelo usuário');

      // --- Stage: concatenating ---
      setProgress({ stage: 'concatenating', progress: 95, message: 'Finalizando vídeo...' });

      const blob = await new Promise<Blob>((resolve, reject) => {
        mediaRecorder.onstop = () => {
          const finalBlob = new Blob(chunks, { type: mimeType });
          resolve(finalBlob);
        };
        mediaRecorder.onerror = (e) => reject(new Error(`MediaRecorder error: ${e}`));
        mediaRecorder.stop();
      });

      setProgress({ stage: 'complete', progress: 100, message: 'Vídeo gerado com sucesso!' });
      return blob;

    } catch (error) {
      console.error('Erro na compilação:', error);
      if (!cancelRef.current) {
        setProgress({
          stage: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'Erro ao gerar vídeo'
        });
      }
      return null;
    } finally {
      setIsCompiling(false);
    }
  }, [vignetteGenerator]);

  // Download compiled playlist or single clip with vignette
  const downloadCompilation = useCallback(async (config: CompilationConfig): Promise<void> => {
    // Single clip without vignette → direct download
    if (config.clips.length === 1 && !config.includeVignettes && config.clips[0].clipUrl) {
      const clip = config.clips[0];
      const filename = `${clip.minute}min-${clip.eventType.replace(/_/g, '-')}.mp4`;
      await downloadSingleClip(clip.clipUrl, filename);
      return;
    }

    // Otherwise: use MediaRecorder pipeline (with or without vignettes, single or playlist)
    const blob = await compilePlaylist(config);
    if (!blob) return;

    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const filename = config.clips.length === 1
      ? `${config.clips[0].minute}min-${config.clips[0].eventType.replace(/_/g, '-')}_com_vinheta.${ext}`
      : `${config.matchInfo.homeTeam}_vs_${config.matchInfo.awayTeam}_highlights.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [compilePlaylist, downloadSingleClip]);

  // Cancel compilation
  const cancel = useCallback(() => {
    cancelRef.current = true;
    setProgress({ stage: 'idle', progress: 0, message: '' });
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setProgress({ stage: 'idle', progress: 0, message: '' });
    setIsCompiling(false);
    cancelRef.current = false;
  }, []);

  return {
    isCompiling,
    progress,
    isCancelled: cancelRef.current,
    downloadSingleClip,
    compilePlaylist,
    downloadCompilation,
    cancel,
    reset
  };
}
