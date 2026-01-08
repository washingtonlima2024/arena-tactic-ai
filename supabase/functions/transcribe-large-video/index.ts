import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_WHISPER_SIZE = 20 * 1024 * 1024; // 20MB - safe limit for Whisper
const MAX_ELEVENLABS_SIZE = 25 * 1024 * 1024; // 25MB for ElevenLabs (reduced to avoid memory issues)
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024; // 5GB max - support full match videos
const CHUNK_SIZE = 15 * 1024 * 1024; // 15MB chunks - safe for edge function memory

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl, matchId, videoId } = await req.json();

    console.log('[TranscribeLarge] ========================================');
    console.log('[TranscribeLarge] Video URL:', videoUrl);
    console.log('[TranscribeLarge] Match ID:', matchId);

    // Check video size
    console.log('[TranscribeLarge] Verificando tamanho do vídeo...');
    const headResponse = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = headResponse.headers.get('content-length');
    const videoSizeBytes = contentLength ? parseInt(contentLength, 10) : 0;
    const videoSizeMB = videoSizeBytes / (1024 * 1024);
    
    console.log(`[TranscribeLarge] Tamanho: ${videoSizeMB.toFixed(1)} MB`);

    // For videos larger than 500MB, cloud transcription won't work reliably
    // The Whisper API can't decode partial video chunks - it needs proper audio files
    // FFmpeg is required to extract audio, which only works on local server
    if (videoSizeBytes > 500 * 1024 * 1024) {
      console.log(`[TranscribeLarge] Vídeo muito grande (${videoSizeMB.toFixed(0)}MB) - requer servidor local`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Vídeo de ${videoSizeMB.toFixed(0)}MB é muito grande para transcrição na nuvem. Use o servidor Python local com FFmpeg para extrair o áudio, ou forneça um arquivo SRT.`,
          videoSizeMB: videoSizeMB.toFixed(1),
          requiresLocalServer: true,
          suggestion: 'Inicie o servidor local (python server.py) ou faça upload de um arquivo SRT.'
        }),
        { 
          status: 200, // Return 200 so the frontend can handle this gracefully
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // For videos 200-500MB, warn but try
    if (videoSizeBytes > 200 * 1024 * 1024) {
      console.log(`[TranscribeLarge] Vídeo grande (${videoSizeMB.toFixed(0)}MB), tentando transcrição parcial...`);
    }

    // For small videos (≤20MB), use Whisper directly
    if (videoSizeBytes <= MAX_WHISPER_SIZE) {
      console.log('[TranscribeLarge] Usando Whisper para vídeo pequeno...');
      return await transcribeWithWhisper(videoUrl, videoSizeBytes, videoSizeMB);
    }

    // For medium videos (20-200MB), try ElevenLabs first (it can handle video files)
    console.log('[TranscribeLarge] Vídeo médio, tentando ElevenLabs Scribe...');
    
    const elevenLabsResult = await transcribeWithElevenLabs(videoUrl, videoSizeBytes, videoSizeMB);
    if (elevenLabsResult) {
      return elevenLabsResult;
    }

    // Fallback: partial Whisper (first 20MB only)
    console.log('[TranscribeLarge] ElevenLabs falhou, usando Whisper parcial (início do vídeo)...');
    return await transcribeWithWhisper(videoUrl, videoSizeBytes, videoSizeMB, true);

  } catch (error) {
    console.error('[TranscribeLarge] Erro:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido na transcrição'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function transcribeWithElevenLabs(videoUrl: string, videoSizeBytes: number, videoSizeMB: number): Promise<Response | null> {
  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  if (!ELEVENLABS_API_KEY) {
    console.log('[ElevenLabs] API key não configurada, pulando...');
    return null;
  }

  try {
    // Download video (up to 100MB for ElevenLabs)
    const bytesToDownload = Math.min(videoSizeBytes, MAX_ELEVENLABS_SIZE);
    const isPartial = videoSizeBytes > MAX_ELEVENLABS_SIZE;
    
    console.log(`[ElevenLabs] Baixando ${isPartial ? 'primeiros ' : ''}${(bytesToDownload / 1024 / 1024).toFixed(1)} MB...`);
    
    const downloadResponse = await fetch(videoUrl, {
      headers: isPartial ? { 'Range': `bytes=0-${bytesToDownload - 1}` } : {}
    });
    
    if (!downloadResponse.ok && downloadResponse.status !== 206) {
      throw new Error(`Erro ao baixar vídeo: ${downloadResponse.status}`);
    }
    
    const videoBuffer = await downloadResponse.arrayBuffer();
    console.log(`[ElevenLabs] ✓ Baixado: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

    // Send to ElevenLabs Scribe API
    console.log('[ElevenLabs] Enviando para ElevenLabs Scribe API...');
    
    const formData = new FormData();
    const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
    formData.append('file', videoBlob, 'video.mp4');
    formData.append('model_id', 'scribe_v1');
    formData.append('language_code', 'por'); // Portuguese
    formData.append('tag_audio_events', 'false');
    formData.append('diarize', 'false');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ElevenLabs] Erro:', response.status, errorText);
      return null; // Return null to try fallback
    }

    const result = await response.json();
    console.log(`[ElevenLabs] ✓ Transcrição recebida: ${result.text?.length || 0} caracteres`);

    // Convert ElevenLabs response to our format
    const text = result.text || '';
    const srtContent = wordsToSrt(result.words || []);

    const responseData: Record<string, any> = {
      success: true, 
      srtContent,
      text,
      videoSizeMB: videoSizeMB.toFixed(1),
      method: 'elevenlabs-scribe'
    };

    if (isPartial) {
      responseData.warning = `Apenas os primeiros ${(bytesToDownload / 1024 / 1024).toFixed(0)}MB do vídeo foram transcritos.`;
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ElevenLabs] Erro:', error);
    return null; // Return null to try fallback
  }
}

// NEW: Multi-chunk Whisper transcription for large videos
// Processes representative chunks distributed across the video for coverage
async function transcribeWithWhisperMultiChunk(videoUrl: string, videoSizeBytes: number, videoSizeMB: number): Promise<Response | null> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    console.log('[WhisperMulti] OPENAI_API_KEY não configurada');
    return null;
  }

  try {
    // Use smaller chunks to avoid memory issues in edge functions
    const chunkSize = CHUNK_SIZE; // 15MB from constant
    const MAX_CHUNKS = 6; // Reduced to prevent timeout and memory issues
    
    // Calculate total chunks needed
    const totalChunks = Math.ceil(videoSizeBytes / chunkSize);
    
    // For very large videos, sample distributed chunks instead of sequential
    let chunksToProcess: number[];
    if (totalChunks <= MAX_CHUNKS) {
      // Process all chunks
      chunksToProcess = Array.from({ length: totalChunks }, (_, i) => i);
    } else {
      // Sample distributed chunks: first, last, and evenly distributed middle ones
      chunksToProcess = [0]; // First chunk
      const step = Math.floor(totalChunks / (MAX_CHUNKS - 1));
      for (let i = 1; i < MAX_CHUNKS - 1; i++) {
        chunksToProcess.push(Math.min(i * step, totalChunks - 1));
      }
      chunksToProcess.push(totalChunks - 1); // Last chunk
      // Remove duplicates and sort
      chunksToProcess = [...new Set(chunksToProcess)].sort((a, b) => a - b);
    }
    
    console.log(`[WhisperMulti] ${videoSizeMB.toFixed(1)}MB = ${totalChunks} chunks totais, processando ${chunksToProcess.length} chunks: [${chunksToProcess.join(', ')}]`);

    const allTranscriptions: { text: string; srt: string; chunkIndex: number }[] = [];

    for (let i = 0; i < chunksToProcess.length; i++) {
      const chunkIndex = chunksToProcess[i];
      const startByte = chunkIndex * chunkSize;
      const endByte = Math.min((chunkIndex + 1) * chunkSize - 1, videoSizeBytes - 1);
      const chunkSizeMB = (endByte - startByte + 1) / (1024 * 1024);
      const chunkMinutes = Math.floor((chunkIndex * chunkSize) / videoSizeBytes * 90); // Estimate match minute

      console.log(`[WhisperMulti] Chunk ${i + 1}/${chunksToProcess.length} (idx ${chunkIndex}, ~${chunkMinutes}'): bytes ${startByte}-${endByte} (${chunkSizeMB.toFixed(1)}MB)...`);

      // Download chunk with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout per chunk
      
      try {
        const downloadResponse = await fetch(videoUrl, {
          headers: { 'Range': `bytes=${startByte}-${endByte}` },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!downloadResponse.ok && downloadResponse.status !== 206) {
          console.error(`[WhisperMulti] Erro ao baixar chunk ${chunkIndex}: ${downloadResponse.status}`);
          continue;
        }

        const chunkBuffer = await downloadResponse.arrayBuffer();
        console.log(`[WhisperMulti] ✓ Chunk ${chunkIndex} baixado: ${(chunkBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

        // Send to Whisper
        const formData = new FormData();
        const chunkBlob = new Blob([chunkBuffer], { type: 'video/mp4' });
        formData.append('file', chunkBlob, `chunk_${chunkIndex}.mp4`);
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt');
        formData.append('response_format', 'srt');

        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: formData,
        });

        if (!whisperResponse.ok) {
          const errorText = await whisperResponse.text();
          console.error(`[WhisperMulti] Erro Whisper chunk ${chunkIndex}:`, errorText);
          continue;
        }

        const srtContent = await whisperResponse.text();
        const plainText = srtToPlainText(srtContent);
        
        console.log(`[WhisperMulti] ✓ Chunk ${chunkIndex} transcrito: ${plainText.length} caracteres`);

        allTranscriptions.push({
          text: `[~${chunkMinutes}']\n${plainText}`,
          srt: srtContent,
          chunkIndex
        });

      } catch (fetchError) {
        clearTimeout(timeoutId);
        console.error(`[WhisperMulti] Timeout ou erro no chunk ${chunkIndex}:`, fetchError);
        continue;
      }

      // Small delay between chunks to avoid rate limiting
      if (i < chunksToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (allTranscriptions.length === 0) {
      console.error('[WhisperMulti] Nenhum chunk foi transcrito com sucesso');
      return null;
    }

    // Combine all transcriptions
    const combinedText = allTranscriptions
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map(t => t.text)
      .join('\n\n');

    const combinedSrt = allTranscriptions
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map(t => t.srt)
      .join('\n\n');

    console.log(`[WhisperMulti] ✓ Transcrição combinada: ${combinedText.length} caracteres de ${allTranscriptions.length}/${totalChunks} chunks`);

    const responseData: Record<string, any> = {
      success: true,
      srtContent: combinedSrt,
      text: combinedText,
      videoSizeMB: videoSizeMB.toFixed(1),
      method: 'whisper-multi-chunk',
      chunksProcessed: allTranscriptions.length,
      totalChunks
    };

    if (allTranscriptions.length < chunksToProcess.length) {
      responseData.warning = `Apenas ${allTranscriptions.length} de ${chunksToProcess.length} trechos do vídeo foram transcritos.`;
    }
    
    if (totalChunks > MAX_CHUNKS) {
      responseData.partialCoverage = true;
      responseData.coverageWarning = `Vídeo grande (${videoSizeMB.toFixed(0)}MB) - transcrição parcial de ${chunksToProcess.length} trechos distribuídos.`;
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[WhisperMulti] Erro:', error);
    return null;
  }
}

async function transcribeWithWhisper(videoUrl: string, videoSizeBytes: number, videoSizeMB: number, forcePartial = false): Promise<Response> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada');
  }

  // Download only up to 24MB
  const bytesToDownload = Math.min(videoSizeBytes, MAX_WHISPER_SIZE);
  const isPartial = forcePartial || videoSizeBytes > MAX_WHISPER_SIZE;
  
  console.log(`[Whisper] Baixando ${isPartial ? 'primeiros ' : ''}${(bytesToDownload / 1024 / 1024).toFixed(1)} MB...`);
  
  const downloadResponse = await fetch(videoUrl, {
    headers: isPartial ? { 'Range': `bytes=0-${bytesToDownload - 1}` } : {}
  });
  
  if (!downloadResponse.ok && downloadResponse.status !== 206) {
    throw new Error(`Erro ao baixar vídeo: ${downloadResponse.status}`);
  }
  
  const videoBuffer = await downloadResponse.arrayBuffer();
  console.log(`[Whisper] ✓ Baixado: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

  // Send to Whisper API
  console.log('[Whisper] Enviando para Whisper API...');
  
  const formData = new FormData();
  const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
  formData.append('file', videoBlob, 'video.mp4');
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt');
  formData.append('response_format', 'srt');

  const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!whisperResponse.ok) {
    const errorText = await whisperResponse.text();
    console.error('[Whisper] Erro:', errorText);
    
    if (isPartial) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Erro na transcrição. O vídeo tem ${videoSizeMB.toFixed(0)}MB. Recomendamos fazer upload de um arquivo SRT/VTT.`,
          videoSizeMB: videoSizeMB.toFixed(1),
          requiresSrtUpload: true
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    throw new Error(`Erro na API Whisper: ${errorText}`);
  }

  const srtContent = await whisperResponse.text();
  console.log(`[Whisper] ✓ Transcrição recebida: ${srtContent.length} caracteres`);
  
  // Convert SRT to plain text for analysis
  const plainText = srtToPlainText(srtContent);
  console.log(`[Whisper] ✓ Texto extraído: ${plainText.length} caracteres`);

  const responseData: Record<string, any> = {
    success: true, 
    srtContent,
    text: plainText,
    videoSizeMB: videoSizeMB.toFixed(1),
    method: isPartial ? 'whisper-partial' : 'whisper-direct'
  };

  if (isPartial) {
    responseData.warning = `Apenas os primeiros ${(bytesToDownload / 1024 / 1024).toFixed(0)}MB do vídeo foram transcritos com Whisper.`;
  }

  return new Response(
    JSON.stringify(responseData),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function wordsToSrt(words: Array<{ text: string; start: number; end: number }>): string {
  if (!words || words.length === 0) return '';
  
  const lines: string[] = [];
  let subtitleIndex = 1;
  let currentText = '';
  let currentStart = 0;
  let currentEnd = 0;
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    if (currentText === '') {
      currentStart = word.start;
    }
    
    currentText += (currentText ? ' ' : '') + word.text;
    currentEnd = word.end;
    
    // Create a new subtitle every ~5 seconds or when text is long enough
    const duration = currentEnd - currentStart;
    if (duration >= 5 || currentText.length > 80 || i === words.length - 1) {
      lines.push(String(subtitleIndex));
      lines.push(`${formatSrtTime(currentStart)} --> ${formatSrtTime(currentEnd)}`);
      lines.push(currentText);
      lines.push('');
      
      subtitleIndex++;
      currentText = '';
    }
  }
  
  return lines.join('\n');
}

function formatSrtTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.round((totalSeconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function srtToPlainText(srt: string): string {
  const lines = srt.split('\n');
  const textLines: string[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Skip subtitle numbers and timestamps
    if (/^\d+$/.test(line) || line.includes('-->') || !line) {
      i++;
      continue;
    }
    
    textLines.push(line);
    i++;
  }
  
  return textLines.join(' ').replace(/\s+/g, ' ').trim();
}
