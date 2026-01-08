import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
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

// Duração máxima por parte do vídeo (10 minutos = 600 segundos)
const MAX_PART_DURATION = 600;

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
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    try {
      console.log('[FFmpeg] Carregando core JS...');
      setTranscriptionProgress({ stage: 'loading', progress: 2, message: 'Baixando processador (1/3)...' });
      
      const coreURL = await withTimeout(
        toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        30000,
        'carregar ffmpeg-core.js'
      );
      console.log('[FFmpeg] ✓ Core JS carregado');
      
      console.log('[FFmpeg] Carregando WASM...');
      setTranscriptionProgress({ stage: 'loading', progress: 4, message: 'Baixando processador (2/3)...' });
      
      const wasmURL = await withTimeout(
        toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        60000,
        'carregar ffmpeg-core.wasm'
      );
      console.log('[FFmpeg] ✓ WASM carregado');
      
      console.log('[FFmpeg] Inicializando FFmpeg.load()...');
      setTranscriptionProgress({ stage: 'loading', progress: 6, message: 'Inicializando processador (3/3)...' });
      
      const loadPromise = ffmpeg.load({ coreURL, wasmURL });
      await withTimeout(loadPromise, 30000, 'inicializar FFmpeg');
      
      console.log('[FFmpeg] ✓ FFmpeg carregado com sucesso!');
      console.log('[FFmpeg] ========================================');
      
    } catch (error) {
      console.error('[FFmpeg] ✗ Erro ao carregar:', error);
      throw new Error('Erro ao carregar processador de áudio. Tente novamente ou use um arquivo SRT.');
    }

    return ffmpeg;
  };

  // Estimar duração do vídeo baseado no tamanho
  const estimateVideoDuration = (videoSizeMB: number): number => {
    const estimatedMinutes = videoSizeMB / 5;
    const estimatedSeconds = estimatedMinutes * 60;
    console.log(`[Duration] Duração estimada: ${estimatedMinutes.toFixed(1)} min para ${videoSizeMB.toFixed(0)}MB`);
    return estimatedSeconds;
  };

  // Função para transcrever vídeos grandes dividindo em partes
  const transcribeLargeVideo = async (
    ffmpeg: FFmpeg,
    videoUrl: string,
    matchId: string,
    videoId: string,
    videoSizeMB: number
  ): Promise<TranscriptionResult | null> => {
    console.log('[LargeVideo] ========================================');
    console.log('[LargeVideo] Processando vídeo grande:', videoSizeMB.toFixed(0), 'MB');

    const totalDuration = estimateVideoDuration(videoSizeMB);
    const numParts = Math.ceil(totalDuration / MAX_PART_DURATION);
    
    console.log(`[LargeVideo] Dividindo em ${numParts} partes de ~${MAX_PART_DURATION/60} min cada`);

    const transcriptions: string[] = [];
    let mainAudioUrl = '';

    setTranscriptionProgress({ 
      stage: 'downloading', 
      progress: 5, 
      message: 'Baixando vídeo...',
      currentPart: 0,
      totalParts: numParts
    });

    const videoData = await withTimeout(
      fetchFile(videoUrl),
      300000,
      'download do vídeo'
    );
    console.log('[LargeVideo] ✓ Vídeo baixado:', (videoData.byteLength / (1024 * 1024)).toFixed(0), 'MB');

    await ffmpeg.writeFile('input.mp4', videoData);

    for (let i = 0; i < numParts; i++) {
      const partNum = i + 1;
      const startSeconds = i * MAX_PART_DURATION;
      const startMinutes = Math.floor(startSeconds / 60);
      const endMinutes = Math.floor(Math.min(startSeconds + MAX_PART_DURATION, totalDuration) / 60);

      console.log(`[LargeVideo] Processando parte ${partNum}/${numParts} (${startMinutes}'-${endMinutes}')`);

      setTranscriptionProgress({ 
        stage: 'extracting', 
        progress: 10 + (i / numParts) * 30, 
        message: `Extraindo áudio parte ${partNum}/${numParts} (${startMinutes}'-${endMinutes}')...`,
        currentPart: partNum,
        totalParts: numParts
      });

      const partAudioFile = `part_${i}.mp3`;
      
      try {
        await withTimeout(
          ffmpeg.exec([
            '-i', 'input.mp4',
            '-ss', startSeconds.toString(),
            '-t', MAX_PART_DURATION.toString(),
            '-vn',
            '-acodec', 'libmp3lame',
            '-q:a', '4',
            '-ar', '16000',
            '-ac', '1',
            partAudioFile
          ]),
          120000,
          `extração de áudio parte ${partNum}`
        );
      } catch (extractError) {
        console.warn(`[LargeVideo] Parte ${partNum} pode ter falhado na extração, continuando...`);
        continue;
      }

      let audioData: Uint8Array;
      try {
        const readData = await ffmpeg.readFile(partAudioFile);
        audioData = readData instanceof Uint8Array ? readData : new Uint8Array(readData as unknown as ArrayBuffer);
        
        if (audioData.length < 1000) {
          console.warn(`[LargeVideo] Parte ${partNum} muito pequena, pulando...`);
          continue;
        }
      } catch (readError) {
        console.warn(`[LargeVideo] Erro ao ler parte ${partNum}, pulando...`);
        continue;
      }

      const audioSizeMB = audioData.length / (1024 * 1024);
      console.log(`[LargeVideo] ✓ Áudio parte ${partNum}: ${audioSizeMB.toFixed(2)}MB`);

      // Upload to local storage
      setTranscriptionProgress({
        stage: 'uploading', 
        progress: 40 + (i / numParts) * 20, 
        message: `Enviando parte ${partNum}/${numParts}...`,
        currentPart: partNum,
        totalParts: numParts
      });

      const audioBlob = new Blob([new Uint8Array(audioData).buffer as ArrayBuffer], { type: 'audio/mpeg' });
      
      try {
        const uploadResult = await apiClient.uploadBlob(matchId, 'audio', audioBlob, `${videoId}_part_${i}.mp3`);
        if (i === 0) mainAudioUrl = uploadResult.url;
      } catch (uploadError) {
        console.error(`[LargeVideo] Erro no upload parte ${partNum}:`, uploadError);
        continue;
      }

      // Transcribe using local API
      setTranscriptionProgress({ 
        stage: 'transcribing', 
        progress: 60 + (i / numParts) * 35, 
        message: `Transcrevendo parte ${partNum}/${numParts} (${startMinutes}'-${endMinutes}')...`,
        currentPart: partNum,
        totalParts: numParts
      });

      try {
        // Convert to base64 for transcription API
        const arrayBuffer = await audioBlob.arrayBuffer();
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        
        const result = await withTimeout(
          apiClient.transcribeAudio({ audio: base64Audio, language: 'pt' }),
          180000,
          `transcrição parte ${partNum}`
        );

        if (result?.text) {
          const timeMarker = `[${startMinutes}'-${endMinutes}']`;
          transcriptions.push(`${timeMarker}\n${result.text}`);
          console.log(`[LargeVideo] ✓ Parte ${partNum} transcrita: ${result.text.length} caracteres`);
        }
      } catch (transcribeError) {
        console.error(`[LargeVideo] Erro na transcrição parte ${partNum}:`, transcribeError);
      }

      try {
        await ffmpeg.deleteFile(partAudioFile);
      } catch { }
    }

    try {
      await ffmpeg.deleteFile('input.mp4');
    } catch { }

    const fullText = transcriptions.join('\n\n');
    
    if (!fullText || fullText.trim().length === 0) {
      throw new Error('Nenhuma parte foi transcrita com sucesso. Verifique se o vídeo contém áudio.');
    }

    console.log(`[LargeVideo] ✓ Transcrição completa: ${numParts} partes, ${fullText.length} caracteres`);
    
    return {
      srtContent: fullText,
      text: fullText,
      audioUrl: mainAudioUrl
    };
  };

  // Fallback: usar API server-side
  const transcribeWithServerFallback = async (
    videoUrl: string,
    matchId: string,
    videoId: string
  ): Promise<TranscriptionResult | null> => {
    console.log('[Server Fallback] ========================================');
    console.log('[Server Fallback] Usando transcrição server-side...');
    
    setTranscriptionProgress({ 
      stage: 'transcribing', 
      progress: 30, 
      message: 'Transcrevendo no servidor...' 
    });

    const data = await apiClient.transcribeLargeVideo({ videoUrl, matchId, language: 'pt' });

    if (!data?.success) {
      throw new Error(data?.text || 'Erro desconhecido na transcrição');
    }

    console.log('[Server Fallback] ✓ Transcrição completa:', data.text?.length, 'caracteres');
    
    return {
      srtContent: data.srtContent || '',
      text: data.text || data.srtContent || '',
      audioUrl: ''
    };
  };

  const transcribeVideo = async (
    videoUrl: string,
    matchId: string,
    videoId: string,
    videoSizeMB?: number
  ): Promise<TranscriptionResult | null> => {
    console.log('[Transcrição] ========================================');
    console.log('[Transcrição] Iniciando transcrição para:', videoUrl);
    console.log('[Transcrição] Match ID:', matchId);
    console.log('[Transcrição] Video ID:', videoId);
    if (videoSizeMB) console.log('[Transcrição] Tamanho do vídeo (passado):', videoSizeMB, 'MB');
    
    setIsTranscribing(true);
    setUsedFallback(false);

    let detectedSizeMB = videoSizeMB;
    if (!detectedSizeMB) {
      try {
        console.log('[Transcrição] Detectando tamanho do vídeo...');
        setTranscriptionProgress({ stage: 'loading', progress: 2, message: 'Verificando tamanho do vídeo...' });
        
        const headResponse = await fetch(videoUrl, { method: 'HEAD' });
        const contentLength = headResponse.headers.get('content-length');
        if (contentLength) {
          detectedSizeMB = parseInt(contentLength) / (1024 * 1024);
          console.log('[Transcrição] Tamanho detectado:', detectedSizeMB.toFixed(1), 'MB');
        }
      } catch (headError) {
        console.warn('[Transcrição] Não foi possível detectar tamanho:', headError);
      }
    }

    try {
      console.log('[Transcrição] PASSO 1: Carregando FFmpeg...');
      
      let ffmpeg: FFmpeg;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          ffmpeg = await Promise.race([
            loadFFmpeg(),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('FFmpeg timeout')), 60000)
            )
          ]);
          console.log('[Transcrição] ✓ FFmpeg pronto');
          break;
        } catch (ffmpegError) {
          retryCount++;
          console.warn(`[Transcrição] ⚠️ FFmpeg tentativa ${retryCount}/${maxRetries} falhou:`, ffmpegError);
          
          if (retryCount < maxRetries) {
            console.log('[Transcrição] Aguardando 2s antes de tentar novamente...');
            setTranscriptionProgress({ 
              stage: 'loading', 
              progress: retryCount * 2, 
              message: `Carregando processador... tentativa ${retryCount + 1}/${maxRetries}` 
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
            ffmpegRef.current = null;
          } else {
            throw new Error(
              'Não foi possível carregar o processador de áudio após várias tentativas. ' +
              'Por favor, faça upload de um arquivo SRT ou VTT com a transcrição.'
            );
          }
        }
      }

      const isLargeVideo = detectedSizeMB && detectedSizeMB > 35;
      
      if (isLargeVideo) {
        console.log('[Transcrição] Vídeo grande detectado, usando processamento em partes...');
        const result = await transcribeLargeVideo(ffmpeg!, videoUrl, matchId, videoId, detectedSizeMB);
        
        if (result) {
          setTranscriptionProgress({ stage: 'complete', progress: 100, message: 'Transcrição completa!' });
          return result;
        }
        throw new Error('Falha na transcrição do vídeo grande');
      }

      // Normal flow for small videos
      console.log('[Transcrição] PASSO 2: Baixando vídeo...');
      setTranscriptionProgress({ stage: 'downloading', progress: 10, message: 'Baixando vídeo para extração de áudio...' });
      
      const videoData = await withTimeout(
        fetchFile(videoUrl),
        180000,
        'download do vídeo'
      );
      
      const actualVideoSizeMB = videoData.byteLength / (1024 * 1024);
      console.log('[Transcrição] ✓ Vídeo baixado:', actualVideoSizeMB.toFixed(2), 'MB');

      await ffmpeg!.writeFile('input.mp4', videoData);

      console.log('[Transcrição] PASSO 3: Extraindo áudio...');
      setTranscriptionProgress({ stage: 'extracting', progress: 15, message: 'Extraindo áudio do vídeo...' });
      
      await withTimeout(
        ffmpeg!.exec([
          '-i', 'input.mp4',
          '-vn',
          '-acodec', 'libmp3lame',
          '-q:a', '4',
          '-ar', '16000',
          '-ac', '1',
          'full_audio.mp3'
        ]),
        300000,
        'extração de áudio'
      );

      const audioData = await ffmpeg!.readFile('full_audio.mp3');
      const audioUint8 = audioData instanceof Uint8Array ? audioData : new Uint8Array(audioData as unknown as ArrayBuffer);
      const audioSizeMB = audioUint8.length / (1024 * 1024);
      console.log('[Transcrição] ✓ Áudio extraído:', audioSizeMB.toFixed(2), 'MB');

      setTranscriptionProgress({ stage: 'uploading', progress: 40, message: 'Enviando áudio para transcrição...' });

      const audioBlob = new Blob([new Uint8Array(audioUint8).buffer as ArrayBuffer], { type: 'audio/mpeg' });
      
      // Upload audio
      const uploadResult = await apiClient.uploadBlob(matchId, 'audio', audioBlob, `${videoId}_audio.mp3`);
      console.log('[Transcrição] ✓ Áudio enviado:', uploadResult.url);

      setTranscriptionProgress({ stage: 'transcribing', progress: 60, message: 'Transcrevendo áudio...' });

      // Convert to base64 for transcription
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      const transcriptData = await withTimeout(
        apiClient.transcribeAudio({ audio: base64Audio, language: 'pt' }),
        300000,
        'transcrição'
      );

      console.log('[Transcrição] ✓ Transcrição recebida:', transcriptData?.text?.length, 'caracteres');

      // Cleanup
      try {
        await ffmpeg!.deleteFile('input.mp4');
        await ffmpeg!.deleteFile('full_audio.mp3');
      } catch {}

      setTranscriptionProgress({ stage: 'complete', progress: 100, message: 'Transcrição completa!' });
      setIsTranscribing(false);

      return {
        srtContent: transcriptData.text || '',
        text: transcriptData.text || '',
        audioUrl: uploadResult.url
      };

    } catch (error) {
      console.error('[Transcrição] Erro no fluxo principal:', error);
      
      // Try server fallback
      console.log('[Transcrição] Tentando fallback server-side...');
      setUsedFallback(true);
      
      try {
        const fallbackResult = await transcribeWithServerFallback(videoUrl, matchId, videoId);
        setTranscriptionProgress({ stage: 'complete', progress: 100, message: 'Transcrição completa (servidor)!' });
        setIsTranscribing(false);
        return fallbackResult;
      } catch (fallbackError) {
        console.error('[Transcrição] Fallback também falhou:', fallbackError);
        setTranscriptionProgress({ 
          stage: 'error', 
          progress: 0, 
          message: `Erro: ${fallbackError instanceof Error ? fallbackError.message : 'Falha na transcrição'}` 
        });
        setIsTranscribing(false);
        throw fallbackError;
      }
    }
  };

  return {
    transcribeVideo,
    transcriptionProgress,
    isTranscribing,
    usedFallback,
    resetProgress: () => setTranscriptionProgress({ stage: 'idle', progress: 0, message: '' })
  };
}
