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

export function useWhisperTranscription() {
  const [transcriptionProgress, setTranscriptionProgress] = useState<TranscriptionProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const [isTranscribing, setIsTranscribing] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadFFmpeg = async () => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;

    setTranscriptionProgress({ stage: 'loading', progress: 5, message: 'Carregando processador de áudio...' });

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    ffmpeg.on('progress', ({ progress }) => {
      setTranscriptionProgress(prev => ({
        ...prev,
        progress: Math.min(15 + progress * 25, 40),
        message: `Extraindo áudio... ${Math.round(progress * 100)}%`
      }));
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
  };

  const transcribeVideo = async (
    videoUrl: string,
    matchId: string,
    videoId: string
  ): Promise<TranscriptionResult | null> => {
    setIsTranscribing(true);

    try {
      // Step 1: Load FFmpeg
      const ffmpeg = await loadFFmpeg();

      // Step 2: Download video
      setTranscriptionProgress({ stage: 'downloading', progress: 10, message: 'Baixando vídeo para extração de áudio...' });
      
      const videoData = await fetchFile(videoUrl);
      console.log('Vídeo baixado:', (videoData.byteLength / (1024 * 1024)).toFixed(2), 'MB');

      // Write to FFmpeg filesystem
      await ffmpeg.writeFile('input.mp4', videoData);

      // Step 3: Extract audio (MP3, mono, 16kHz - optimized for speech)
      setTranscriptionProgress({ stage: 'extracting', progress: 15, message: 'Extraindo áudio do vídeo...' });
      
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-vn',                    // No video
        '-acodec', 'libmp3lame',  // MP3 codec
        '-q:a', '4',              // Quality (0-9, lower is better)
        '-ar', '16000',           // 16kHz sample rate (good for speech)
        '-ac', '1',               // Mono (smaller file)
        'output.mp3'
      ]);

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

      console.log('Áudio extraído:', (audioBlob.size / (1024 * 1024)).toFixed(2), 'MB');

      // Clean up FFmpeg filesystem
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp3');

      // Step 4: Upload audio to storage
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

      const { data: urlData } = supabase.storage
        .from('generated-audio')
        .getPublicUrl(filePath);

      const audioUrl = urlData.publicUrl;

      // Step 5: Transcribe with Whisper via edge function
      setTranscriptionProgress({ stage: 'transcribing', progress: 55, message: 'Transcrevendo com Whisper API (isso pode levar alguns minutos)...' });

      const { data, error } = await supabase.functions.invoke('transcribe-audio-whisper', {
        body: { audioUrl }
      });

      if (error) {
        throw new Error(`Erro na transcrição: ${error.message}`);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Erro desconhecido na transcrição');
      }

      setTranscriptionProgress({ stage: 'complete', progress: 100, message: 'Transcrição completa!' });

      return {
        srtContent: data.srtContent,
        text: data.text,
        audioUrl
      };

    } catch (error) {
      console.error('Erro na transcrição:', error);
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
