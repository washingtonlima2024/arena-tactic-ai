/**
 * useBackendRender — WYSIWYG pipeline for backend FFmpeg render.
 *
 * Strategy:
 * 1. Generate all vignette PNGs client-side via Canvas (same logic as preview).
 * 2. Load the clip preview composition at a specific time (for debug frame).
 * 3. Send renderSpec JSON (vignettes as base64 PNGs, clip URLs, subtitle lines) to backend.
 * 4. Poll /api/render/status/<jobId> until complete.
 * 5. Trigger download of the final MP4.
 */

import { useState, useCallback, useRef } from 'react';
import { useVignetteGenerator } from './useVignetteGenerator';
import { apiClient, isLocalServerAvailable, getApiBase, buildApiUrl } from '@/lib/apiClient';
import { toast } from 'sonner';

export type RenderStage =
  | 'idle'
  | 'generating-vignettes'
  | 'building-spec'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'subtitles'
  | 'concat'
  | 'complete'
  | 'error'
  | 'debug-frame';

export interface RenderState {
  isRendering: boolean;
  stage: RenderStage;
  progress: number;       // 0–100
  message: string;
  log: string[];
  debugFrameUrl: string | null; // data URL of a single PNG frame for preview
  jobId: string | null;
}

export interface BackendRenderClip {
  id: string;
  clipUrl: string;
  eventType: string;
  minute: number;
  description?: string;
  thumbnailUrl?: string;
  subtitleLines?: Array<{ start: number; end: number; text: string }>;
}

export interface BackendRenderOptions {
  matchId?: string;
  format: '9:16' | '16:9' | '1:1' | '4:5';
  preset: 'best' | 'high' | 'medium';
  includeVignettes: boolean;
  includeSubtitles: boolean;
  matchInfo: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number };
  clips: BackendRenderClip[];
}

const FORMAT_DIMS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1':  { width: 1080, height: 1080 },
  '4:5':  { width: 1080, height: 1350 },
};

/** Converts a Blob to a base64 data-URL string */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useBackendRender() {
  const vignetteGen = useVignetteGenerator();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const [state, setState] = useState<RenderState>({
    isRendering: false,
    stage: 'idle',
    progress: 0,
    message: '',
    log: [],
    debugFrameUrl: null,
    jobId: null,
  });

  const setPartial = useCallback((patch: Partial<RenderState>) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (pollRef.current) clearInterval(pollRef.current);
    setState({
      isRendering: false,
      stage: 'idle',
      progress: 0,
      message: '',
      log: [],
      debugFrameUrl: null,
      jobId: null,
    });
  }, []);

  /**
   * Generates a single debug frame PNG by rendering the opening vignette at
   * the specified clip index (or opening if clipIndex === -1) using the same
   * Canvas pipeline as the preview. Returns a data-URL (PNG).
   */
  const generateDebugFrame = useCallback(async (
    options: BackendRenderOptions,
    clipIndex = 0
  ): Promise<string> => {
    const dims = FORMAT_DIMS[options.format] ?? FORMAT_DIMS['16:9'];
    const vigConfig = { width: dims.width, height: dims.height, format: options.format };

    setPartial({ isRendering: true, stage: 'debug-frame', progress: 10, message: 'Gerando frame de debug...' });

    const clip = options.clips[clipIndex];
    let blob: Blob;

    if (clipIndex === -1 || !clip) {
      // Opening vignette frame
      blob = await vignetteGen.generateOpeningVignette(
        { homeTeam: options.matchInfo.homeTeam, awayTeam: options.matchInfo.awayTeam, homeScore: options.matchInfo.homeScore, awayScore: options.matchInfo.awayScore },
        vigConfig
      );
    } else {
      // Clip vignette frame (same as preview ClipVignette renders)
      blob = await vignetteGen.generateClipVignette(
        { eventType: clip.eventType, minute: clip.minute, title: clip.description ?? `${clip.minute}'`, thumbnailUrl: clip.thumbnailUrl },
        vigConfig
      );
    }

    const dataUrl = await blobToBase64(blob);
    setPartial({ isRendering: false, stage: 'idle', progress: 0, message: '', debugFrameUrl: dataUrl });
    return dataUrl;
  }, [vignetteGen, setPartial]);

  /** Clear the debug frame URL */
  const clearDebugFrame = useCallback(() => {
    setPartial({ debugFrameUrl: null });
  }, [setPartial]);

  /**
   * Main render pipeline:
   * 1. Generate all vignette PNGs via Canvas (same as preview)
   * 2. Build renderSpec
   * 3. POST to /api/render/compile
   * 4. Poll status
   * 5. Download MP4
   */
  const startRender = useCallback(async (options: BackendRenderOptions): Promise<boolean> => {
    if (options.clips.length === 0) {
      toast.error('Nenhum clip selecionado para render.');
      return false;
    }

    const serverAvailable = await isLocalServerAvailable();
    if (!serverAvailable) {
      toast.error('Servidor Python offline. O render FFmpeg requer o servidor local.');
      return false;
    }

    cancelledRef.current = false;
    setState({
      isRendering: true,
      stage: 'generating-vignettes',
      progress: 2,
      message: 'Iniciando render WYSIWYG...',
      log: [],
      debugFrameUrl: null,
      jobId: null,
    });

    try {
      // ── Step 1: Generate vignette PNGs (same pipeline as preview) ──
      const dims = FORMAT_DIMS[options.format] ?? FORMAT_DIMS['16:9'];
      const vigConfig = { width: dims.width, height: dims.height, format: options.format };

      let vignetteFrames: {
        opening?: string;
        clips?: string[];
        transitions?: string[];
        closing?: string;
      } = {};

      if (options.includeVignettes) {
        setPartial({ stage: 'generating-vignettes', progress: 4, message: 'Gerando vinheta de abertura...' });

        const openingBlob = await vignetteGen.generateOpeningVignette(
          { homeTeam: options.matchInfo.homeTeam, awayTeam: options.matchInfo.awayTeam, homeScore: options.matchInfo.homeScore, awayScore: options.matchInfo.awayScore },
          vigConfig
        );
        if (cancelledRef.current) return false;
        const opening = await blobToBase64(openingBlob);

        const clipB64s: string[] = [];
        const transB64s: string[] = [];

        for (let i = 0; i < options.clips.length; i++) {
          if (cancelledRef.current) return false;
          const clip = options.clips[i];
          const pct = 4 + ((i + 1) / options.clips.length) * 12;
          setPartial({ progress: pct, message: `Gerando vinheta do clip ${i + 1}/${options.clips.length}...` });

          const clipBlob = await vignetteGen.generateClipVignette(
            { eventType: clip.eventType, minute: clip.minute, title: clip.description ?? `${clip.minute}'`, thumbnailUrl: clip.thumbnailUrl },
            vigConfig
          );
          clipB64s.push(await blobToBase64(clipBlob));

          if (i < options.clips.length - 1) {
            const next = options.clips[i + 1];
            const transBlob = await vignetteGen.generateTransitionVignette(
              { nextMinute: next.minute, nextEventType: next.eventType },
              vigConfig
            );
            transB64s.push(await blobToBase64(transBlob));
          }
        }

        if (cancelledRef.current) return false;
        setPartial({ progress: 17, message: 'Gerando vinheta de encerramento...' });
        const closingBlob = await vignetteGen.generateClosingVignette(
          { clipCount: options.clips.length },
          vigConfig
        );
        const closing = await blobToBase64(closingBlob);

        vignetteFrames = { opening, clips: clipB64s, transitions: transB64s, closing };
      }

      // ── Step 2: Build renderSpec ──
      setPartial({ stage: 'building-spec', progress: 20, message: 'Construindo renderSpec...' });

      const renderSpec = {
        matchId: options.matchId ?? '',
        format: options.format,
        preset: options.preset,
        includeVignettes: options.includeVignettes,
        includeSubtitles: options.includeSubtitles,
        matchInfo: options.matchInfo,
        clips: options.clips,
        vignetteFrames,
      };

      // ── Step 3: POST renderSpec to backend ──
      setPartial({ stage: 'uploading', progress: 23, message: 'Enviando spec ao servidor FFmpeg...' });

      const { jobId } = await apiClient.startRenderJob(renderSpec);
      setPartial({ jobId, stage: 'queued', progress: 26, message: `Job ${jobId.slice(-8)} na fila...`, log: [`Job ${jobId} iniciado`] });

      // ── Step 4: Poll status ──
      await new Promise<void>((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          if (cancelledRef.current) {
            clearInterval(pollRef.current!);
            resolve();
            return;
          }
          try {
            const s = await apiClient.getRenderStatus(jobId);
            const newLog = s.log ?? [];
            const lastLine = newLog[newLog.length - 1] ?? '';

            // Map server progress 0–100 → UI 26–98
            const uiProgress = Math.max(26, Math.min(98, 26 + (s.progress ?? 0) * 0.72));

            let stage: RenderStage = 'processing';
            if (s.status === 'queued') stage = 'queued';
            else if (lastLine.toLowerCase().includes('ass') || lastLine.toLowerCase().includes('legenda') || lastLine.toLowerCase().includes('subtitle')) stage = 'subtitles';
            else if (lastLine.toLowerCase().includes('concat') || lastLine.toLowerCase().includes('final')) stage = 'concat';

            setPartial({ stage, progress: uiProgress, message: lastLine || 'Processando...', log: newLog });

            if (s.status === 'complete') {
              clearInterval(pollRef.current!);
              setPartial({ stage: 'complete', progress: 100, message: 'MP4 gerado! Iniciando download...' });

              // ── Step 5: Download MP4 ──
              const downloadUrl = apiClient.downloadRenderUrl(jobId);
              const a = document.createElement('a');
              a.href = downloadUrl;
              a.download = `${options.matchInfo.homeTeam}_vs_${options.matchInfo.awayTeam}_${options.format.replace(':', 'x')}_${options.preset}.mp4`.replace(/\s+/g, '_');
              a.target = '_blank';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);

              toast.success('🎬 MP4 exportado com sucesso!');
              setTimeout(() => {
                setState(prev => ({ ...prev, isRendering: false, stage: 'idle', progress: 0 }));
              }, 3000);
              resolve();
            } else if (s.status === 'error') {
              clearInterval(pollRef.current!);
              reject(new Error(s.error ?? 'Erro desconhecido no render'));
            }
          } catch (e) {
            clearInterval(pollRef.current!);
            reject(e);
          }
        }, 1500);
      });

      return true;
    } catch (err: any) {
      console.error('[BackendRender] Falhou:', err);
      const message = err?.message ?? 'Erro no render';
      setPartial({ isRendering: false, stage: 'error', message, progress: 0 });
      toast.error(`Render falhou: ${message}`);
      return false;
    }
  }, [vignetteGen, setPartial]);

  return {
    state,
    startRender,
    cancel,
    generateDebugFrame,
    clearDebugFrame,
  };
}
