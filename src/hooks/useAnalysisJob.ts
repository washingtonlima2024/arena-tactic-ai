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
    { name: 'Processando transcrição', status: 'pending', progress: 0 },
    { name: 'Analisando com IA', status: 'pending', progress: 0 },
    { name: 'Detectando eventos', status: 'pending', progress: 0 },
    { name: 'Finalizando', status: 'pending', progress: 0 },
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
    transcription: string;
    homeTeam: string;
    awayTeam: string;
    gameStartMinute?: number;
    gameEndMinute?: number;
    halfType?: 'first' | 'second';
  }) => {
    setIsLoading(true);
    
    try {
      const halfType = params.halfType || (params.gameStartMinute && params.gameStartMinute >= 45 ? 'second' : 'first');
      
      console.log('Starting analysis with new pipeline:', {
        matchId: params.matchId,
        homeTeam: params.homeTeam,
        awayTeam: params.awayTeam,
        gameStartMinute: params.gameStartMinute,
        gameEndMinute: params.gameEndMinute,
        halfType,
        transcriptionLength: params.transcription?.length || 0,
      });

      const { data, error } = await supabase.functions.invoke('analyze-match', {
        body: {
          matchId: params.matchId,
          transcription: params.transcription,
          homeTeam: params.homeTeam,
          awayTeam: params.awayTeam,
          gameStartMinute: params.gameStartMinute || 0,
          gameEndMinute: params.gameEndMinute || 90,
          halfType,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Análise falhou');
      }

      toast({
        title: 'Análise completa!',
        description: `${data.eventsDetected} eventos detectados. Placar: ${data.homeScore} x ${data.awayScore}`,
      });

      return {
        success: true,
        eventsDetected: data.eventsDetected,
        homeScore: data.homeScore,
        awayScore: data.awayScore,
      };
    } catch (error: any) {
      console.error('Error in analysis:', error);
      toast({
        title: 'Erro na análise',
        description: error.message || 'Ocorreu um erro ao analisar a transcrição.',
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
    refetchInterval: 5000,
  });
}
