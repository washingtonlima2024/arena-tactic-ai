import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_FILE_SIZE = 24 * 1024 * 1024; // 24MB (Whisper limit is 25MB)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl, matchId } = await req.json();
    
    console.log('[Transcribe Fallback] ========================================');
    console.log('[Transcribe Fallback] Video URL:', videoUrl);
    console.log('[Transcribe Fallback] Match ID:', matchId);
    
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    // Check file size first with HEAD request
    console.log('[Transcribe Fallback] Verificando tamanho do arquivo...');
    const headResponse = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = headResponse.headers.get('content-length');
    const fileSizeBytes = contentLength ? parseInt(contentLength) : 0;
    const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
    
    console.log('[Transcribe Fallback] Tamanho:', fileSizeMB, 'MB');

    if (fileSizeBytes > MAX_FILE_SIZE) {
      console.log('[Transcribe Fallback] Arquivo muito grande para Whisper API');
      // Return 200 with success:false for expected validation errors
      // so the client can properly read the error message
      return new Response(
        JSON.stringify({
          success: false,
          error: `Arquivo muito grande (${fileSizeMB}MB). Máximo: 24MB. Por favor, importe um arquivo SRT manualmente.`,
          method: 'whisper-fallback'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Download the file in chunks to avoid memory spike
    console.log('[Transcribe Fallback] Baixando arquivo...');
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Erro ao baixar: ${response.status}`);
    }

    // Get filename from URL
    const urlParts = videoUrl.split('/');
    let filename = urlParts[urlParts.length - 1] || 'video.mp4';
    filename = filename.split('?')[0]; // Remove query params
    
    // Read as blob (more memory efficient than arrayBuffer for large files)
    const blob = await response.blob();
    console.log('[Transcribe Fallback] Download completo, enviando para Whisper...');

    // Create FormData for Whisper API
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    formData.append('response_format', 'verbose_json');

    // Call Whisper API
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('[Transcribe Fallback] Erro Whisper:', errorText);
      throw new Error(`Erro na API Whisper: ${whisperResponse.status}`);
    }

    const result = await whisperResponse.json();
    const transcriptionText = result.text || '';

    if (!transcriptionText || transcriptionText.trim().length === 0) {
      throw new Error('Transcrição retornou vazia. Verifique se o áudio contém fala audível.');
    }

    console.log('[Transcribe Fallback] ✓ Transcrição completa!');
    console.log('[Transcribe Fallback] Caracteres:', transcriptionText.length);
    console.log('[Transcribe Fallback] Preview:', transcriptionText.substring(0, 150));

    return new Response(
      JSON.stringify({
        success: true,
        text: transcriptionText,
        srt: '',
        method: 'whisper-fallback'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Transcribe Fallback] ✗ ERRO:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        method: 'whisper-fallback'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
