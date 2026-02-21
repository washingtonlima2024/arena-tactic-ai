// Batch Export queue — manages concurrent export jobs via backend FFmpeg render
import { useState, useRef, useCallback } from 'react';
import { apiClient, isLocalServerAvailable } from '@/lib/apiClient';
import { useVignetteGenerator } from './useVignetteGenerator';
import { toast } from 'sonner';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

export interface ExportJob {
  id: string;
  label: string;          // e.g. "9:16 · Best Quality · 5 clips"
  format: '9:16' | '16:9' | '1:1' | '4:5';
  preset: 'best' | 'high' | 'medium';
  filename: string;
  status: JobStatus;
  progress: number;       // 0–100
  message: string;
  backendJobId?: string;
  downloadUrl?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  // Render spec data needed for backend
  renderSpec?: any;
}

export const PRESET_BITRATE: Record<ExportJob['preset'], number> = {
  best:   6_000_000,
  high:   4_000_000,
  medium: 2_000_000,
};

export const PRESET_LABEL: Record<ExportJob['preset'], string> = {
  best:   'Melhor Qualidade',
  high:   'Alta Qualidade',
  medium: 'Qualidade Média',
};

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

const MAX_CONCURRENT = 1; // sequential to avoid server overload

export function useBatchExport() {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const runningRef = useRef(0);
  const jobsRef = useRef<ExportJob[]>([]);
  const cancelRefs = useRef<Record<string, { cancel: boolean }>>({});
  const vignetteGen = useVignetteGenerator();

  // Keep ref in sync
  const updateJobs = useCallback((updater: (prev: ExportJob[]) => ExportJob[]) => {
    setJobs(prev => {
      const next = updater(prev);
      jobsRef.current = next;
      return next;
    });
  }, []);

  const patchJob = useCallback((id: string, patch: Partial<ExportJob>) => {
    updateJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
  }, [updateJobs]);

  // Add one or more jobs to the queue
  const addJobs = useCallback((newJobs: Omit<ExportJob, 'status' | 'progress' | 'message' | 'createdAt'>[]) => {
    const stamped: ExportJob[] = newJobs.map(j => ({
      ...j,
      status: 'queued',
      progress: 0,
      message: 'Aguardando na fila...',
      createdAt: Date.now(),
    }));
    updateJobs(prev => [...prev, ...stamped]);
    stamped.forEach(j => { cancelRefs.current[j.id] = { cancel: false }; });
    return stamped.map(j => j.id);
  }, [updateJobs]);

  // Run a single job via backend FFmpeg render
  const runJob = useCallback(async (jobId: string) => {
    const job = jobsRef.current.find(j => j.id === jobId);
    if (!job || job.status !== 'queued' || !job.renderSpec) return;

    const cancelRef = cancelRefs.current[jobId] ?? { cancel: false };
    cancelRefs.current[jobId] = cancelRef;

    runningRef.current += 1;
    patchJob(jobId, { status: 'running', progress: 2, message: 'Gerando vinhetas...', startedAt: Date.now() });

    try {
      // Check server availability
      const serverAvailable = await isLocalServerAvailable();
      if (!serverAvailable) {
        throw new Error('Servidor Python offline. O render FFmpeg requer o servidor local.');
      }

      if (cancelRef.cancel) {
        patchJob(jobId, { status: 'cancelled', message: 'Cancelado pelo usuário' });
        return;
      }

      // Step 1: Generate vignette PNGs
      const spec = job.renderSpec;
      let vignetteFrames: any = {};

      if (spec.includeVignettes) {
        const dims = FORMAT_DIMS[job.format] ?? FORMAT_DIMS['16:9'];
        const vigConfig = { width: dims.width, height: dims.height, format: job.format };

        patchJob(jobId, { progress: 4, message: 'Gerando vinheta de abertura...' });
        const openingBlob = await vignetteGen.generateOpeningVignette(
          { homeTeam: spec.matchInfo.homeTeam, awayTeam: spec.matchInfo.awayTeam, homeScore: spec.matchInfo.homeScore, awayScore: spec.matchInfo.awayScore },
          vigConfig
        );
        if (cancelRef.cancel) { patchJob(jobId, { status: 'cancelled', message: 'Cancelado' }); return; }
        const opening = await blobToBase64(openingBlob);

        const clipB64s: string[] = [];
        const transB64s: string[] = [];

        for (let i = 0; i < spec.clips.length; i++) {
          if (cancelRef.cancel) { patchJob(jobId, { status: 'cancelled', message: 'Cancelado' }); return; }
          const clip = spec.clips[i];
          const pct = 4 + ((i + 1) / spec.clips.length) * 12;
          patchJob(jobId, { progress: pct, message: `Gerando vinheta clip ${i + 1}/${spec.clips.length}...` });

          const clipBlob = await vignetteGen.generateClipVignette(
            { eventType: clip.eventType, minute: clip.minute, title: clip.description ?? `${clip.minute}'`, thumbnailUrl: clip.thumbnailUrl },
            vigConfig
          );
          clipB64s.push(await blobToBase64(clipBlob));

          if (i < spec.clips.length - 1) {
            const next = spec.clips[i + 1];
            const transBlob = await vignetteGen.generateTransitionVignette(
              { nextMinute: next.minute, nextEventType: next.eventType },
              vigConfig
            );
            transB64s.push(await blobToBase64(transBlob));
          }
        }

        if (cancelRef.cancel) { patchJob(jobId, { status: 'cancelled', message: 'Cancelado' }); return; }
        patchJob(jobId, { progress: 17, message: 'Gerando vinheta de encerramento...' });
        const closingBlob = await vignetteGen.generateClosingVignette(
          { clipCount: spec.clips.length },
          vigConfig
        );
        const closing = await blobToBase64(closingBlob);

        vignetteFrames = { opening, clips: clipB64s, transitions: transB64s, closing };
      }

      // Step 2: Send renderSpec to backend
      patchJob(jobId, { progress: 20, message: 'Enviando spec ao servidor FFmpeg...' });
      const fullSpec = { ...spec, vignetteFrames };
      const { jobId: backendJobId } = await apiClient.startRenderJob(fullSpec);
      patchJob(jobId, { backendJobId, progress: 25, message: `Job ${backendJobId.slice(-8)} na fila do servidor...` });

      // Step 3: Poll status until complete
      await new Promise<void>((resolve, reject) => {
        let consecutiveErrors = 0;
        const MAX_ERRORS = 5;

        const pollInterval = setInterval(async () => {
          if (cancelRef.cancel) {
            clearInterval(pollInterval);
            resolve();
            return;
          }
          try {
            const s = await apiClient.getRenderStatus(backendJobId);
            consecutiveErrors = 0;
            const lastLine = s.log?.[s.log.length - 1] ?? '';
            const uiProgress = Math.max(25, Math.min(98, 25 + (s.progress ?? 0) * 0.73));
            patchJob(jobId, { progress: uiProgress, message: lastLine || 'Processando...' });

            if (s.status === 'complete') {
              clearInterval(pollInterval);
              const downloadUrl = apiClient.downloadRenderUrl(backendJobId);
              patchJob(jobId, {
                status: 'completed',
                progress: 100,
                message: 'Concluído!',
                downloadUrl,
                completedAt: Date.now()
              });
              resolve();
            } else if (s.status === 'error') {
              clearInterval(pollInterval);
              reject(new Error(s.error ?? 'Erro no render'));
            }
          } catch (e) {
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_ERRORS) {
              clearInterval(pollInterval);
              reject(new Error('Servidor perdeu o job após múltiplas tentativas'));
            }
          }
        }, 1500);
      });

      if (cancelRef.cancel) {
        patchJob(jobId, { status: 'cancelled', message: 'Cancelado pelo usuário' });
      }
    } catch (err: any) {
      patchJob(jobId, { status: 'failed', progress: 0, message: err?.message ?? 'Erro desconhecido', error: err?.message });
    } finally {
      runningRef.current -= 1;
    }
  }, [patchJob, vignetteGen]);

  // Process the queue — run next queued job if slots available
  const processQueue = useCallback(async () => {
    const runNext = async () => {
      if (runningRef.current >= MAX_CONCURRENT) return;
      const queued = jobsRef.current.find(j => j.status === 'queued');
      if (!queued) return;
      await runJob(queued.id);
      // After a job finishes, attempt to start the next one
      runNext();
    };
    runNext();
  }, [runJob]);

  // Pause a queued job (cancel if running)
  const pauseJob = useCallback((id: string) => {
    const job = jobsRef.current.find(j => j.id === id);
    if (!job) return;
    if (job.status === 'queued') {
      patchJob(id, { status: 'paused', message: 'Pausado' });
    } else if (job.status === 'running') {
      if (cancelRefs.current[id]) cancelRefs.current[id].cancel = true;
      patchJob(id, { status: 'paused', message: 'Pausando...' });
    }
  }, [patchJob]);

  // Resume a paused job (put back to queued)
  const resumeJob = useCallback((id: string) => {
    if (cancelRefs.current[id]) cancelRefs.current[id].cancel = false;
    patchJob(id, { status: 'queued', progress: 0, message: 'Aguardando na fila...' });
  }, [patchJob]);

  // Cancel a job
  const cancelJob = useCallback((id: string) => {
    if (cancelRefs.current[id]) cancelRefs.current[id].cancel = true;
    patchJob(id, { status: 'cancelled', message: 'Cancelado' });
  }, [patchJob]);

  // Retry a failed/cancelled job
  const retryJob = useCallback((id: string) => {
    if (cancelRefs.current[id]) cancelRefs.current[id].cancel = false;
    patchJob(id, { status: 'queued', progress: 0, message: 'Aguardando na fila...', error: undefined, backendJobId: undefined, downloadUrl: undefined });
  }, [patchJob]);

  // Remove a job from list
  const removeJob = useCallback((id: string) => {
    if (cancelRefs.current[id]) cancelRefs.current[id].cancel = true;
    updateJobs(prev => prev.filter(j => j.id !== id));
  }, [updateJobs]);

  // Clear all completed/failed/cancelled jobs
  const clearFinished = useCallback(() => {
    updateJobs(prev => prev.filter(j => j.status === 'queued' || j.status === 'running' || j.status === 'paused'));
  }, [updateJobs]);

  // Download a specific job via URL
  const downloadJob = useCallback((job: ExportJob) => {
    if (!job.downloadUrl) return;
    const a = document.createElement('a');
    a.href = job.downloadUrl;
    a.download = job.filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // Download all completed jobs as ZIP
  const downloadAllAsZip = useCallback(async () => {
    const completed = jobsRef.current.filter(j => j.status === 'completed' && j.downloadUrl);
    if (completed.length === 0) return;

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (const j of completed) {
        try {
          const response = await fetch(j.downloadUrl!);
          if (response.ok) {
            const blob = await response.blob();
            zip.file(j.filename, blob);
          }
        } catch (err) {
          console.warn(`[BatchExport] Failed to fetch ${j.filename} for ZIP:`, err);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arena-play-batch-export.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[BatchExport] ZIP error:', err);
    }
  }, []);

  const stats = {
    total: jobs.length,
    queued: jobs.filter(j => j.status === 'queued').length,
    running: jobs.filter(j => j.status === 'running').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    paused: jobs.filter(j => j.status === 'paused').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  };

  return {
    jobs,
    stats,
    addJobs,
    processQueue,
    pauseJob,
    resumeJob,
    cancelJob,
    retryJob,
    removeJob,
    clearFinished,
    downloadJob,
    downloadAllAsZip,
  };
}
