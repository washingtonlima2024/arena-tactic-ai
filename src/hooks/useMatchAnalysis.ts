import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';

export interface AnalysisProgress {
  stage: 'idle' | 'uploading' | 'transcribing' | 'analyzing' | 'complete' | 'error';
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
  }, []);

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
    progress,
    isAnalyzing,
    resetProgress
  };
}
