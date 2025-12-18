import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_WHISPER_SIZE = 24 * 1024 * 1024; // 24MB - Whisper limit is 25MB
const MAX_ELEVENLABS_SIZE = 100 * 1024 * 1024; // 100MB for ElevenLabs
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB max

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

    // Reject videos that are too large
    if (videoSizeBytes > MAX_VIDEO_SIZE) {
      console.log(`[TranscribeLarge] Vídeo muito grande (${videoSizeMB.toFixed(0)}MB > 200MB)`);
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
      console.log('[TranscribeLarge] Usando Whisper para vídeo pequeno...');
      return await transcribeWithWhisper(videoUrl, videoSizeBytes, videoSizeMB);
    }

    // For larger videos, try ElevenLabs first, then fall back to partial Whisper
    console.log('[TranscribeLarge] Vídeo grande, tentando ElevenLabs Scribe...');
    
    const elevenLabsResult = await transcribeWithElevenLabs(videoUrl, videoSizeBytes, videoSizeMB);
    if (elevenLabsResult) {
      return elevenLabsResult;
    }

    // Fallback to partial Whisper transcription
    console.log('[TranscribeLarge] ElevenLabs falhou, usando Whisper parcial...');
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
