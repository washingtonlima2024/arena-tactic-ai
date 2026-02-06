import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface MatchReport {
  visaoGeral: string;
  linhaDoTempo: string;
  primeiroTempo: string;
  segundoTempo: string;
  analiseIndividual: {
    timePrincipal: string;
    adversario: string;
  };
  analiseTatica: string;
  resumoFinal: string;
}

interface MatchReportData {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition?: string;
  matchDate?: string;
  venue?: string;
  events: Array<{
    event_type: string;
    minute: number | null;
    second: number | null;
    description: string | null;
    match_half?: string | null;
    metadata?: Record<string, any> | null;
  }>;
  stats: {
    homeShots: number;
    awayShots: number;
    homeSaves: number;
    awaySaves: number;
    homeFouls: number;
    awayFouls: number;
    homeCards: number;
    awayCards: number;
    homeCorners: number;
    awayCorners: number;
    homeOffsides: number;
    awayOffsides: number;
    homeRecoveries: number;
    awayRecoveries: number;
  };
  bestPlayer: {
    name: string;
    team: 'home' | 'away';
    goals: number;
    assists: number;
    saves: number;
    recoveries: number;
  } | null;
  patterns: Array<{ type: string; description: string }>;
  possession: { home: number; away: number };
}

export function useMatchReport() {
  const [report, setReport] = useState<MatchReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateReport = useCallback(async (matchData: MatchReportData) => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-match-report', {
        body: { matchData },
      });

      if (error) {
        console.error('Error generating report:', error);
        toast({
          title: 'Erro ao gerar relatorio',
          description: error.message || 'Tente novamente em alguns segundos.',
          variant: 'destructive',
        });
        return null;
      }

      if (data?.error) {
        toast({
          title: 'Erro ao gerar relatorio',
          description: data.error,
          variant: 'destructive',
        });
        return null;
      }

      const generatedReport = data?.report as MatchReport;
      if (generatedReport) {
        setReport(generatedReport);
        toast({
          title: 'Relatorio gerado',
          description: 'O relatorio tatico foi gerado com sucesso.',
        });
        return generatedReport;
      }

      return null;
    } catch (err) {
      console.error('Error generating report:', err);
      toast({
        title: 'Erro ao gerar relatorio',
        description: 'Falha na comunicacao com o servidor. Tente novamente.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const clearReport = useCallback(() => {
    setReport(null);
  }, []);

  return {
    report,
    isGenerating,
    generateReport,
    clearReport,
  };
}
