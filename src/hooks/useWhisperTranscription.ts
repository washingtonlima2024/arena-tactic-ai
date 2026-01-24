// Simplified transcription hook - delegates all processing to backend Python server
// No longer uses FFmpeg WASM - all video/audio processing is done server-side

import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';

interface TranscriptionProgress {
  stage: 'idle' | 'loading' | 'downloading' | 'extracting' | 'splitting' | 'uploading' | 'transcribing' | 'complete' | 'error';
  progress: number;
  message: string;
  currentPart?: number;
  totalParts?: number;
}

interface TranscriptionResult {
  srtContent: string;
  text: string;
  audioUrl: string;
}

// Timeout helper
const withTimeout = <T>(promise: Promise<T>, ms: number, operation: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout em ${operation} após ${ms/1000}s`)), ms)
    )
  ]);
};

export function useWhisperTranscription() {
  const [transcriptionProgress, setTranscriptionProgress] = useState<TranscriptionProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  // Server-side transcription with automatic splitting for large videos
  const transcribeWithServer = async (
    videoUrl: string,
    matchId: string,
    videoId: string,
    videoSizeMB?: number,
    halfType?: 'first' | 'second',
    autoAnalyze?: boolean,
    homeTeam?: string,
    awayTeam?: string
  ): Promise<TranscriptionResult | null> => {
    console.log('[Server Transcription] ========================================');
    console.log('[Server Transcription] Usando transcrição server-side (Whisper Local)...');
    if (videoSizeMB) console.log('[Server Transcription] Tamanho do vídeo:', videoSizeMB, 'MB');
    
    // Determine number of parts based on size
    const useSplitTranscription = videoSizeMB && videoSizeMB > 300;
    const numParts = videoSizeMB && videoSizeMB > 800 ? 4 : videoSizeMB && videoSizeMB > 300 ? 2 : 1;
    
    if (useSplitTranscription) {
      console.log(`[Server Transcription] Vídeo grande detectado, usando transcrição com divisão (${numParts} partes)...`);
      setTranscriptionProgress({ 
        stage: 'splitting', 
        progress: 10, 
        message: `Dividindo vídeo em ${numParts} partes...`,
        currentPart: 0,
        totalParts: numParts
      });
      
      try {
        // Simulate progress during split transcription
        let progressInterval: NodeJS.Timeout | undefined;
        let currentEstimatedPart = 1;
        
        progressInterval = setInterval(() => {
          currentEstimatedPart = Math.min(currentEstimatedPart + 0.1, numParts);
          const progressPercent = 10 + (currentEstimatedPart / numParts) * 80;
          
          setTranscriptionProgress({
            stage: 'transcribing',
            progress: progressPercent,
            message: `Transcrevendo parte ${Math.ceil(currentEstimatedPart)}/${numParts}...`,
            currentPart: Math.ceil(currentEstimatedPart),
            totalParts: numParts
          });
        }, 15000);
        
        const splitData = await apiClient.transcribeSplitVideo({ 
          videoUrl, 
          matchId, 
          numParts,
          halfType: halfType || 'first',
          halfDuration: 45,
          autoAnalyze,
          homeTeam,
          awayTeam
        });
        
        clearInterval(progressInterval);
        
        if (splitData?.success && splitData?.text) {
          console.log('[Server Transcription] ✓ Transcrição com divisão completa:', splitData.text.length, 'caracteres');
          console.log('[Server Transcription] Partes transcritas:', splitData.partsTranscribed, '/', splitData.totalParts);
          
          setTranscriptionProgress({
            stage: 'complete',
            progress: 100,
            message: `✓ Transcrição completa (${numParts} partes)`,
            currentPart: numParts,
            totalParts: numParts
          });
          
          return {
            srtContent: splitData.srtContent || '',
            text: splitData.text,
            audioUrl: ''
          };
        }
      } catch (splitError: any) {
        console.warn('[Server Transcription] Transcrição com divisão falhou, tentando método padrão:', splitError.message);
      }
    }
    
    // Standard method (without splitting)
    setTranscriptionProgress({ 
      stage: 'transcribing', 
      progress: 30, 
      message: 'Transcrevendo no servidor (Whisper Local)...' 
    });

    const data = await apiClient.transcribeLargeVideo({ 
      videoUrl, 
      matchId, 
      language: 'pt', 
      halfType,
      autoAnalyze,
      homeTeam,
      awayTeam
    }) as any;

    if (!data?.success) {
      if (data?.requiresLocalServer) {
        const sizeMB = data.videoSizeMB ? Math.round(parseFloat(data.videoSizeMB)) : '500+';
        throw new Error(
          `Vídeo de ${sizeMB}MB é muito grande para a nuvem. ` +
          `Inicie o servidor Python local (cd video-processor && python server.py) e use o modo "Arquivo Local".`
        );
      }
      throw new Error(data?.error || data?.text || 'Erro desconhecido na transcrição');
    }

    console.log('[Server Transcription] ✓ Transcrição completa:', data.text?.length, 'caracteres');
    if (data.audioPath) console.log('[Server Transcription] Áudio salvo em:', data.audioPath);
    if (data.srtPath) console.log('[Server Transcription] SRT salvo em:', data.srtPath);
    
    return {
      srtContent: data.srtContent || '',
      text: data.text || data.srtContent || '',
      audioUrl: data.audioPath || ''
    };
  };

  const transcribeVideo = async (
    videoUrl: string,
    matchId: string,
    videoId: string,
    videoSizeMB?: number,
    halfType?: 'first' | 'second',
    autoAnalyze?: boolean,
    homeTeam?: string,
    awayTeam?: string
  ): Promise<TranscriptionResult | null> => {
    console.log('[Transcrição] ========================================');
    console.log('[Transcrição] Iniciando transcrição para:', videoUrl);
    console.log('[Transcrição] Match ID:', matchId);
    console.log('[Transcrição] Video ID:', videoId);
    console.log('[Transcrição] Half Type:', halfType || 'não especificado');
    if (videoSizeMB) console.log('[Transcrição] Tamanho do vídeo:', videoSizeMB, 'MB');
    
    setIsTranscribing(true);
    setUsedFallback(false);

    try {
      console.log('[Transcrição] Usando servidor Python (Whisper Local prioritário)...');
      setTranscriptionProgress({ 
        stage: 'transcribing', 
        progress: 20, 
        message: videoSizeMB && videoSizeMB > 300 
          ? 'Dividindo vídeo para transcrição...' 
          : 'Transcrevendo áudio (Whisper Local)...' 
      });
      
      const serverResult = await transcribeWithServer(videoUrl, matchId, videoId, videoSizeMB, halfType, autoAnalyze, homeTeam, awayTeam);
      if (serverResult && serverResult.text && serverResult.text.trim().length > 0) {
        console.log('[Transcrição] ✓ Transcrição completa:', serverResult.text.length, 'caracteres');
        setTranscriptionProgress({ stage: 'complete', progress: 100, message: 'Transcrição completa!' });
        setIsTranscribing(false);
        return serverResult;
      }
      
      throw new Error('Transcrição retornou sem texto');
    } catch (serverError: any) {
      console.error('[Transcrição] Erro na transcrição via servidor:', serverError);
      setTranscriptionProgress({ 
        stage: 'error', 
        progress: 0, 
        message: serverError?.message || 'Erro na transcrição. Tente novamente ou importe um arquivo SRT.' 
      });
      setIsTranscribing(false);
      throw serverError;
    }
  };

  const reset = () => {
    setTranscriptionProgress({
      stage: 'idle',
      progress: 0,
      message: ''
    });
    setIsTranscribing(false);
    setUsedFallback(false);
  };

  return {
    transcribeVideo,
    transcriptionProgress,
    isTranscribing,
    usedFallback,
    reset
  };
}
