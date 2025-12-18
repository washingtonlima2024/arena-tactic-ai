import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_WHISPER_SIZE = 24 * 1024 * 1024; // 24MB (Whisper limit is 25MB)
const MAX_GEMINI_SIZE = 100 * 1024 * 1024; // 100MB - Gemini 2.5 can handle larger files

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

    // Check absolute maximum
    if (videoSizeBytes > MAX_GEMINI_SIZE) {
      console.log(`[TranscribeLarge] ❌ Vídeo muito grande (${videoSizeMB.toFixed(1)}MB > 100MB)`);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Vídeo muito grande (${videoSizeMB.toFixed(1)}MB). O limite é 100MB. Por favor, faça upload de um arquivo SRT ou VTT.`,
          videoSizeMB: videoSizeMB.toFixed(1),
          requiresSrtUpload: true
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Use Whisper for smaller files, Gemini for larger ones
    if (videoSizeBytes <= MAX_WHISPER_SIZE) {
      console.log('[TranscribeLarge] Usando Whisper (arquivo pequeno)...');
      return await transcribeWithWhisper(videoUrl, videoSizeMB);
    } else {
      console.log('[TranscribeLarge] Usando Gemini (arquivo grande)...');
      return await transcribeWithGemini(videoUrl, videoSizeMB);
    }

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

async function transcribeWithGemini(videoUrl: string, videoSizeMB: number): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY não configurada');
  }

  console.log('[Gemini] Baixando vídeo para transcrição...');
  
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Erro ao baixar vídeo: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  console.log(`[Gemini] ✓ Vídeo baixado: ${(uint8Array.length / 1024 / 1024).toFixed(1)} MB`);
  
  // Convert to base64 in chunks to avoid memory issues
  console.log('[Gemini] Convertendo para base64...');
  let base64 = '';
  const chunkSize = 32768;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length));
    base64 += btoa(String.fromCharCode(...chunk));
  }
  
  console.log('[Gemini] ✓ Base64 pronto:', (base64.length / 1024 / 1024).toFixed(1), 'MB');
  console.log('[Gemini] Enviando para Gemini 2.5 Flash...');

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
              text: `Transcreva completamente todo o áudio deste vídeo de ${videoSizeMB.toFixed(1)}MB. É uma transmissão de futebol. Retorne apenas a transcrição completa, sem comentários adicionais.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:video/mp4;base64,${base64}`
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
      throw new Error('Limite de requisições excedido. Tente novamente em alguns minutos.');
    }
    
    if (geminiResponse.status === 402) {
      throw new Error('Créditos insuficientes na Lovable AI. Adicione créditos em Settings > Workspace > Usage.');
    }
    
    throw new Error(`Erro na API Gemini: ${geminiResponse.status} - ${errorText}`);
  }

  const result = await geminiResponse.json();
  const transcriptionText = result.choices?.[0]?.message?.content || '';

  if (!transcriptionText || transcriptionText.trim().length === 0) {
    throw new Error('Transcrição retornou vazia. Verifique se o vídeo contém áudio audível.');
  }

  console.log('[Gemini] ✓ Transcrição completa!');
  console.log('[Gemini] Caracteres:', transcriptionText.length);
  console.log('[Gemini] Preview:', transcriptionText.substring(0, 200));

  return new Response(
    JSON.stringify({ 
      success: true, 
      srtContent: transcriptionText,
      text: transcriptionText,
      videoSizeMB: videoSizeMB.toFixed(1),
      method: 'gemini'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
