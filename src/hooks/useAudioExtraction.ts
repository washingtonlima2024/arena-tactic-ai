import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';

interface ExtractionProgress {
  stage: 'idle' | 'loading' | 'downloading' | 'extracting' | 'uploading' | 'complete' | 'error';
  progress: number;
  message: string;
}

interface ExtractionResult {
  audioUrl: string;
  duration: number;
}

export function useAudioExtraction() {
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadFFmpeg = async () => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;

    setExtractionProgress({ stage: 'loading', progress: 10, message: 'Carregando processador de áudio...' });

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    ffmpeg.on('progress', ({ progress }) => {
      setExtractionProgress(prev => ({
        ...prev,
        progress: Math.min(30 + progress * 50, 80),
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

  const extractAudio = async (
    videoUrl: string,
    matchId: string,
    videoId: string
  ): Promise<ExtractionResult> => {
    setIsExtracting(true);

    try {
      // Load FFmpeg
      const ffmpeg = await loadFFmpeg();

      // Download video
      setExtractionProgress({ stage: 'downloading', progress: 20, message: 'Baixando vídeo...' });
      const videoData = await fetchFile(videoUrl);

      // Write to FFmpeg filesystem
      await ffmpeg.writeFile('input.mp4', videoData);

      // Extract audio only (MP3, much smaller than video)
      setExtractionProgress({ stage: 'extracting', progress: 30, message: 'Extraindo áudio do vídeo...' });
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
      // Handle both Uint8Array and string responses
      let audioBlob: Blob;
      if (audioData instanceof Uint8Array) {
        // Create new ArrayBuffer copy to avoid SharedArrayBuffer issues
        const buffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(buffer);
        view.set(audioData);
        audioBlob = new Blob([buffer], { type: 'audio/mpeg' });
      } else {
        // String response - convert to Blob
        audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      }

      console.log('Áudio extraído:', (audioBlob.size / (1024 * 1024)).toFixed(2), 'MB');

      // Upload to Supabase Storage
      setExtractionProgress({ stage: 'uploading', progress: 85, message: 'Enviando áudio para análise...' });
      
      const filePath = `${matchId}/${videoId}_extracted.mp3`;
      const { error: uploadError } = await supabase.storage
        .from('generated-audio')
        .upload(filePath, audioBlob, {
          contentType: 'audio/mpeg',
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Erro ao fazer upload do áudio: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('generated-audio')
        .getPublicUrl(filePath);

      const audioUrl = urlData.publicUrl;

      // Clean up FFmpeg filesystem
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp3');

      setExtractionProgress({ stage: 'complete', progress: 100, message: 'Áudio extraído com sucesso!' });

      return {
        audioUrl,
        duration: 0 // Duration will be detected by Whisper
      };

    } catch (error) {
      console.error('Erro na extração de áudio:', error);
      setExtractionProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      });
      throw error;
    } finally {
      setIsExtracting(false);
    }
  };

  const resetProgress = () => {
    setExtractionProgress({ stage: 'idle', progress: 0, message: '' });
    setIsExtracting(false);
  };

  return {
    extractAudio,
    extractionProgress,
    isExtracting,
    resetProgress
  };
}
