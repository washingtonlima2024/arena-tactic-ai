import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';

export interface ProcessingStatus {
  jobId: string;
  status: 'queued' | 'preparing' | 'splitting' | 'transcribing' | 'analyzing' | 'clipping' | 'complete' | 'error';
  stage: string;
  progress: number;
  progressMessage: string;
  partsCompleted: number;
  totalParts: number;
  partsStatus: Array<{
    part: number;
    halfType: 'first' | 'second';
    status: 'pending' | 'splitting' | 'transcribing' | 'done' | 'error';
    progress: number;
    message?: string;
  }>;
  estimatedTimeRemaining?: number;
  error?: string;
  eventsDetected?: number;
  clipsGenerated?: number;
}

export interface VideoInput {
  url: string;
  halfType: 'first' | 'second';
  videoType: string;
  startMinute: number;
  endMinute: number;
  sizeMB?: number;
}

interface AsyncProcessingInput {
  matchId: string;
  videos: VideoInput[];
  homeTeam: string;
  awayTeam: string;
  autoClip?: boolean;
  autoAnalysis?: boolean;
  firstHalfTranscription?: string;
  secondHalfTranscription?: string;
}

export function useAsyncProcessing() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const startPolling = useCallback((newJobId: string) => {
    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    const poll = async () => {
      try {
        const result = await apiClient.getAsyncProcessingStatus(newJobId);
        setStatus(result);

        // Calculate estimated time based on progress
        if (startTimeRef.current && result.progress > 0 && result.progress < 100) {
          const elapsed = Date.now() - startTimeRef.current;
          const estimated = Math.round((elapsed / result.progress) * (100 - result.progress) / 1000);
          result.estimatedTimeRemaining = estimated;
        }

        // Stop polling when complete or error
        if (result.status === 'complete' || result.status === 'error') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setIsProcessing(false);
          
          if (result.status === 'error') {
            setError(result.error || 'Erro desconhecido no processamento');
          }
        }
      } catch (err: any) {
        console.error('[useAsyncProcessing] Polling error:', err);
        // Don't stop polling on transient errors
      }
    };

    // Initial poll
    poll();
    
    // Poll every 2 seconds
    pollingRef.current = setInterval(poll, 2000);
  }, []);

  const startProcessing = useCallback(async (input: AsyncProcessingInput) => {
    setIsProcessing(true);
    setError(null);
    setStatus(null);
    startTimeRef.current = Date.now();

    try {
      const result = await apiClient.startAsyncProcessing(input);
      
      setJobId(result.jobId);
      
      // Set initial status
      setStatus({
        jobId: result.jobId,
        status: 'queued',
        stage: 'queued',
        progress: 0,
        progressMessage: 'Iniciando processamento...',
        partsCompleted: 0,
        totalParts: 0,
        partsStatus: []
      });

      // Start polling for updates
      startPolling(result.jobId);

      return result.jobId;
    } catch (err: any) {
      console.error('[useAsyncProcessing] Start error:', err);
      setError(err.message || 'Falha ao iniciar processamento');
      setIsProcessing(false);
      throw err;
    }
  }, [startPolling]);

  const cancelProcessing = useCallback(async () => {
    if (!jobId) return;

    try {
      await apiClient.cancelAsyncProcessing(jobId);
      
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      
      setIsProcessing(false);
      setStatus(prev => prev ? { ...prev, status: 'error', error: 'Cancelado pelo usuário' } : null);
    } catch (err: any) {
      console.error('[useAsyncProcessing] Cancel error:', err);
    }
  }, [jobId]);

  const reset = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setJobId(null);
    setStatus(null);
    setIsProcessing(false);
    setError(null);
    startTimeRef.current = null;
  }, []);

  return {
    startProcessing,
    cancelProcessing,
    reset,
    jobId,
    status,
    isProcessing,
    error,
    isComplete: status?.status === 'complete',
    isError: status?.status === 'error'
  };
}
