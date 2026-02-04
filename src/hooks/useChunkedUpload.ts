/**
 * Arena Play - useChunkedUpload Hook
 * React hook for managing chunked file uploads with progress tracking.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChunkedUploadService, UploadState, UploadResult } from '@/lib/chunkedUpload';
import { toast } from 'sonner';

export interface UseChunkedUploadOptions {
  matchId: string;
  onComplete?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
}

export interface UseChunkedUploadReturn {
  // State
  state: UploadState | null;
  isUploading: boolean;
  isPaused: boolean;
  isProcessing: boolean;
  progress: number;
  
  // Actions
  startUpload: (file: File) => Promise<string>;
  pause: () => void;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
  
  // Utils
  formatSpeed: (bps: number) => string;
  formatTime: (seconds: number) => string;
  formatBytes: (bytes: number) => string;
  
  // Pending uploads
  pendingUploads: Array<{ uploadId: string; filename: string; progress: number }>;
  resumePendingUpload: (uploadId: string) => Promise<void>;
  clearPendingUpload: (uploadId: string) => void;
}

export function useChunkedUpload(options: UseChunkedUploadOptions): UseChunkedUploadReturn {
  const { matchId, onComplete, onError } = options;
  
  const [state, setState] = useState<UploadState | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Array<{ uploadId: string; filename: string; progress: number }>>([]);
  const uploaderRef = useRef<ChunkedUploadService | null>(null);

  // Load pending uploads on mount
  useEffect(() => {
    const pending = ChunkedUploadService.getPersistedUploadsForMatch(matchId);
    setPendingUploads(pending.map(p => ({
      uploadId: p.uploadId,
      filename: p.filename,
      progress: Math.round((p.sentChunks.length / p.totalChunks) * 100)
    })));
  }, [matchId]);

  const handleProgress = useCallback((newState: UploadState) => {
    setState(newState);
  }, []);

  const handleComplete = useCallback((result: UploadResult) => {
    toast.success('Upload concluído!', {
      description: 'Arquivo enviado e processado com sucesso.'
    });
    onComplete?.(result);
  }, [onComplete]);

  const handleError = useCallback((error: Error) => {
    toast.error('Erro no upload', {
      description: error.message
    });
    onError?.(error);
  }, [onError]);

  const startUpload = useCallback(async (file: File): Promise<string> => {
    const uploader = new ChunkedUploadService();
    uploaderRef.current = uploader;

    try {
      const uploadId = await uploader.start({
        file,
        matchId,
        onProgress: handleProgress,
        onComplete: handleComplete,
        onError: handleError
      });

      return uploadId;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleError(err);
      throw err;
    }
  }, [matchId, handleProgress, handleComplete, handleError]);

  const pause = useCallback(() => {
    uploaderRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    await uploaderRef.current?.resume();
  }, []);

  const cancel = useCallback(async () => {
    await uploaderRef.current?.cancel();
    setState(null);
  }, []);

  const resumePendingUpload = useCallback(async (uploadId: string) => {
    // TODO: Implement resume from persisted state
    toast.info('Retomando upload...', {
      description: 'Esta funcionalidade será implementada em breve.'
    });
  }, []);

  const clearPendingUpload = useCallback((uploadId: string) => {
    ChunkedUploadService.clearPersistedUpload(uploadId);
    setPendingUploads(prev => prev.filter(p => p.uploadId !== uploadId));
  }, []);

  // Utility formatters
  const formatSpeed = useCallback((bps: number): string => {
    if (bps === 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bps) / Math.log(1024));
    return `${(bps / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    if (seconds <= 0) return '--:--';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    if (minutes > 0) {
      return `${minutes}min ${secs}s`;
    }
    return `${secs}s`;
  }, []);

  const formatBytes = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }, []);

  // Derived state
  const isUploading = state?.status === 'uploading';
  const isPaused = state?.status === 'paused';
  const isProcessing = ['assembling', 'converting', 'extracting', 'segmenting', 'transcribing'].includes(state?.status || '');
  
  const progress = state ? Math.round((state.uploadedBytes / state.totalBytes) * 100) : 0;

  return {
    state,
    isUploading,
    isPaused,
    isProcessing,
    progress,
    startUpload,
    pause,
    resume,
    cancel,
    formatSpeed,
    formatTime,
    formatBytes,
    pendingUploads,
    resumePendingUpload,
    clearPendingUpload
  };
}

export default useChunkedUpload;
