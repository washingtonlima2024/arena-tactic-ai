import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';

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

// Tamanho máximo por chunk de áudio (18MB para ter margem)
const MAX_CHUNK_SIZE = 18 * 1024 * 1024;

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
      
      loadPromise
        .then(() => console.log('[FFmpeg] ✓ load() Promise resolvida'))
        .catch(e => console.error('[FFmpeg] ✗ load() Promise rejeitada:', e));
      
      await withTimeout(loadPromise, 30000, 'inicializar FFmpeg');
      
      console.log('[FFmpeg] ✓ FFmpeg carregado com sucesso!');
      console.log('[FFmpeg] ========================================');
      
    } catch (error) {
      console.error('[FFmpeg] ✗ Erro ao carregar:', error);
      throw new Error('Erro ao carregar processador de áudio. Tente novamente ou use um arquivo SRT.');
    }

    return ffmpeg;
  };

  // Estimar duração do vídeo baseado no tamanho (fallback quando não temos metadata)
  const estimateVideoDuration = (videoSizeMB: number): number => {
    // Estimativa: ~5MB por minuto para vídeo comprimido
    // Vídeos de futebol geralmente têm 3-8MB/min dependendo da qualidade
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

    // Estimar duração total
    const totalDuration = estimateVideoDuration(videoSizeMB);
    const numParts = Math.ceil(totalDuration / MAX_PART_DURATION);
    
    console.log(`[LargeVideo] Dividindo em ${numParts} partes de ~${MAX_PART_DURATION/60} min cada`);

    const transcriptions: string[] = [];
    let mainAudioUrl = '';

    // Baixar o vídeo uma vez
    setTranscriptionProgress({ 
      stage: 'downloading', 
      progress: 5, 
      message: 'Baixando vídeo...',
      currentPart: 0,
      totalParts: numParts
    });

    const videoData = await withTimeout(
      fetchFile(videoUrl),
      300000, // 5 minutos para download de vídeos grandes
      'download do vídeo'
    );
    console.log('[LargeVideo] ✓ Vídeo baixado:', (videoData.byteLength / (1024 * 1024)).toFixed(0), 'MB');

    await ffmpeg.writeFile('input.mp4', videoData);

    // Processar cada parte
    for (let i = 0; i < numParts; i++) {
      const partNum = i + 1;
      const startSeconds = i * MAX_PART_DURATION;
      const startMinutes = Math.floor(startSeconds / 60);
      const endMinutes = Math.floor(Math.min(startSeconds + MAX_PART_DURATION, totalDuration) / 60);

      console.log(`[LargeVideo] Processando parte ${partNum}/${numParts} (${startMinutes}'-${endMinutes}')`);

      // Extrair áudio desta parte
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
            '-vn',                    // No video
            '-acodec', 'libmp3lame',  // MP3 codec
            '-q:a', '4',              // Quality
            '-ar', '16000',           // 16kHz sample rate
            '-ac', '1',               // Mono
            partAudioFile
          ]),
          120000, // 2 minutos por parte
          `extração de áudio parte ${partNum}`
        );
      } catch (extractError) {
        console.warn(`[LargeVideo] Parte ${partNum} pode ter falhado na extração, continuando...`);
        continue;
      }

      // Verificar se o arquivo foi criado
      let audioData: Uint8Array;
      try {
        const readData = await ffmpeg.readFile(partAudioFile);
        audioData = readData instanceof Uint8Array ? readData : new Uint8Array(readData as unknown as ArrayBuffer);
        
        if (audioData.length < 1000) {
          console.warn(`[LargeVideo] Parte ${partNum} muito pequena (${audioData.length} bytes), pulando...`);
          continue;
        }
      } catch (readError) {
        console.warn(`[LargeVideo] Erro ao ler parte ${partNum}, pulando...`);
        continue;
      }

      const audioSizeMB = audioData.length / (1024 * 1024);
      console.log(`[LargeVideo] ✓ Áudio parte ${partNum}: ${audioSizeMB.toFixed(2)}MB`);

      // Upload da parte - criar buffer slice para evitar erro de tipo
      const audioBuffer = new Uint8Array(audioData).buffer.slice(0);
      setTranscriptionProgress({
        stage: 'uploading', 
        progress: 40 + (i / numParts) * 20, 
        message: `Enviando parte ${partNum}/${numParts}...`,
        currentPart: partNum,
        totalParts: numParts
      });

      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const partPath = `${matchId}/${videoId}_part_${i}.mp3`;
      
      const { error: uploadError } = await supabase.storage
        .from('generated-audio')
        .upload(partPath, audioBlob, {
          contentType: 'audio/mpeg',
          upsert: true
        });

      if (uploadError) {
        console.error(`[LargeVideo] Erro no upload parte ${partNum}:`, uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('generated-audio')
        .getPublicUrl(partPath);

      if (i === 0) mainAudioUrl = urlData.publicUrl;

      // Transcrever a parte
      setTranscriptionProgress({ 
        stage: 'transcribing', 
        progress: 60 + (i / numParts) * 35, 
        message: `Transcrevendo parte ${partNum}/${numParts} (${startMinutes}'-${endMinutes}')...`,
        currentPart: partNum,
        totalParts: numParts
      });

      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke('transcribe-audio-whisper', {
            body: { audioUrl: urlData.publicUrl }
          }),
          180000, // 3 minutos por transcrição
          `transcrição parte ${partNum}`
        );

        if (error) {
          console.error(`[LargeVideo] Erro na transcrição parte ${partNum}:`, error);
        } else if (data?.text) {
          // Adicionar marcador de tempo à transcrição
          const timeMarker = `[${startMinutes}'-${endMinutes}']`;
          transcriptions.push(`${timeMarker}\n${data.text}`);
          console.log(`[LargeVideo] ✓ Parte ${partNum} transcrita: ${data.text.length} caracteres`);
        }
      } catch (transcribeError) {
        console.error(`[LargeVideo] Timeout/erro na transcrição parte ${partNum}:`, transcribeError);
      }

      // Limpar arquivo da parte
      try {
        await ffmpeg.deleteFile(partAudioFile);
      } catch { }
    }

    // Limpar arquivo de entrada
    try {
      await ffmpeg.deleteFile('input.mp4');
    } catch { }

    // Combinar todas as transcrições
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
      const errorContext = (error as any).context;
      let errorMessage = error.message;
      
      if (data?.error) {
        errorMessage = data.error;
      } else if (errorContext?.error) {
        errorMessage = errorContext.error;
      }
      
      throw new Error(errorMessage);
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
    videoId: string,
    videoSizeMB?: number
  ): Promise<TranscriptionResult | null> => {
    console.log('[Transcrição] ========================================');
    console.log('[Transcrição] Iniciando transcrição para:', videoUrl);
    console.log('[Transcrição] Match ID:', matchId);
    console.log('[Transcrição] Video ID:', videoId);
    if (videoSizeMB) console.log('[Transcrição] Tamanho do vídeo:', videoSizeMB, 'MB');
    
    setIsTranscribing(true);
    setUsedFallback(false);

    try {
      // Tentar FFmpeg + Whisper primeiro
      console.log('[Transcrição] PASSO 1: Carregando FFmpeg...');
      
      let ffmpeg: FFmpeg;
      try {
        ffmpeg = await Promise.race([
          loadFFmpeg(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('FFmpeg timeout')), 25000)
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

      // Verificar se é um vídeo grande (> 35MB)
      const isLargeVideo = videoSizeMB && videoSizeMB > 35;
      
      if (isLargeVideo) {
        console.log('[Transcrição] Vídeo grande detectado, usando processamento em partes...');
        const result = await transcribeLargeVideo(ffmpeg, videoUrl, matchId, videoId, videoSizeMB);
        
        if (result) {
          setTranscriptionProgress({ stage: 'complete', progress: 100, message: 'Transcrição completa!' });
          return result;
        }
        throw new Error('Falha na transcrição do vídeo grande');
      }

      // Fluxo normal para vídeos pequenos
      console.log('[Transcrição] PASSO 2: Baixando vídeo...');
      setTranscriptionProgress({ stage: 'downloading', progress: 10, message: 'Baixando vídeo para extração de áudio...' });
      
      const videoData = await withTimeout(
        fetchFile(videoUrl),
        180000, // 3 minutos para download
        'download do vídeo'
      );
      
      const actualVideoSizeMB = videoData.byteLength / (1024 * 1024);
      console.log('[Transcrição] ✓ Vídeo baixado:', actualVideoSizeMB.toFixed(2), 'MB');

      await ffmpeg.writeFile('input.mp4', videoData);

      // Extract audio
      console.log('[Transcrição] PASSO 3: Extraindo áudio...');
      setTranscriptionProgress({ stage: 'extracting', progress: 15, message: 'Extraindo áudio do vídeo...' });
      
      await withTimeout(
        ffmpeg.exec([
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
      
      console.log('[Transcrição] ✓ Áudio extraído');

      await ffmpeg.deleteFile('input.mp4');

      const audioData = await ffmpeg.readFile('full_audio.mp3');
      const audioBytes = audioData instanceof Uint8Array ? audioData : new Uint8Array(audioData as unknown as ArrayBuffer);
      const audioSizeMB = audioBytes.length / (1024 * 1024);
      console.log('[Transcrição] ✓ Áudio pronto:', audioSizeMB.toFixed(2), 'MB');

      let allTranscriptions: string[] = [];
      let mainAudioUrl = '';

      // Check if we need to split audio
      if (audioBytes.length > MAX_CHUNK_SIZE) {
        console.log('[Transcrição] Áudio muito grande, dividindo em partes...');
        
        // Estimar duração baseado no tamanho
        const duration = audioSizeMB * 62; // ~62 segundos por MB para MP3 mono 16kHz
        const numChunks = Math.ceil((audioSizeMB * 1024 * 1024) / MAX_CHUNK_SIZE);
        const chunkDuration = Math.ceil(duration / numChunks);
        
        console.log(`[Split] Dividindo em ${numChunks} partes de ~${chunkDuration}s cada`);
        
        for (let i = 0; i < numChunks; i++) {
          const startTime = i * chunkDuration;
          const outputFile = `chunk_${i}.mp3`;
          
          setTranscriptionProgress({ 
            stage: 'splitting', 
            progress: 35 + (i / numChunks) * 10, 
            message: `Dividindo áudio... parte ${i + 1}/${numChunks}`,
            currentPart: i + 1,
            totalParts: numChunks
          });
          
          await ffmpeg.exec([
            '-i', 'full_audio.mp3',
            '-ss', startTime.toString(),
            '-t', chunkDuration.toString(),
            '-acodec', 'copy',
            outputFile
          ]);
          
          console.log(`[Split] ✓ Chunk ${i + 1}/${numChunks} criado`);
          
        const chunkData = await ffmpeg.readFile(outputFile);
          const chunkBytes = chunkData instanceof Uint8Array ? chunkData : new Uint8Array(chunkData as unknown as ArrayBuffer);
          const chunkBuffer = new Uint8Array(chunkBytes).buffer.slice(0);
          const chunkBlob = new Blob([chunkBuffer], { type: 'audio/mpeg' });
          
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
          
          setTranscriptionProgress({ 
            stage: 'transcribing', 
            progress: 50 + (i / numChunks) * 45, 
            message: `Transcrevendo parte ${i + 1}/${numChunks}...`,
            currentPart: i + 1,
            totalParts: numChunks
          });
          
          console.log(`[Transcrição] Transcrevendo chunk ${i + 1}/${numChunks}...`);
          const { data, error } = await withTimeout(
            supabase.functions.invoke('transcribe-audio-whisper', {
              body: { audioUrl: urlData.publicUrl }
            }),
            300000,
            `transcrição chunk ${i + 1}`
          );
          
          if (error) {
            console.error(`Erro no chunk ${i + 1}:`, error);
          } else if (data?.text) {
            allTranscriptions.push(data.text);
            console.log(`[Transcrição] ✓ Chunk ${i + 1} transcrito: ${data.text.length} caracteres`);
          }
          
          await ffmpeg.deleteFile(outputFile);
        }
        
        await ffmpeg.deleteFile('full_audio.mp3');
        
      } else {
        // Single file transcription
        console.log('[Transcrição] Áudio dentro do limite, transcrevendo arquivo único...');
        
        const audioBuffer = new Uint8Array(audioBytes).buffer.slice(0);
        const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

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

        console.log('[Transcrição] PASSO 5: Enviando para Whisper API...');
        setTranscriptionProgress({ stage: 'transcribing', progress: 55, message: 'Transcrevendo com Whisper API...' });

        const { data, error } = await withTimeout(
          supabase.functions.invoke('transcribe-audio-whisper', {
            body: { audioUrl: mainAudioUrl }
          }),
          300000,
          'transcrição Whisper'
        );

        if (error) {
          throw new Error(`Erro na transcrição: ${error.message}`);
        }

        if (!data?.success) {
          throw new Error(data?.error || 'Erro desconhecido na transcrição');
        }

        allTranscriptions.push(data.text);
        
        await ffmpeg.deleteFile('full_audio.mp3');
      }

      const fullText = allTranscriptions.join('\n\n');
      
      if (!fullText || fullText.trim().length === 0) {
        throw new Error('Transcrição retornou vazia. Verifique se o vídeo contém áudio audível.');
      }

      console.log('[Transcrição] ✓ Transcrição completa!');
      console.log('[Transcrição] Texto total:', fullText.length, 'caracteres');
      
      setTranscriptionProgress({ stage: 'complete', progress: 100, message: 'Transcrição completa!' });

      return {
        srtContent: '',
        text: fullText,
        audioUrl: mainAudioUrl
      };

    } catch (error) {
      console.error('[Transcrição] ✗ ERRO:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setTranscriptionProgress({
        stage: 'error',
        progress: 0,
        message: errorMessage
      });
      throw new Error(errorMessage);
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
