import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type TranscriptionStage = 
  | 'queued' 
  | 'downloading' 
  | 'splitting' 
  | 'extracting_audio' 
  | 'transcribing' 
  | 'combining' 
  | 'completed';

export interface TranscriptionJob {
  id: string;
  match_id: string;
  video_id?: string;
  video_path?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'partial';
  progress: number;
  current_step?: string;
  error_message?: string;
  stage?: TranscriptionStage;
  total_chunks: number;
  completed_chunks: number;
  chunk_results?: Array<{ chunk: number; status: string; text?: string }>;
  chunk_duration_seconds?: number;
  manifest_path?: string;
  chunks_dir?: string;
  media_prepared?: boolean;
  srt_content?: string;
  plain_text?: string;
  provider_used?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

interface CreateJobParams {
  match_id: string;
  video_id?: string;
  video_path: string;
}

/**
 * Hook to poll transcription job status.
 * Automatically stops polling when job is completed or failed.
 */
export function useTranscriptionJob(jobId: string | null) {
  return useQuery({
    queryKey: ['transcription-job', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const response = await apiClient.get(`/api/transcription-jobs/${jobId}`);
      return response as TranscriptionJob;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as TranscriptionJob | null;
      if (!data) return 2000;
      // Stop polling when job is done
      if (data.status === 'completed' || data.status === 'failed') {
        return false;
      }
      // Poll every 2 seconds while processing
      return 2000;
    },
    staleTime: 1000,
  });
}

/**
 * Hook to create a new transcription job.
 */
export function useCreateTranscriptionJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateJobParams) => {
      const response = await apiClient.post('/api/transcription-jobs', params);
      return response as TranscriptionJob;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['transcription-job', data.id], data);
    },
  });
}

const STAGE_LABELS: Record<TranscriptionStage, string> = {
  queued: 'Aguardando na fila...',
  downloading: 'Baixando vídeo...',
  splitting: 'Dividindo em chunks...',
  extracting_audio: 'Extraindo áudio...',
  transcribing: 'Transcrevendo chunks...',
  combining: 'Combinando resultados...',
  completed: 'Transcrição completa!'
};

/**
 * Hook to get computed transcription progress info.
 */
export function useTranscriptionProgress(job: TranscriptionJob | null) {
  if (!job) {
    return {
      isIdle: true,
      isProcessing: false,
      isCompleted: false,
      isFailed: false,
      isPartial: false,
      progress: 0,
      message: 'Aguardando...',
      stage: null as TranscriptionStage | null,
      stageLabel: '',
      chunksInfo: null,
      mediaPrepared: false,
    };
  }

  const isProcessing = job.status === 'queued' || job.status === 'processing';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isPartial = job.status === 'partial';

  const stage = job.stage || 'queued';
  const stageLabel = STAGE_LABELS[stage] || stage;

  const chunksInfo = job.total_chunks > 1 
    ? `${job.completed_chunks}/${job.total_chunks} partes`
    : null;

  return {
    isIdle: false,
    isProcessing,
    isCompleted,
    isFailed,
    isPartial,
    progress: job.progress,
    message: job.current_step || stageLabel,
    stage,
    stageLabel,
    chunksInfo,
    errorMessage: job.error_message,
    provider: job.provider_used,
    hasResult: !!(job.srt_content || job.plain_text),
    mediaPrepared: job.media_prepared || false,
    chunkDuration: job.chunk_duration_seconds || 10,
  };
}
