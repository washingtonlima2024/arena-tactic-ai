// Batch Export queue — manages concurrent export jobs with pause/cancel/retry
import { useState, useRef, useCallback } from 'react';
import { CompilationConfig } from './useVideoCompilation';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

export interface ExportJob {
  id: string;
  label: string;          // e.g. "9:16 · Best Quality · 5 clips"
  format: '9:16' | '16:9' | '1:1' | '4:5';
  preset: 'best' | 'high' | 'medium';
  config: CompilationConfig;
  filename: string;
  status: JobStatus;
  progress: number;       // 0–100
  message: string;
  blob?: Blob;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
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

const MAX_CONCURRENT = 1; // browser Canvas/MediaRecorder bottleneck — keep sequential

export function useBatchExport() {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const runningRef = useRef(0);
  const jobsRef = useRef<ExportJob[]>([]);
  const cancelRefs = useRef<Record<string, { cancel: boolean }>>({});

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

  // Run a single job using the Canvas/MediaRecorder pipeline
  const runJob = useCallback(async (jobId: string, compileFn: (config: CompilationConfig, preset: ExportJob['preset'], onProgress: (p: number, msg: string) => void, cancelRef: { cancel: boolean }) => Promise<Blob | null>) => {
    const job = jobsRef.current.find(j => j.id === jobId);
    if (!job || job.status !== 'queued') return;

    const cancelRef = cancelRefs.current[jobId] ?? { cancel: false };
    cancelRefs.current[jobId] = cancelRef;

    runningRef.current += 1;
    patchJob(jobId, { status: 'running', progress: 1, message: 'Iniciando...', startedAt: Date.now() });

    try {
      const blob = await compileFn(
        job.config,
        job.preset,
        (progress, message) => {
          if (!cancelRef.cancel) patchJob(jobId, { progress, message });
        },
        cancelRef
      );

      if (cancelRef.cancel) {
        patchJob(jobId, { status: 'cancelled', message: 'Cancelado pelo usuário' });
      } else if (blob) {
        patchJob(jobId, { status: 'completed', progress: 100, message: 'Concluído!', blob, completedAt: Date.now() });
      } else {
        patchJob(jobId, { status: 'failed', progress: 0, message: 'Compilação falhou', error: 'Blob vazio' });
      }
    } catch (err: any) {
      patchJob(jobId, { status: 'failed', progress: 0, message: err?.message ?? 'Erro desconhecido', error: err?.message });
    } finally {
      runningRef.current -= 1;
    }
  }, [patchJob]);

  // Process the queue — run next queued job if slots available
  const processQueue = useCallback(async (compileFn: Parameters<typeof runJob>[1]) => {
    const runNext = async () => {
      if (runningRef.current >= MAX_CONCURRENT) return;
      const queued = jobsRef.current.find(j => j.status === 'queued');
      if (!queued) return;
      await runJob(queued.id, compileFn);
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

  // Cancel a job (removes from queue or stops running)
  const cancelJob = useCallback((id: string) => {
    if (cancelRefs.current[id]) cancelRefs.current[id].cancel = true;
    patchJob(id, { status: 'cancelled', message: 'Cancelado' });
  }, [patchJob]);

  // Retry a failed/cancelled job
  const retryJob = useCallback((id: string) => {
    if (cancelRefs.current[id]) cancelRefs.current[id].cancel = false;
    patchJob(id, { status: 'queued', progress: 0, message: 'Aguardando na fila...', error: undefined });
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

  // Download a specific job's blob
  const downloadJob = useCallback((job: ExportJob) => {
    if (!job.blob) return;
    const url = URL.createObjectURL(job.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = job.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Download all completed jobs as ZIP
  const downloadAllAsZip = useCallback(async () => {
    const completed = jobsRef.current.filter(j => j.status === 'completed' && j.blob);
    if (completed.length === 0) return;

    try {
      // Dynamic import JSZip
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      completed.forEach(j => zip.file(j.filename, j.blob!));
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
