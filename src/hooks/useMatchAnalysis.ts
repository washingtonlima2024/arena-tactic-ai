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
      console.log('[SYNC] ========================================');
      console.log('[SYNC] Iniciando sincronização da partida:', matchId);
      console.log('[SYNC] ========================================');
      
      // Etapa 1: Tenta sync via servidor Python primeiro
      console.log('[SYNC] Etapa 1: Tentando sync via servidor Python...');
      const result = await apiClient.ensureMatchInSupabase(matchId);
      console.log('[SYNC] Resposta do servidor:', JSON.stringify(result, null, 2));
      
      if (result.success) {
        if (result.synced) {
          console.log('[SYNC] ✓ Partida sincronizada com sucesso via servidor Python');
        } else {
          console.log('[SYNC] ✓ Partida já estava sincronizada no Cloud');
        }
        return true;
      }
      
      // Se servidor Python falhar, tenta criar diretamente no Supabase
      console.warn('[SYNC] ⚠ Servidor Python falhou:', result.message || 'Sem detalhes');
      console.log('[SYNC] Etapa 2: Tentando sync direto via Supabase client...');
      
      // Buscar dados da partida do servidor local
      console.log('[SYNC] Etapa 2.1: Buscando dados da partida no servidor local...');
      const matchData = await apiClient.get(`/api/matches/${matchId}`);
      console.log('[SYNC] Dados da partida:', matchData ? 'OK' : 'NÃO ENCONTRADA');
      
      if (!matchData) {
        console.error('[SYNC] ✗ Partida não encontrada no servidor local');
        return false;
      }
      
      // Importar supabase client dinamicamente para evitar dependência circular
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Primeiro, garantir que os times existam no Supabase
      const homeTeamId = matchData.home_team_id;
      const awayTeamId = matchData.away_team_id;
      console.log('[SYNC] IDs dos times - Casa:', homeTeamId, '| Visitante:', awayTeamId);
      
      // Etapa 2.2: Sincronizar time da casa
      if (homeTeamId) {
        console.log('[SYNC] Etapa 2.2: Buscando dados do time da casa...');
        const homeTeamData = await apiClient.get(`/api/teams/${homeTeamId}`);
        if (homeTeamData) {
          console.log('[SYNC] Upserting time da casa:', homeTeamData.name);
          const { error: homeError } = await supabase.from('teams').upsert({
            id: homeTeamId,
            name: homeTeamData.name,
            short_name: homeTeamData.short_name,
            logo_url: homeTeamData.logo_url,
            primary_color: homeTeamData.primary_color,
            secondary_color: homeTeamData.secondary_color
          }, { onConflict: 'id' });
          if (homeError) {
            console.error('[SYNC] ⚠ Erro ao upsert time da casa:', homeError);
          } else {
            console.log('[SYNC] ✓ Time da casa sincronizado');
          }
        } else {
          console.warn('[SYNC] ⚠ Time da casa não encontrado no servidor local');
        }
      }
      
      // Etapa 2.3: Sincronizar time visitante
      if (awayTeamId && awayTeamId !== homeTeamId) {
        console.log('[SYNC] Etapa 2.3: Buscando dados do time visitante...');
        const awayTeamData = await apiClient.get(`/api/teams/${awayTeamId}`);
        if (awayTeamData) {
          console.log('[SYNC] Upserting time visitante:', awayTeamData.name);
          const { error: awayError } = await supabase.from('teams').upsert({
            id: awayTeamId,
            name: awayTeamData.name,
            short_name: awayTeamData.short_name,
            logo_url: awayTeamData.logo_url,
            primary_color: awayTeamData.primary_color,
            secondary_color: awayTeamData.secondary_color
          }, { onConflict: 'id' });
          if (awayError) {
            console.error('[SYNC] ⚠ Erro ao upsert time visitante:', awayError);
          } else {
            console.log('[SYNC] ✓ Time visitante sincronizado');
          }
        } else {
          console.warn('[SYNC] ⚠ Time visitante não encontrado no servidor local');
        }
      }
      
      // Etapa 2.4: Sincronizar a partida
      console.log('[SYNC] Etapa 2.4: Upserting partida no Supabase...');
      const matchUpsertData = {
        id: matchId,
        home_team_id: homeTeamId || null,
        away_team_id: awayTeamId || null,
        home_score: matchData.home_score || 0,
        away_score: matchData.away_score || 0,
        match_date: matchData.match_date || new Date().toISOString(),
        competition: matchData.competition || null,
        venue: matchData.venue || null,
        status: matchData.status || 'pending'
      };
      console.log('[SYNC] Dados para upsert:', JSON.stringify(matchUpsertData, null, 2));
      
      const { error } = await supabase.from('matches').upsert(matchUpsertData, { onConflict: 'id' });
      
      if (error) {
        console.error('[SYNC] ✗ Erro ao criar partida no Supabase:', error);
        console.error('[SYNC] Detalhes do erro:', JSON.stringify(error, null, 2));
        return false;
      }
      
      console.log('[SYNC] ✓ Partida sincronizada diretamente no Supabase');
      console.log('[SYNC] ========================================');
      return true;
    } catch (error) {
      console.error('[SYNC] ✗ Erro fatal no sync:', error);
      console.error('[SYNC] Stack:', error instanceof Error ? error.stack : 'N/A');
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
