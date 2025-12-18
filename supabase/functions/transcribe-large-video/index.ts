import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_WHISPER_SIZE = 24 * 1024 * 1024; // 24MB (Whisper limit is 25MB)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl, matchId, videoId } = await req.json();

    console.log('[TranscribeLarge] ========================================');
    console.log('[TranscribeLarge] Video URL:', videoUrl);
    console.log('[TranscribeLarge] Match ID:', matchId);
    console.log('[TranscribeLarge] Video ID:', videoId);

    // Check video size
    console.log('[TranscribeLarge] Verificando tamanho do vídeo...');
    const headResponse = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = headResponse.headers.get('content-length');
    const videoSizeBytes = contentLength ? parseInt(contentLength, 10) : 0;
    const videoSizeMB = videoSizeBytes / (1024 * 1024);
    
    console.log(`[TranscribeLarge] Tamanho: ${videoSizeMB.toFixed(1)} MB`);

    // For videos larger than 24MB, ask user to use client-side processing or upload SRT
    if (videoSizeBytes > MAX_WHISPER_SIZE) {
      console.log(`[TranscribeLarge] Vídeo muito grande para server-side (${videoSizeMB.toFixed(1)}MB > 24MB)`);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Vídeo de ${videoSizeMB.toFixed(0)}MB é muito grande para transcrição server-side. ` +
                 `Aguarde o carregamento do processador no navegador (pode levar até 1 minuto) ` +
                 `ou faça upload de um arquivo SRT/VTT.`,
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
    console.log('[TranscribeLarge] Usando Whisper para vídeo pequeno...');
    return await transcribeWithWhisper(videoUrl, videoSizeMB);

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
      method: 'whisper'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
