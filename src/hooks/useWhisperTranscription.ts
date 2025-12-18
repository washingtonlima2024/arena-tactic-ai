import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';

interface TranscriptionProgress {
  stage: 'idle' | 'loading' | 'downloading' | 'extracting' | 'uploading' | 'transcribing' | 'complete' | 'error';
  progress: number;
  message: string;
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
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadFFmpeg = async () => {
    console.log('[FFmpeg] Verificando se já está carregado...');
    
    if (ffmpegRef.current?.loaded) {
      console.log('[FFmpeg] ✓ Já carregado, reutilizando instância');
      return ffmpegRef.current;
    }

    console.log('[FFmpeg] Iniciando carregamento...');
    setTranscriptionProgress({ stage: 'loading', progress: 5, message: 'Carregando processador de áudio...' });

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    ffmpeg.on('progress', ({ progress }) => {
      const progressPercent = Math.round(progress * 100);
      console.log(`[FFmpeg] Progresso: ${progressPercent}%`);
      setTranscriptionProgress(prev => ({
        ...prev,
        progress: Math.min(15 + progress * 25, 40),
        message: `Extraindo áudio... ${progressPercent}%`
      }));
    });

    // UMD version works without SharedArrayBuffer/COOP/COEP headers
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    try {
      console.log('[FFmpeg] Carregando core e wasm...');
      
      const coreURL = await withTimeout(
        toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        30000,
        'carregar ffmpeg-core.js'
      );
      console.log('[FFmpeg] ✓ Core JS carregado');
      
      const wasmURL = await withTimeout(
        toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        60000,
        'carregar ffmpeg-core.wasm'
      );
      console.log('[FFmpeg] ✓ WASM carregado');
      
      await withTimeout(
        ffmpeg.load({ coreURL, wasmURL }),
        30000,
        'inicializar FFmpeg'
      );
      
      console.log('[FFmpeg] ✓ FFmpeg carregado com sucesso!');
    } catch (error) {
      console.error('[FFmpeg] ✗ Erro ao carregar:', error);
      throw new Error('Erro ao carregar processador de áudio. Tente novamente ou use um arquivo SRT.');
    }

    return ffmpeg;
  };

  const transcribeVideo = async (
    videoUrl: string,
    matchId: string,
    videoId: string
  ): Promise<TranscriptionResult | null> => {
    console.log('[Transcrição] ========================================');
    console.log('[Transcrição] Iniciando transcrição para:', videoUrl);
    console.log('[Transcrição] Match ID:', matchId);
    console.log('[Transcrição] Video ID:', videoId);
    
    setIsTranscribing(true);

    try {
      // Step 1: Load FFmpeg
      console.log('[Transcrição] PASSO 1: Carregando FFmpeg...');
      const ffmpeg = await loadFFmpeg();
      console.log('[Transcrição] ✓ FFmpeg pronto');

      // Step 2: Download video
      console.log('[Transcrição] PASSO 2: Baixando vídeo...');
      setTranscriptionProgress({ stage: 'downloading', progress: 10, message: 'Baixando vídeo para extração de áudio...' });
      
      const videoData = await withTimeout(
        fetchFile(videoUrl),
        120000, // 2 minutos para download
        'download do vídeo'
      );
      
      const videoSizeMB = (videoData.byteLength / (1024 * 1024)).toFixed(2);
      console.log('[Transcrição] ✓ Vídeo baixado:', videoSizeMB, 'MB');

      // Write to FFmpeg filesystem
      console.log('[Transcrição] Escrevendo arquivo no sistema FFmpeg...');
      await ffmpeg.writeFile('input.mp4', videoData);
      console.log('[Transcrição] ✓ Arquivo escrito');

      // Step 3: Extract audio (MP3, mono, 16kHz - optimized for speech)
      console.log('[Transcrição] PASSO 3: Extraindo áudio...');
      setTranscriptionProgress({ stage: 'extracting', progress: 15, message: 'Extraindo áudio do vídeo...' });
      
      await withTimeout(
        ffmpeg.exec([
          '-i', 'input.mp4',
          '-vn',                    // No video
          '-acodec', 'libmp3lame',  // MP3 codec
          '-q:a', '4',              // Quality (0-9, lower is better)
          '-ar', '16000',           // 16kHz sample rate (good for speech)
          '-ac', '1',               // Mono (smaller file)
          'output.mp3'
        ]),
        180000, // 3 minutos para extração
        'extração de áudio'
      );
      
      console.log('[Transcrição] ✓ Áudio extraído');

      // Read the output
      const audioData = await ffmpeg.readFile('output.mp3');
      let audioBlob: Blob;
      if (audioData instanceof Uint8Array) {
        const buffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(buffer);
        view.set(audioData);
        audioBlob = new Blob([buffer], { type: 'audio/mpeg' });
      } else {
        audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      }

      const audioSizeMB = (audioBlob.size / (1024 * 1024)).toFixed(2);
      console.log('[Transcrição] ✓ Áudio pronto:', audioSizeMB, 'MB');

      // Clean up FFmpeg filesystem
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp3');
      console.log('[Transcrição] ✓ Arquivos temporários limpos');

      // Step 4: Upload audio to storage
      console.log('[Transcrição] PASSO 4: Fazendo upload do áudio...');
      setTranscriptionProgress({ stage: 'uploading', progress: 45, message: 'Enviando áudio para transcrição...' });
      
      const filePath = `${matchId}/${videoId}_whisper.mp3`;
      const { error: uploadError } = await supabase.storage
        .from('generated-audio')
        .upload(filePath, audioBlob, {
          contentType: 'audio/mpeg',
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Erro ao fazer upload do áudio: ${uploadError.message}`);
      }
      console.log('[Transcrição] ✓ Áudio uploaded');

      const { data: urlData } = supabase.storage
        .from('generated-audio')
        .getPublicUrl(filePath);

      const audioUrl = urlData.publicUrl;
      console.log('[Transcrição] URL do áudio:', audioUrl);

      // Step 5: Transcribe with Whisper via edge function
      console.log('[Transcrição] PASSO 5: Enviando para Whisper API...');
      setTranscriptionProgress({ stage: 'transcribing', progress: 55, message: 'Transcrevendo com Whisper API (isso pode levar alguns minutos)...' });

      const { data, error } = await withTimeout(
        supabase.functions.invoke('transcribe-audio-whisper', {
          body: { audioUrl }
        }),
        300000, // 5 minutos para transcrição
        'transcrição Whisper'
      );

      if (error) {
        throw new Error(`Erro na transcrição: ${error.message}`);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Erro desconhecido na transcrição');
      }

      console.log('[Transcrição] ✓ Transcrição completa!');
      console.log('[Transcrição] Texto:', data.text?.length || 0, 'caracteres');
      
      setTranscriptionProgress({ stage: 'complete', progress: 100, message: 'Transcrição completa!' });

      return {
        srtContent: data.srtContent,
        text: data.text,
        audioUrl
      };

    } catch (error) {
      console.error('[Transcrição] ✗ ERRO:', error);
      setTranscriptionProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      });
      return null;
    } finally {
      setIsTranscribing(false);
    }
  };

  const resetProgress = () => {
    setTranscriptionProgress({ stage: 'idle', progress: 0, message: '' });
    setIsTranscribing(false);
  };

  return {
    transcribeVideo,
    transcriptionProgress,
    isTranscribing,
    resetProgress
  };
}
