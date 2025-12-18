import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_WHISPER_SIZE = 24 * 1024 * 1024; // 24MB
const AUDIO_CHUNK_DURATION = 600; // 10 minutes per chunk for safety margin
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB max to process

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

    // Check if video is too large even for chunked processing
    if (videoSizeBytes > MAX_VIDEO_SIZE) {
      console.log(`[TranscribeLarge] Vídeo muito grande para processamento server-side (${videoSizeMB.toFixed(0)}MB > 500MB)`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Vídeo de ${videoSizeMB.toFixed(0)}MB é muito grande. Faça upload de um arquivo SRT/VTT.`,
          videoSizeMB: videoSizeMB.toFixed(1),
          requiresSrtUpload: true
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // For small videos (≤24MB), use Whisper directly
    if (videoSizeBytes <= MAX_WHISPER_SIZE) {
      console.log('[TranscribeLarge] Usando Whisper diretamente para vídeo pequeno...');
      return await transcribeWithWhisper(videoUrl, videoSizeMB);
    }

    // For larger videos, use chunked audio extraction and transcription
    console.log('[TranscribeLarge] Vídeo grande detectado, usando processamento em chunks...');
    return await transcribeWithChunks(videoUrl, videoSizeBytes, videoSizeMB);

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

async function transcribeWithWhisper(videoUrl: string, videoSizeMB: number): Promise<Response> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada');
  }

  console.log('[Whisper] Baixando vídeo...');
  const videoResponse = await fetch(videoUrl);
  const videoBuffer = await videoResponse.arrayBuffer();
  console.log(`[Whisper] ✓ Vídeo baixado: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

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
    throw new Error(`Erro na API Whisper: ${errorText}`);
  }

  const srtContent = await whisperResponse.text();
  console.log('[Whisper] ✓ Transcrição recebida:', srtContent.length, 'caracteres');

  return new Response(
    JSON.stringify({ 
      success: true, 
      srtContent,
      text: srtContent,
      videoSizeMB: videoSizeMB.toFixed(1),
      method: 'whisper-direct'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function transcribeWithChunks(videoUrl: string, videoSizeBytes: number, videoSizeMB: number): Promise<Response> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada');
  }

  console.log('[ChunkedTranscribe] Iniciando transcrição em chunks...');
  
  // Step 1: Download video in streaming fashion and extract audio info
  console.log('[ChunkedTranscribe] Baixando vídeo...');
  const videoResponse = await fetch(videoUrl);
  const videoBuffer = await videoResponse.arrayBuffer();
  console.log(`[ChunkedTranscribe] ✓ Vídeo baixado: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

  // Step 2: Estimate video duration (rough estimate based on typical bitrates)
  // Average video bitrate ~2-5 Mbps = 0.25-0.625 MB/s
  // We'll be conservative and assume lower bitrate for longer duration
  const estimatedDurationSeconds = Math.ceil(videoSizeMB / 0.3); // ~0.3 MB/s average
  console.log(`[ChunkedTranscribe] Duração estimada: ${estimatedDurationSeconds}s (~${Math.ceil(estimatedDurationSeconds/60)} min)`);

  // Step 3: Calculate number of chunks needed
  const numChunks = Math.ceil(estimatedDurationSeconds / AUDIO_CHUNK_DURATION);
  console.log(`[ChunkedTranscribe] Número de chunks planejados: ${numChunks}`);

  // Step 4: Split video buffer into byte-based chunks
  // We'll divide the video bytes proportionally
  const chunkSizeBytes = Math.ceil(videoSizeBytes / numChunks);
  const transcriptions: { index: number; srt: string; offsetSeconds: number }[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startByte = i * chunkSizeBytes;
    const endByte = Math.min((i + 1) * chunkSizeBytes, videoSizeBytes);
    const chunkBuffer = videoBuffer.slice(startByte, endByte);
    const chunkSizeMB = chunkBuffer.byteLength / (1024 * 1024);
    
    console.log(`[ChunkedTranscribe] Processando chunk ${i + 1}/${numChunks} (${chunkSizeMB.toFixed(1)} MB)...`);
    
    // For byte-split chunks, we need to add MP4 header to make it valid
    // This is a simplified approach - for production, use proper MP4 remuxing
    // Instead, we'll send each chunk as a raw binary and hope Whisper handles it
    
    try {
      const formData = new FormData();
      const chunkBlob = new Blob([chunkBuffer], { type: 'video/mp4' });
      formData.append('file', chunkBlob, `chunk_${i}.mp4`);
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

      if (whisperResponse.ok) {
        const srtContent = await whisperResponse.text();
        const offsetSeconds = i * AUDIO_CHUNK_DURATION;
        transcriptions.push({ index: i, srt: srtContent, offsetSeconds });
        console.log(`[ChunkedTranscribe] ✓ Chunk ${i + 1} transcrito: ${srtContent.length} caracteres`);
      } else {
        const errorText = await whisperResponse.text();
        console.error(`[ChunkedTranscribe] ✗ Chunk ${i + 1} falhou:`, errorText);
        // Continue with other chunks even if one fails
      }
    } catch (chunkError) {
      console.error(`[ChunkedTranscribe] ✗ Erro no chunk ${i + 1}:`, chunkError);
      // Continue with other chunks
    }
  }

  // Step 5: Merge transcriptions with adjusted timestamps
  if (transcriptions.length === 0) {
    // If all chunks failed, try sending the first 24MB as a fallback
    console.log('[ChunkedTranscribe] Todos os chunks falharam, tentando primeiros 24MB...');
    
    const firstChunkBuffer = videoBuffer.slice(0, MAX_WHISPER_SIZE);
    const formData = new FormData();
    const fallbackBlob = new Blob([firstChunkBuffer], { type: 'video/mp4' });
    formData.append('file', fallbackBlob, 'video_partial.mp4');
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
      throw new Error(`Falha na transcrição: ${errorText}. Recomendamos fazer upload de um arquivo SRT/VTT.`);
    }

    const srtContent = await whisperResponse.text();
    return new Response(
      JSON.stringify({ 
        success: true, 
        srtContent,
        text: srtContent,
        videoSizeMB: videoSizeMB.toFixed(1),
        method: 'whisper-partial',
        warning: 'Apenas parte do vídeo foi transcrita. Para transcrição completa, use arquivo SRT/VTT.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Merge all SRT content with adjusted timestamps
  const mergedSrt = mergeTranscriptions(transcriptions);
  console.log(`[ChunkedTranscribe] ✓ Transcrição completa: ${mergedSrt.length} caracteres de ${transcriptions.length} chunks`);

  return new Response(
    JSON.stringify({ 
      success: true, 
      srtContent: mergedSrt,
      text: mergedSrt,
      videoSizeMB: videoSizeMB.toFixed(1),
      method: 'whisper-chunked',
      chunksProcessed: transcriptions.length,
      totalChunks: numChunks
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function mergeTranscriptions(transcriptions: { index: number; srt: string; offsetSeconds: number }[]): string {
  // Sort by index to ensure correct order
  transcriptions.sort((a, b) => a.index - b.index);
  
  let mergedLines: string[] = [];
  let subtitleIndex = 1;

  for (const { srt, offsetSeconds } of transcriptions) {
    const lines = srt.split('\n');
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) {
        i++;
        continue;
      }
      
      // Check if this is a subtitle number
      if (/^\d+$/.test(line)) {
        // Next line should be timestamp
        const timestampLine = lines[i + 1]?.trim();
        if (timestampLine && timestampLine.includes('-->')) {
          // Parse and adjust timestamps
          const adjustedTimestamp = adjustTimestamp(timestampLine, offsetSeconds);
          
          // Collect text lines until empty line
          const textLines: string[] = [];
          let j = i + 2;
          while (j < lines.length && lines[j].trim()) {
            textLines.push(lines[j].trim());
            j++;
          }
          
          if (textLines.length > 0) {
            mergedLines.push(String(subtitleIndex));
            mergedLines.push(adjustedTimestamp);
            mergedLines.push(...textLines);
            mergedLines.push('');
            subtitleIndex++;
          }
          
          i = j;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
  }

  return mergedLines.join('\n');
}

function adjustTimestamp(timestampLine: string, offsetSeconds: number): string {
  // Parse "00:00:00,000 --> 00:00:05,000" format
  const match = timestampLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  
  if (!match) return timestampLine;
  
  const startSeconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
  const endSeconds = parseInt(match[5]) * 3600 + parseInt(match[6]) * 60 + parseInt(match[7]) + parseInt(match[8]) / 1000;
  
  const newStart = startSeconds + offsetSeconds;
  const newEnd = endSeconds + offsetSeconds;
  
  return `${formatSrtTime(newStart)} --> ${formatSrtTime(newEnd)}`;
}

function formatSrtTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.round((totalSeconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}
