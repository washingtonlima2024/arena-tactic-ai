import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';

export interface AnalysisProgress {
  stage: 'idle' | 'uploading' | 'transcribing' | 'analyzing' | 'syncing' | 'complete' | 'error';
  progress: number;
  message: string;
  usedFallback?: boolean;
}

export interface AnalysisResult {
  success: boolean;
  eventsDetected: number;
  homeScore: number;
  awayScore: number;
  error?: string;
  usedFallback?: boolean;
}

export function useMatchAnalysis() {
  const [progress, setProgress] = useState<AnalysisProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const resetProgress = useCallback(() => {
    setProgress({ stage: 'idle', progress: 0, message: '' });
    setIsAnalyzing(false);
  }, []);

  // Garante que a partida existe no Supabase antes de análise
  const ensureMatchSynced = useCallback(async (matchId: string): Promise<boolean> => {
    try {
      console.log('[useMatchAnalysis] Verificando sync da partida:', matchId);
      
      // Tenta sync via servidor Python primeiro
      const result = await apiClient.ensureMatchInSupabase(matchId);
      
      if (result.success) {
        if (result.synced) {
          console.log('[useMatchAnalysis] ✓ Partida sincronizada com sucesso via servidor');
        } else {
          console.log('[useMatchAnalysis] ✓ Partida já estava sincronizada');
        }
        return true;
      }
      
      // Se servidor Python falhar, tenta criar diretamente no Supabase
      console.warn('[useMatchAnalysis] Servidor Python falhou, tentando sync direto...');
      
      // Buscar dados da partida do servidor local
      const matchData = await apiClient.get(`/api/matches/${matchId}`);
      if (!matchData) {
        console.error('[useMatchAnalysis] Partida não encontrada no servidor local');
        return false;
      }
      
      // Importar supabase client dinamicamente para evitar dependência circular
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Primeiro, garantir que os times existam no Supabase
      const homeTeamId = matchData.home_team_id;
      const awayTeamId = matchData.away_team_id;
      
      if (homeTeamId) {
        const homeTeamData = await apiClient.get(`/api/teams/${homeTeamId}`);
        if (homeTeamData) {
          await supabase.from('teams').upsert({
            id: homeTeamId,
            name: homeTeamData.name,
            short_name: homeTeamData.short_name,
            logo_url: homeTeamData.logo_url,
            primary_color: homeTeamData.primary_color,
            secondary_color: homeTeamData.secondary_color
          }, { onConflict: 'id' });
        }
      }
      
      if (awayTeamId && awayTeamId !== homeTeamId) {
        const awayTeamData = await apiClient.get(`/api/teams/${awayTeamId}`);
        if (awayTeamData) {
          await supabase.from('teams').upsert({
            id: awayTeamId,
            name: awayTeamData.name,
            short_name: awayTeamData.short_name,
            logo_url: awayTeamData.logo_url,
            primary_color: awayTeamData.primary_color,
            secondary_color: awayTeamData.secondary_color
          }, { onConflict: 'id' });
        }
      }
      
      // Agora criar a partida
      const { error } = await supabase.from('matches').upsert({
        id: matchId,
        home_team_id: homeTeamId || null,
        away_team_id: awayTeamId || null,
        home_score: matchData.home_score || 0,
        away_score: matchData.away_score || 0,
        match_date: matchData.match_date || new Date().toISOString(),
        competition: matchData.competition || null,
        venue: matchData.venue || null,
        status: matchData.status || 'pending'
      }, { onConflict: 'id' });
      
      if (error) {
        console.error('[useMatchAnalysis] Erro ao criar partida no Supabase:', error);
        return false;
      }
      
      console.log('[useMatchAnalysis] ✓ Partida sincronizada diretamente no Supabase');
      return true;
    } catch (error) {
      console.error('[useMatchAnalysis] Erro no sync:', error);
      return false;
    }
  }, []);

  const analyzeWithTranscription = useCallback(async ({
    matchId,
    transcription,
    homeTeam,
    awayTeam,
    gameStartMinute = 0,
    gameEndMinute = 45,
    halfType,
    skipValidation = false
  }: {
    matchId: string;
    transcription: string;
    homeTeam: string;
    awayTeam: string;
    gameStartMinute?: number;
    gameEndMinute?: number;
    halfType?: 'first' | 'second';
    skipValidation?: boolean;
  }): Promise<AnalysisResult | null> => {
    if (!matchId || !transcription) {
      toast.error('Match ID e transcrição são obrigatórios');
      return null;
    }

    setIsAnalyzing(true);
    
    // PASSO 1: Garantir que a partida existe no Supabase Cloud antes de analisar
    setProgress({ stage: 'syncing', progress: 10, message: 'Sincronizando partida com Cloud...' });
    
    const syncSuccess = await ensureMatchSynced(matchId);
    if (!syncSuccess) {
      toast.error('Não foi possível sincronizar partida com Cloud. Eventos não serão salvos.');
      setProgress({ stage: 'error', progress: 0, message: 'Falha ao sincronizar com Cloud' });
      setIsAnalyzing(false);
      return null;
    }
    
    // PASSO 2: Analisar transcrição
    setProgress({ stage: 'analyzing', progress: 50, message: 'Analisando transcrição com IA...' });

    try {
      console.log('Starting analysis for match:', matchId);
      console.log('Transcription length:', transcription.length);

      const data = await apiClient.analyzeMatch({
        matchId,
        transcription,
        homeTeam,
        awayTeam,
        gameStartMinute,
        gameEndMinute,
        halfType: halfType || (gameStartMinute >= 45 ? 'second' : 'first'),
        autoClip: true,
        includeSubtitles: true,
        skipValidation
      });

      if (!data?.success) {
        throw new Error(data?.error || 'Análise falhou');
      }

      const usedFallback = !data?.supabaseSync && data?.success;
      
      setProgress({ 
        stage: 'complete', 
        progress: 100, 
        message: `✓ ${data.eventsDetected} eventos detectados! Placar: ${data.homeScore} x ${data.awayScore}`,
        usedFallback
      });

      const successMessage = usedFallback 
        ? `Análise completa (via Edge Function)! ${data.eventsDetected} eventos detectados.`
        : `Análise completa! ${data.eventsDetected} eventos detectados.`;
      
      toast.success(successMessage);

      return {
        success: true,
        eventsDetected: data.eventsDetected,
        homeScore: data.homeScore,
        awayScore: data.awayScore,
        usedFallback
      };

    } catch (error) {
      console.error('Analysis error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setProgress({ stage: 'error', progress: 0, message: errorMessage });
      toast.error('Erro na análise: ' + errorMessage);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [ensureMatchSynced]);

  const transcribeAndAnalyze = useCallback(async ({
    matchId,
    audioUrl,
    homeTeam,
    awayTeam,
    gameStartMinute = 0,
    gameEndMinute = 45
  }: {
    matchId: string;
    audioUrl: string;
    homeTeam: string;
    awayTeam: string;
    gameStartMinute?: number;
    gameEndMinute?: number;
  }): Promise<AnalysisResult | null> => {
    if (!matchId || !audioUrl) {
      toast.error('Match ID e URL do áudio são obrigatórios');
      return null;
    }

    setIsAnalyzing(true);

    try {
      // Step 1: Transcribe audio/video using local server
      setProgress({ stage: 'transcribing', progress: 20, message: 'Transcrevendo mídia...' });

      const transcriptionData = await apiClient.transcribeLargeVideo({
        videoUrl: audioUrl,
        matchId
      });

      if (!transcriptionData?.success || !transcriptionData?.text) {
        throw new Error('Falha na transcrição ou transcrição vazia');
      }

      console.log('Transcription completed:', transcriptionData.text.length, 'chars');

      // Step 2: Analyze with transcription
      setProgress({ stage: 'analyzing', progress: 60, message: 'Analisando transcrição com IA...' });

      return await analyzeWithTranscription({
        matchId,
        transcription: transcriptionData.text,
        homeTeam,
        awayTeam,
        gameStartMinute,
        gameEndMinute
      });

    } catch (error) {
      console.error('Transcribe and analyze error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setProgress({ stage: 'error', progress: 0, message: errorMessage });
      toast.error('Erro: ' + errorMessage);
      return null;
    }
  }, [analyzeWithTranscription]);

  return {
    analyzeWithTranscription,
    transcribeAndAnalyze,
    ensureMatchSynced,
    progress,
    isAnalyzing,
    resetProgress
  };
}
