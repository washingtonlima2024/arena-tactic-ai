import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';

interface TranscriptionProgress {
  stage: 'idle' | 'loading' | 'downloading' | 'extracting' | 'splitting' | 'uploading' | 'transcribing' | 'complete' | 'error';
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

// Tamanho máximo por chunk (18MB para ter margem)
const MAX_CHUNK_SIZE = 18 * 1024 * 1024;

export function useWhisperTranscription() {
  const [transcriptionProgress, setTranscriptionProgress] = useState<TranscriptionProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadFFmpeg = async () => {
    console.log('[FFmpeg] ========================================');
    console.log('[FFmpeg] Verificando compatibilidade...');
    
    // Verificar suporte a WebAssembly
    if (typeof WebAssembly === 'undefined') {
      const error = new Error('Seu navegador não suporta WebAssembly. Use Chrome, Firefox ou Edge atualizado.');
      console.error('[FFmpeg] ✗ WebAssembly não suportado');
      throw error;
    }
    console.log('[FFmpeg] ✓ WebAssembly suportado');
    
    if (ffmpegRef.current?.loaded) {
      console.log('[FFmpeg] ✓ Já carregado, reutilizando instância');
      return ffmpegRef.current;
    }

    console.log('[FFmpeg] Iniciando carregamento...');
    setTranscriptionProgress({ stage: 'loading', progress: 5, message: 'Carregando processador de áudio...' });

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg Log]', message);
    });

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
      console.log('[FFmpeg] Carregando core JS...');
      setTranscriptionProgress({ stage: 'loading', progress: 2, message: 'Baixando processador (1/3)...' });
      
      const coreURL = await withTimeout(
        toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        30000,
        'carregar ffmpeg-core.js'
      );
      console.log('[FFmpeg] ✓ Core JS carregado:', coreURL.substring(0, 50) + '...');
      
      console.log('[FFmpeg] Carregando WASM...');
      setTranscriptionProgress({ stage: 'loading', progress: 4, message: 'Baixando processador (2/3)...' });
      
      const wasmURL = await withTimeout(
        toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        60000,
        'carregar ffmpeg-core.wasm'
      );
      console.log('[FFmpeg] ✓ WASM carregado:', wasmURL.substring(0, 50) + '...');
      
      console.log('[FFmpeg] Inicializando FFmpeg.load()...');
      setTranscriptionProgress({ stage: 'loading', progress: 6, message: 'Inicializando processador (3/3)...' });
      
      const loadPromise = ffmpeg.load({ coreURL, wasmURL });
      
      // Log se a promise resolver ou rejeitar
      loadPromise
        .then(() => console.log('[FFmpeg] ✓ load() Promise resolvida'))
        .catch(e => console.error('[FFmpeg] ✗ load() Promise rejeitada:', e));
      
      await withTimeout(loadPromise, 30000, 'inicializar FFmpeg');
      
      console.log('[FFmpeg] ✓ FFmpeg carregado com sucesso!');
      console.log('[FFmpeg] ========================================');
      
    } catch (error) {
      console.error('[FFmpeg] ✗ Erro ao carregar:', error);
      console.error('[FFmpeg] Tipo do erro:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('[FFmpeg] Stack:', error instanceof Error ? error.stack : 'N/A');
      throw new Error('Erro ao carregar processador de áudio. Tente novamente ou use um arquivo SRT.');
    }

    return ffmpeg;
  };

  // Função para dividir áudio em chunks por duração
  const splitAudioIntoChunks = async (
    ffmpeg: FFmpeg,
    totalDuration: number,
    audioSizeMB: number
  ): Promise<string[]> => {
    // Calcular quantos chunks precisamos baseado no tamanho
    const numChunks = Math.ceil((audioSizeMB * 1024 * 1024) / MAX_CHUNK_SIZE);
    const chunkDuration = Math.ceil(totalDuration / numChunks);
    
    console.log(`[Split] Dividindo áudio em ${numChunks} partes de ~${chunkDuration}s cada`);
    
    const chunkFiles: string[] = [];
    
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDuration;
      const outputFile = `chunk_${i}.mp3`;
      
      setTranscriptionProgress({ 
        stage: 'splitting', 
        progress: 35 + (i / numChunks) * 10, 
        message: `Dividindo áudio... parte ${i + 1}/${numChunks}` 
      });
      
      await ffmpeg.exec([
        '-i', 'full_audio.mp3',
        '-ss', startTime.toString(),
        '-t', chunkDuration.toString(),
        '-acodec', 'copy',
        outputFile
      ]);
      
      chunkFiles.push(outputFile);
      console.log(`[Split] ✓ Chunk ${i + 1}/${numChunks} criado`);
    }
    
    return chunkFiles;
  };

  // Obter duração do áudio
  const getAudioDuration = async (ffmpeg: FFmpeg, filename: string): Promise<number> => {
    // Tentar ler metadata - se falhar, estimar baseado no tamanho
    try {
      // MP3 mono 16kHz ~16KB/s = 1MB ~62 segundos
      const audioData = await ffmpeg.readFile(filename);
      const sizeMB = (audioData as Uint8Array).length / (1024 * 1024);
      const estimatedDuration = sizeMB * 62; // ~62 segundos por MB para MP3 mono 16kHz
      console.log(`[Duration] Duração estimada: ${estimatedDuration.toFixed(0)}s para ${sizeMB.toFixed(2)}MB`);
      return estimatedDuration;
    } catch {
      return 300; // Fallback: 5 minutos
    }
  };

  // Fallback: usar Google Speech-to-Text via edge function
  const transcribeWithGoogleFallback = async (
    videoUrl: string,
    matchId: string,
    videoId: string
  ): Promise<TranscriptionResult | null> => {
    console.log('[Google Fallback] ========================================');
    console.log('[Google Fallback] Usando Google Speech-to-Text API...');
    
    setTranscriptionProgress({ 
      stage: 'transcribing', 
      progress: 30, 
      message: 'Transcrevendo com Google Speech API (fallback)...' 
    });

    const { data, error } = await supabase.functions.invoke('transcribe-google-speech', {
      body: { videoUrl, matchId, videoId }
    });

    if (error) {
      console.error('[Google Fallback] Erro:', error);
      throw new Error(`Erro no Google Speech: ${error.message}`);
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Erro desconhecido no Google Speech');
    }

    console.log('[Google Fallback] ✓ Transcrição completa:', data.text?.length, 'caracteres');
    
    return {
      srtContent: data.srt || '',
      text: data.text,
      audioUrl: ''
    };
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
    setUsedFallback(false);

    try {
      // Tentar FFmpeg + Whisper primeiro com timeout curto
      console.log('[Transcrição] PASSO 1: Tentando FFmpeg + Whisper...');
      
      let ffmpeg: FFmpeg;
      try {
        // Timeout de 20 segundos para carregar FFmpeg
        ffmpeg = await Promise.race([
          loadFFmpeg(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('FFmpeg timeout')), 20000)
          )
        ]);
        console.log('[Transcrição] ✓ FFmpeg pronto');
      } catch (ffmpegError) {
        console.warn('[Transcrição] ⚠️ FFmpeg falhou, usando fallback Google Speech...');
        console.warn('[Transcrição] Erro FFmpeg:', ffmpegError);
        
        setUsedFallback(true);
        const fallbackResult = await transcribeWithGoogleFallback(videoUrl, matchId, videoId);
        
        if (fallbackResult?.text) {
          setTranscriptionProgress({ stage: 'complete', progress: 100, message: 'Transcrição completa (Google Speech)!' });
          return fallbackResult;
        }
        throw new Error('Fallback Google Speech também falhou');
      }

      // Step 2: Download video
      console.log('[Transcrição] PASSO 2: Baixando vídeo...');
      setTranscriptionProgress({ stage: 'downloading', progress: 10, message: 'Baixando vídeo para extração de áudio...' });
      
      const videoData = await withTimeout(
        fetchFile(videoUrl),
        180000, // 3 minutos para download
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
          'full_audio.mp3'
        ]),
        300000, // 5 minutos para extração
        'extração de áudio'
      );
      
      console.log('[Transcrição] ✓ Áudio extraído');

      // Clean up video file to free memory
      await ffmpeg.deleteFile('input.mp4');

      // Read the output and check size
      const audioData = await ffmpeg.readFile('full_audio.mp3');
      let audioBytes: Uint8Array;
      if (audioData instanceof Uint8Array) {
        audioBytes = audioData;
      } else {
        audioBytes = new Uint8Array(audioData as unknown as ArrayBuffer);
      }
      const audioSizeMB = audioBytes.length / (1024 * 1024);
      console.log('[Transcrição] ✓ Áudio pronto:', audioSizeMB.toFixed(2), 'MB');

      let allTranscriptions: string[] = [];
      let mainAudioUrl = '';

      // Check if we need to split
      if (audioBytes.length > MAX_CHUNK_SIZE) {
        console.log('[Transcrição] Áudio muito grande, dividindo em partes...');
        
        const duration = await getAudioDuration(ffmpeg, 'full_audio.mp3');
        const chunkFiles = await splitAudioIntoChunks(ffmpeg, duration, audioSizeMB);
        
        // Transcribe each chunk
        for (let i = 0; i < chunkFiles.length; i++) {
          const chunkFile = chunkFiles[i];
          setTranscriptionProgress({ 
            stage: 'transcribing', 
            progress: 50 + (i / chunkFiles.length) * 45, 
            message: `Transcrevendo parte ${i + 1}/${chunkFiles.length}...` 
          });
          
          // Read and upload chunk
          const chunkData = await ffmpeg.readFile(chunkFile);
          let chunkBytes: Uint8Array;
          if (chunkData instanceof Uint8Array) {
            chunkBytes = chunkData;
          } else {
            chunkBytes = new Uint8Array(chunkData as unknown as ArrayBuffer);
          }
          const chunkBlob = new Blob([new Uint8Array(chunkBytes).buffer.slice(0)], { type: 'audio/mpeg' });
          
          const chunkPath = `${matchId}/${videoId}_chunk_${i}.mp3`;
          await supabase.storage
            .from('generated-audio')
            .upload(chunkPath, chunkBlob, {
              contentType: 'audio/mpeg',
              upsert: true
            });
          
          const { data: urlData } = supabase.storage
            .from('generated-audio')
            .getPublicUrl(chunkPath);
          
          if (i === 0) mainAudioUrl = urlData.publicUrl;
          
          // Transcribe chunk
          console.log(`[Transcrição] Transcrevendo chunk ${i + 1}/${chunkFiles.length}...`);
          const { data, error } = await withTimeout(
            supabase.functions.invoke('transcribe-audio-whisper', {
              body: { audioUrl: urlData.publicUrl }
            }),
            300000,
            `transcrição chunk ${i + 1}`
          );
          
          if (error) {
            console.error(`Erro no chunk ${i + 1}:`, error);
            // Continue com outros chunks mesmo se um falhar
          } else if (data?.text) {
            allTranscriptions.push(data.text);
            console.log(`[Transcrição] ✓ Chunk ${i + 1} transcrito: ${data.text.length} caracteres`);
          }
          
          // Cleanup chunk
          await ffmpeg.deleteFile(chunkFile);
        }
        
        // Cleanup full audio
        await ffmpeg.deleteFile('full_audio.mp3');
        
      } else {
        // Single file transcription
        console.log('[Transcrição] Áudio dentro do limite, transcrevendo arquivo único...');
        
        const audioBlob = new Blob([new Uint8Array(audioBytes).buffer.slice(0)], { type: 'audio/mpeg' });

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

        mainAudioUrl = urlData.publicUrl;
        console.log('[Transcrição] URL do áudio:', mainAudioUrl);

        // Step 5: Transcribe with Whisper via edge function
        console.log('[Transcrição] PASSO 5: Enviando para Whisper API...');
        setTranscriptionProgress({ stage: 'transcribing', progress: 55, message: 'Transcrevendo com Whisper API...' });

        const { data, error } = await withTimeout(
          supabase.functions.invoke('transcribe-audio-whisper', {
            body: { audioUrl: mainAudioUrl }
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

        allTranscriptions.push(data.text);
        
        // Cleanup
        await ffmpeg.deleteFile('full_audio.mp3');
      }

      // Combine all transcriptions
      const fullText = allTranscriptions.join('\n\n');
      
      if (!fullText || fullText.trim().length === 0) {
        throw new Error('Transcrição retornou vazia. Verifique se o vídeo contém áudio audível.');
      }

      console.log('[Transcrição] ✓ Transcrição completa!');
      console.log('[Transcrição] Texto total:', fullText.length, 'caracteres');
      
      setTranscriptionProgress({ stage: 'complete', progress: 100, message: 'Transcrição completa!' });

      return {
        srtContent: '', // SRT não é gerado com chunks
        text: fullText,
        audioUrl: mainAudioUrl
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
    usedFallback,
    resetProgress
  };
}
