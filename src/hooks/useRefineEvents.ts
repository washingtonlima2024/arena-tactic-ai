import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RefinementResult {
  eventsRefined: number;
  goalsDetected: number;
  scoreUpdated: boolean;
  homeScore: number;
  awayScore: number;
  refinedEvents: any[];
  issues: string[];
}

export function useRefineEvents() {
  const [isRefining, setIsRefining] = useState(false);
  const [result, setResult] = useState<RefinementResult | null>(null);
  const { toast } = useToast();

  const refineEvents = async (matchId: string, transcription?: string) => {
    if (!matchId) {
      toast({
        title: "Erro",
        description: "ID da partida não informado",
        variant: "destructive",
      });
      return null;
    }

    setIsRefining(true);
    setResult(null);

    try {
      // If no transcription provided, try to fetch from analysis job
      let transcriptionText = transcription;
      
      if (!transcriptionText) {
        const { data: job } = await supabase
          .from('analysis_jobs')
          .select('result')
          .eq('match_id', matchId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();

        if (job?.result && typeof job.result === 'object') {
          const result = job.result as Record<string, any>;
          transcriptionText = result.transcription || '';
        }
      }

      console.log('Refining events for match:', matchId);
      console.log('Transcription length:', transcriptionText?.length || 0);

      const { data, error } = await supabase.functions.invoke('refine-events', {
        body: { matchId, transcription: transcriptionText }
      });

      if (error) {
        throw error;
      }

      setResult(data);

      // Show result toast
      if (data.scoreUpdated) {
        toast({
          title: "Placar Atualizado!",
          description: `Novo placar: ${data.homeScore} x ${data.awayScore}`,
        });
      }

      if (data.goalsDetected > 0) {
        toast({
          title: "Gols Detectados",
          description: `${data.goalsDetected} gol(s) identificado(s) na narração`,
        });
      }

      if (data.eventsRefined > 0) {
        toast({
          title: "Eventos Refinados",
          description: `${data.eventsRefined} evento(s) melhorado(s)`,
        });
      }

      if (data.issues?.length > 0) {
        toast({
          title: "Problemas Detectados",
          description: data.issues.join(', ').substring(0, 100),
          variant: "destructive",
        });
      }

      return data;

    } catch (error) {
      console.error('Error refining events:', error);
      toast({
        title: "Erro no refinamento",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsRefining(false);
    }
  };

  return {
    refineEvents,
    isRefining,
    result,
  };
}
