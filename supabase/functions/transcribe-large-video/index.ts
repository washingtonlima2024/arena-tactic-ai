import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_WHISPER_SIZE = 24 * 1024 * 1024; // 24MB - Whisper limit is 25MB
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

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

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

    // Download only the first 24MB using Range header
    const bytesToDownload = Math.min(videoSizeBytes, MAX_WHISPER_SIZE);
    const isPartial = videoSizeBytes > MAX_WHISPER_SIZE;
    
    console.log(`[TranscribeLarge] Baixando ${isPartial ? 'primeiros ' : ''}${(bytesToDownload / 1024 / 1024).toFixed(1)} MB...`);
    
    const downloadResponse = await fetch(videoUrl, {
      headers: isPartial ? { 'Range': `bytes=0-${bytesToDownload - 1}` } : {}
    });
    
    if (!downloadResponse.ok && downloadResponse.status !== 206) {
      throw new Error(`Erro ao baixar vídeo: ${downloadResponse.status}`);
    }
    
    const videoBuffer = await downloadResponse.arrayBuffer();
    console.log(`[TranscribeLarge] ✓ Baixado: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

    // Send to Whisper API
    console.log('[TranscribeLarge] Enviando para Whisper API...');
    
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
      console.error('[TranscribeLarge] Erro Whisper:', errorText);
      
      // If partial download didn't work, suggest SRT upload
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
    console.log(`[TranscribeLarge] ✓ Transcrição recebida: ${srtContent.length} caracteres`);
    
    // Convert SRT to plain text for analysis
    const plainText = srtToPlainText(srtContent);
    console.log(`[TranscribeLarge] ✓ Texto extraído: ${plainText.length} caracteres`);

    const responseData: Record<string, any> = {
      success: true, 
      srtContent,
      text: plainText,
      videoSizeMB: videoSizeMB.toFixed(1),
      method: isPartial ? 'whisper-partial' : 'whisper-direct'
    };

    if (isPartial) {
      responseData.warning = `Apenas os primeiros ${(bytesToDownload / 1024 / 1024).toFixed(0)}MB do vídeo foram transcritos.`;
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

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
    
    // This is text content
    textLines.push(line);
    i++;
  }
  
  return textLines.join(' ').replace(/\s+/g, ' ').trim();
}
