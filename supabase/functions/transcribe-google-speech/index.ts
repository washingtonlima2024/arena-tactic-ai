import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_WHISPER_SIZE = 24 * 1024 * 1024; // 24MB (Whisper limit is 25MB)
const MAX_GEMINI_SIZE = 200 * 1024 * 1024; // 200MB for Gemini

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl, matchId } = await req.json();
    
    console.log('[Transcribe] ========================================');
    console.log('[Transcribe] Video URL:', videoUrl);
    console.log('[Transcribe] Match ID:', matchId);
    
    // Check file size first with HEAD request
    console.log('[Transcribe] Verificando tamanho do arquivo...');
    const headResponse = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = headResponse.headers.get('content-length');
    const fileSizeBytes = contentLength ? parseInt(contentLength) : 0;
    const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
    
    console.log('[Transcribe] Tamanho:', fileSizeMB, 'MB');

    // Check absolute maximum
    if (fileSizeBytes > MAX_GEMINI_SIZE) {
      console.log('[Transcribe] Arquivo muito grande mesmo para Gemini');
      return new Response(
        JSON.stringify({
          success: false,
          error: `Arquivo muito grande (${fileSizeMB}MB). Máximo: 200MB. Por favor, importe um arquivo SRT manualmente.`,
          method: 'error'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Use Whisper for smaller files, Gemini for larger ones
    if (fileSizeBytes <= MAX_WHISPER_SIZE) {
      return await transcribeWithWhisper(videoUrl);
    } else {
      console.log('[Transcribe] Arquivo grande, usando Gemini...');
      return await transcribeWithGemini(videoUrl, fileSizeMB);
    }

  } catch (error) {
    console.error('[Transcribe] ✗ ERRO:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        method: 'error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function transcribeWithWhisper(videoUrl: string): Promise<Response> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada');
  }

  console.log('[Whisper] Baixando arquivo...');
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Erro ao baixar: ${response.status}`);
  }

  const urlParts = videoUrl.split('/');
  let filename = urlParts[urlParts.length - 1] || 'video.mp4';
  filename = filename.split('?')[0];
  
  const blob = await response.blob();
  console.log('[Whisper] Download completo, enviando para Whisper...');

  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt');
  formData.append('response_format', 'verbose_json');

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
    throw new Error(`Erro na API Whisper: ${whisperResponse.status}`);
  }

  const result = await whisperResponse.json();
  const transcriptionText = result.text || '';

  if (!transcriptionText || transcriptionText.trim().length === 0) {
    throw new Error('Transcrição retornou vazia. Verifique se o áudio contém fala audível.');
  }

  console.log('[Whisper] ✓ Transcrição completa!');
  console.log('[Whisper] Caracteres:', transcriptionText.length);

  return new Response(
    JSON.stringify({
      success: true,
      text: transcriptionText,
      srt: '',
      method: 'whisper'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function transcribeWithGemini(videoUrl: string, fileSizeMB: string): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY não configurada');
  }

  console.log('[Gemini] Baixando arquivo para transcrição...');
  
  // Download and convert to base64
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Erro ao baixar: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Convert to base64 in chunks to avoid memory issues
  let base64 = '';
  const chunkSize = 32768;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length));
    base64 += btoa(String.fromCharCode(...chunk));
  }
  
  console.log('[Gemini] Arquivo convertido, enviando para transcrição...');
  console.log('[Gemini] Base64 length:', base64.length);

  // Get content type from URL
  const isVideo = videoUrl.toLowerCase().includes('.mp4') || videoUrl.toLowerCase().includes('video');
  const mimeType = isVideo ? 'video/mp4' : 'audio/mpeg';

  const geminiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Você é um transcritor de áudio profissional especializado em transmissões esportivas de futebol em português brasileiro.

TAREFA: Transcreva COMPLETAMENTE todo o áudio/narração do arquivo.

INSTRUÇÕES:
1. Transcreva TODO o conteúdo falado, sem omitir nada
2. Mantenha a linguagem original em português brasileiro
3. Capture nomes de jogadores, times, placar e minutos do jogo quando mencionados
4. Inclua expressões do narrador como "GOOOL", "uuuh", etc.
5. Não adicione timestamps ou formatação especial
6. Retorne APENAS o texto transcrito, sem explicações ou comentários`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Transcreva completamente todo o áudio deste arquivo de ${fileSizeMB}MB. É uma transmissão de futebol. Retorne apenas a transcrição, sem comentários.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 16000,
    }),
  });

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error('[Gemini] Erro:', geminiResponse.status, errorText);
    
    if (geminiResponse.status === 429) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Limite de requisições excedido. Tente novamente em alguns minutos.',
          method: 'gemini'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (geminiResponse.status === 402) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Créditos insuficientes na Lovable AI. Adicione créditos em Settings > Workspace > Usage.',
          method: 'gemini'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    throw new Error(`Erro na API Gemini: ${geminiResponse.status}`);
  }

  const result = await geminiResponse.json();
  const transcriptionText = result.choices?.[0]?.message?.content || '';

  if (!transcriptionText || transcriptionText.trim().length === 0) {
    throw new Error('Transcrição retornou vazia. Verifique se o áudio contém fala audível.');
  }

  console.log('[Gemini] ✓ Transcrição completa!');
  console.log('[Gemini] Caracteres:', transcriptionText.length);
  console.log('[Gemini] Preview:', transcriptionText.substring(0, 200));

  return new Response(
    JSON.stringify({
      success: true,
      text: transcriptionText,
      srt: '',
      method: 'gemini'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
