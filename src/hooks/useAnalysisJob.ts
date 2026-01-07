import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
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
  // Fetch job with polling for updates (replaces realtime)
  const { data: job } = useQuery({
    queryKey: ['analysis-job', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const data = await apiClient.getAnalysisJob(jobId);
      return mapDbJobToAnalysisJob(data as DbAnalysisJob);
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      // Poll every 2 seconds if job is not completed
      const data = query.state.data;
      if (data && ['completed', 'failed'].includes(data.status)) {
        return false;
      }
      return 2000;
    },
  });

  return job;
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
      
      console.log('Starting analysis with local API:', {
        matchId: params.matchId,
        homeTeam: params.homeTeam,
        awayTeam: params.awayTeam,
        halfType,
        transcriptionLength: params.transcription?.length || 0,
      });

      const data = await apiClient.analyzeMatch({
        matchId: params.matchId,
        transcription: params.transcription,
        homeTeam: params.homeTeam,
        awayTeam: params.awayTeam,
      });

      if (!data?.success) {
        throw new Error(data?.error || 'Análise falhou');
      }

      toast({
        title: 'Análise completa!',
        description: `${data.events?.length || 0} eventos detectados.`,
      });

      return {
        success: true,
        eventsDetected: data.events?.length || 0,
        events: data.events,
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
      const data = await apiClient.getAnalysisJobs();
      const activeJobs = data.filter((j: any) => 
        ['queued', 'processing'].includes(j.status)
      );
      return (activeJobs as DbAnalysisJob[]).map(mapDbJobToAnalysisJob);
    },
    refetchInterval: 5000,
  });
}
