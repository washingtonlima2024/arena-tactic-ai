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

export interface SubtitleLine {
  start: number; // seconds relative to clip start
  end: number;
  text: string;
}

export interface CompilationClip {
  id: string;
  clipUrl: string;
  eventType: string;
  minute: number;
  description?: string;
  thumbnailUrl?: string;
  subtitleLines?: SubtitleLine[];
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

const FPS = 30;
const FRAME_INTERVAL_MS = Math.round(1000 / FPS);

// Draw source into canvas using "cover" behavior — crops to fill without stretching
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let drawW: number, drawH: number, offsetX: number, offsetY: number;

  if (srcRatio > dstRatio) {
    // Source wider — crop sides
    drawH = dstH;
    drawW = srcW * (dstH / srcH);
    offsetX = (dstW - drawW) / 2;
    offsetY = 0;
  } else {
    // Source taller — crop top/bottom
    drawW = dstW;
    drawH = srcH * (dstW / srcW);
    offsetX = 0;
    offsetY = (dstH - drawH) / 2;
  }
  ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
}

// Render an image on canvas for a specified duration using requestAnimationFrame
// This avoids browser throttling that plagues setInterval in non-focused tabs
function renderImageOnCanvas(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
  durationMs: number,
  cancelRef: React.MutableRefObject<boolean>
): Promise<void> {
  return new Promise((resolve) => {
    // Draw first frame immediately so MediaRecorder captures something
    ctx.clearRect(0, 0, width, height);
    drawCover(ctx, bitmap, bitmap.width, bitmap.height, width, height);

    let startTime: number | null = null;
    let rafId: number;
    let framesDrawn = 0;

    const renderFrame = (timestamp: number) => {
      if (cancelRef.current) {
        resolve();
        return;
      }

      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;

      ctx.clearRect(0, 0, width, height);
      drawCover(ctx, bitmap, bitmap.width, bitmap.height, width, height);
      framesDrawn++;

      if (elapsed >= durationMs) {
        console.log(`[Compilation] Image rendered: ${framesDrawn} frames in ${elapsed.toFixed(0)}ms`);
        resolve();
      } else {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);

    // Safety timeout — resolves if RAF stalls (e.g. tab hidden)
    const safety = setTimeout(() => {
      cancelAnimationFrame(rafId);
      console.warn(`[Compilation] Image render safety timeout hit (${framesDrawn} frames drawn)`);
      resolve();
    }, durationMs + 2000);

    // Clear safety when done naturally
    const originalResolve = resolve;
    // eslint-disable-next-line no-param-reassign
    resolve = () => { clearTimeout(safety); originalResolve(); };
  });
}

// Draw closed captions style subtitle — small, at the bottom, TV style
function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number
) {
  // Small font — CC style (about 2.5% of width, minimum 14px)
  const fontSize = Math.max(14, width * 0.025);
  const maxTextWidth = width * 0.86;
  const padding = { x: fontSize * 0.5, y: fontSize * 0.35 };

  ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Wrap text
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Limit to 2 lines (CC convention)
  const visibleLines = lines.slice(-2);

  const lineHeight = fontSize * 1.35;
  const bottomMargin = height * 0.06;

  visibleLines.forEach((line, i) => {
    const lineIndex = visibleLines.length - 1 - i;
    const y = height - bottomMargin - lineIndex * lineHeight;
    const lineW = ctx.measureText(line).width;
    const boxX = (width - lineW) / 2 - padding.x;
    const boxW = lineW + padding.x * 2;
    const boxH = fontSize + padding.y * 2;
    const boxY = y - fontSize - padding.y;

    // Tight background behind each line (CC style)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
    ctx.fillRect(boxX, boxY, boxW, boxH);

    // White text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, width / 2, y);
  });
}

// Render a video element on canvas using requestAnimationFrame
function renderVideoOnCanvas(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  cancelRef: React.MutableRefObject<boolean>,
  subtitleLines?: SubtitleLine[]
): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    let framesDrawn = 0;
    let rafId: number;

    const done = () => {
      if (resolved) return;
      resolved = true;
      cancelAnimationFrame(rafId);
      console.log(`[Compilation] Video rendered: ${framesDrawn} frames`);
      resolve();
    };

    const renderFrame = () => {
      if (cancelRef.current || video.ended) {
        done();
        return;
      }
      if (!video.paused && !video.ended) {
        try {
          ctx.clearRect(0, 0, width, height);
          const vw = video.videoWidth || width;
          const vh = video.videoHeight || height;
          drawCover(ctx, video, vw, vh, width, height);
          if (subtitleLines) {
            const currentSub = subtitleLines.find(
              s => video.currentTime >= s.start && video.currentTime <= s.end
            );
            if (currentSub) drawSubtitle(ctx, currentSub.text, width, height);
          }
          framesDrawn++;
        } catch {
          // Canvas may be tainted - skip frame
        }
      }
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    video.addEventListener('ended', done, { once: true });
    video.addEventListener('error', done, { once: true });

    // Safety timeout: max 5 minutes
    setTimeout(done, 5 * 60 * 1000);
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

// Load blob as ImageBitmap — validates blob is non-empty
async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  if (!blob || blob.size < 100) {
    throw new Error(`Blob da vinheta inválido: tamanho ${blob?.size ?? 0} bytes`);
  }
  const bitmap = await createImageBitmap(blob);
  if (bitmap.width === 0 || bitmap.height === 0) {
    throw new Error('ImageBitmap da vinheta tem dimensões zero');
  }
  console.log(`[Vignette] Bitmap criado: ${bitmap.width}x${bitmap.height}`);
  return bitmap;
}

// Fetch video as Blob URL to avoid canvas CORS taint
async function fetchVideoAsBlobUrl(url: string): Promise<string> {
  console.log('[Compilation] Fetching video:', url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ao buscar vídeo: ${url}`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error(`Blob vazio para: ${url}`);
  console.log(`[Compilation] Blob OK: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
  return URL.createObjectURL(blob);
}

// Load video from a Blob URL and prepare for rendering
function loadVideoElement(blobUrl: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    // No crossOrigin needed — it's a local blob URL
    // video.muted removed — AudioContext needs unmuted source to capture audio
    video.playsInline = true;
    video.preload = 'auto';
    video.src = blobUrl;

    const cleanup = () => {
      video.removeEventListener('canplaythrough', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
    };

    const onReady = () => {
      cleanup();
      resolve(video);
    };
    const onError = () => {
      cleanup();
      reject(new Error('Falha ao carregar vídeo'));
    };

    video.addEventListener('canplaythrough', onReady);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onError);
    video.load();

    // Fallback: resolve after 10s if neither event fires
    setTimeout(() => {
      cleanup();
      resolve(video);
    }, 10_000);
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

    // Track blob URLs to revoke after compilation
    const blobUrlsToRevoke: string[] = [];
    let audioCtx: AudioContext | null = null;


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

      // --- Stage: downloading videos as blobs ---
      setProgress({
        stage: 'downloading',
        progress: 29,
        message: 'Baixando clips para exportação...'
      });

      // Pre-fetch all video clips as blob URLs to avoid CORS/canvas taint
      const videoBlobUrls: (string | null)[] = [];
      for (let i = 0; i < config.clips.length; i++) {
        if (cancelRef.current) break;
        const clip = config.clips[i];
        setProgress({
          stage: 'downloading',
          progress: 29 + ((i + 1) / config.clips.length) * 1,
          message: `Baixando clip ${i + 1}/${config.clips.length}...`
        });
        try {
          const blobUrl = await fetchVideoAsBlobUrl(clip.clipUrl);
          blobUrlsToRevoke.push(blobUrl);
          videoBlobUrls.push(blobUrl);
        } catch (err) {
          console.warn(`Não foi possível baixar clip ${i + 1}:`, err);
          videoBlobUrls.push(null);
        }
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

      // Setup MediaRecorder — pick best supported mimeType
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

      if (!mimeType) {
        throw new Error('Seu navegador não suporta gravação de vídeo. Tente Chrome ou Firefox.');
      }

      // Setup AudioContext for mixing audio from clips
      audioCtx = new AudioContext();
      const audioDestination = audioCtx.createMediaStreamDestination();

      const stream = canvas.captureStream(FPS);
      // Add audio track from AudioContext destination to the stream
      const audioTrack = audioDestination.stream.getAudioTracks()[0];
      if (audioTrack) stream.addTrack(audioTrack);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.start(100); // collect chunks every 100ms

      // Wait for MediaRecorder to start capturing before drawing vignettes
      await new Promise(r => setTimeout(r, 100));

      // Draw initial black frame to ensure stream has content
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      await new Promise(r => setTimeout(r, 50));

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

          const blobUrl = videoBlobUrls[i];
          if (blobUrl) {
            try {
              const video = await loadVideoElement(blobUrl);
              // Do NOT mute — we want audio in the export
              video.volume = 1;
              video.playsInline = true;

              // Connect video audio to AudioContext mixer
              try {
                const source = audioCtx.createMediaElementSource(video);
                source.connect(audioDestination);
                source.connect(audioCtx.destination); // also play locally so the element works
              } catch {
                // may throw if already connected or CORS issue — continue without audio
              }

              await video.play();

              // Wait for first frame to be decoded before starting canvas capture
              await new Promise<void>(resolve => {
                if (video.readyState >= 3) { resolve(); return; }
                const onPlaying = () => { resolve(); };
                video.addEventListener('playing', onPlaying, { once: true });
                video.addEventListener('timeupdate', onPlaying, { once: true });
                setTimeout(resolve, 2000); // fallback
              });

              console.log(`[Compilation] Rendering clip ${i + 1}, readyState=${video.readyState}, currentTime=${video.currentTime}`);
              await renderVideoOnCanvas(ctx, video, width, height, cancelRef, config.includeSubtitles ? clip.subtitleLines : undefined);
              video.pause();
              video.src = '';
            } catch (err) {
              console.warn(`Falha ao renderizar clip ${i + 1}:`, err);
              // Fallback: thumbnail or black for 5s
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
          } else {
            // No blob URL — show thumbnail or black
            if (clip.thumbnailUrl) {
              const thumbBitmap = await loadImageBitmap(clip.thumbnailUrl);
              if (thumbBitmap) {
                await renderImageOnCanvas(ctx, thumbBitmap, width, height, 5000, cancelRef);
              }
            } else {
              ctx.fillStyle = '#111111';
              ctx.fillRect(0, 0, width, height);
              ctx.fillStyle = '#10b981';
              ctx.font = `bold ${width * 0.08}px system-ui`;
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
          console.log(`[Compilation] Final blob: ${(finalBlob.size / 1024).toFixed(1)} KB, chunks: ${chunks.length}`);
          if (finalBlob.size < 10_000) {
            reject(new Error(`Vídeo gerado vazio (${finalBlob.size} bytes). O canvas não capturou frames — verifique se o servidor está acessível via HTTPS.`));
            return;
          }
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
      // Revoke all blob URLs created during compilation
      blobUrlsToRevoke.forEach(url => URL.revokeObjectURL(url));
      // Close AudioContext
      try { audioCtx?.close(); } catch { /* ignore */ }
      setIsCompiling(false);
    }
  }, [vignetteGenerator]);

  // Download compiled playlist or single clip with vignette
  const downloadCompilation = useCallback(async (config: CompilationConfig): Promise<void> => {
    // ONLY skip pipeline if: single clip, no vignettes, has direct URL
    if (config.clips.length === 1 && !config.includeVignettes && config.clips[0]?.clipUrl) {
      const clip = config.clips[0];
      const filename = `${clip.minute}min-${clip.eventType.replace(/_/g, '-')}.mp4`;
      await downloadSingleClip(clip.clipUrl, filename);
      return;
    }

    // Force window focus to prevent browser throttling of RAF/MediaRecorder
    window.focus();

    // All other cases (vignettes enabled, or multi-clip) → MediaRecorder pipeline
    console.log('[Compilation] Starting pipeline. includeVignettes:', config.includeVignettes, 'clips:', config.clips.length);
    const blob = await compilePlaylist(config);
    if (!blob) return;

    const ext = 'webm';
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
