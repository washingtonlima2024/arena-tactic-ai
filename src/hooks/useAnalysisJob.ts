import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AnalysisJob } from '@/types/arena';
import { toast } from '@/hooks/use-toast';

interface AnalysisStep {
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
}

interface DbAnalysisJob {
  id: string;
  match_id: string;
  status: string | null;
  progress: number | null;
  current_step: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  result: { steps?: AnalysisStep[] } | null;
}

function mapDbJobToAnalysisJob(dbJob: DbAnalysisJob): AnalysisJob {
  const defaultSteps: AnalysisStep[] = [
    { name: 'Preparação do vídeo', status: 'pending', progress: 0 },
    { name: 'Extração de áudio', status: 'pending', progress: 0 },
    { name: 'Transcrição automática', status: 'pending', progress: 0 },
    { name: 'Análise visual (Vision AI)', status: 'pending', progress: 0 },
    { name: 'Identificação de eventos', status: 'pending', progress: 0 },
    { name: 'Análise tática', status: 'pending', progress: 0 },
    { name: 'Finalização', status: 'pending', progress: 0 },
  ];

  return {
    id: dbJob.id,
    matchId: dbJob.match_id,
    status: (dbJob.status as AnalysisJob['status']) || 'queued',
    progress: dbJob.progress || 0,
    currentStep: dbJob.current_step || 'Aguardando...',
    steps: (dbJob.result?.steps as AnalysisStep[]) || defaultSteps,
    startedAt: dbJob.started_at || undefined,
    completedAt: dbJob.completed_at || undefined,
    error: dbJob.error_message || undefined,
  };
}

export function useAnalysisJob(jobId: string | null) {
  const [realtimeJob, setRealtimeJob] = useState<AnalysisJob | null>(null);

  // Initial fetch
  const { data: initialJob } = useQuery({
    queryKey: ['analysis-job', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      
      const { data, error } = await supabase
        .from('analysis_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) throw error;
      return mapDbJobToAnalysisJob(data as DbAnalysisJob);
    },
    enabled: !!jobId,
  });

  // Real-time subscription
  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`analysis-job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'analysis_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          console.log('Analysis job update:', payload);
          setRealtimeJob(mapDbJobToAnalysisJob(payload.new as DbAnalysisJob));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return realtimeJob || initialJob;
}

export function useStartAnalysis() {
  const [isLoading, setIsLoading] = useState(false);

  const startAnalysis = async (params: {
    matchId: string;
    videoUrl: string;
    homeTeamId?: string;
    awayTeamId?: string;
    competition?: string;
    startMinute?: number;
    endMinute?: number;
    durationSeconds?: number;
    transcription?: string; // SRT content if provided
    audioUrl?: string; // Pre-extracted audio URL for large videos
  }) => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('analyze-video', {
        body: params,
      });

      if (error) throw error;

      toast({
        title: 'Análise iniciada',
        description: 'O processamento do vídeo começou. Você pode acompanhar o progresso.',
      });

      return data;
    } catch (error: any) {
      console.error('Error starting analysis:', error);
      toast({
        title: 'Erro ao iniciar análise',
        description: error.message || 'Ocorreu um erro ao iniciar a análise.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { startAnalysis, isLoading };
}

export function useActiveAnalysisJobs() {
  return useQuery({
    queryKey: ['active-analysis-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analysis_jobs')
        .select('*')
        .in('status', ['queued', 'processing'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as DbAnalysisJob[]).map(mapDbJobToAnalysisJob);
    },
    refetchInterval: 5000, // Refetch every 5 seconds for active jobs
  });
}
