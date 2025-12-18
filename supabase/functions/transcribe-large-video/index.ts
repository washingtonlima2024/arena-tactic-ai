import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

    // Use Whisper for smaller files, Gemini for larger ones
    if (videoSizeBytes <= MAX_WHISPER_SIZE) {
      console.log('[TranscribeLarge] Usando Whisper (arquivo ≤ 24MB)...');
      return await transcribeWithWhisper(videoUrl, videoSizeMB);
    } else {
      console.log('[TranscribeLarge] Usando Gemini com URL pública (arquivo > 24MB)...');
      return await transcribeWithGeminiPublicUrl(videoUrl, videoSizeMB);
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

async function transcribeWithGeminiPublicUrl(videoUrl: string, videoSizeMB: number): Promise<Response> {
  const GOOGLE_CLOUD_API_KEY = Deno.env.get('GOOGLE_CLOUD_API_KEY');
  if (!GOOGLE_CLOUD_API_KEY) {
    throw new Error('GOOGLE_CLOUD_API_KEY não configurada');
  }

  console.log('[Gemini] Usando URL pública diretamente (sem download)...');
  console.log('[Gemini] URL:', videoUrl);
  console.log('[Gemini] Tamanho:', videoSizeMB.toFixed(1), 'MB');

  // Use Gemini with video URL directly - no download needed
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_CLOUD_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                fileData: {
                  mimeType: 'video/mp4',
                  fileUri: videoUrl
                }
              },
              {
                text: `Você é um transcritor de áudio profissional especializado em transmissões esportivas de futebol em português brasileiro.

TAREFA: Transcreva COMPLETAMENTE todo o áudio/narração deste vídeo de ${videoSizeMB.toFixed(1)}MB.

INSTRUÇÕES:
1. Transcreva TODO o conteúdo falado, sem omitir nada
2. Mantenha a linguagem original em português brasileiro
3. Capture nomes de jogadores, times, placar e minutos do jogo quando mencionados
4. Inclua expressões do narrador como "GOOOL", "uuuh", etc.
5. Não adicione timestamps ou formatação especial
6. Retorne APENAS o texto transcrito, sem explicações ou comentários

IMPORTANTE: Retorne apenas a transcrição completa do áudio, nada mais.`
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 16000,
          temperature: 0.1
        }
      }),
    }
  );

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error('[Gemini] Erro:', geminiResponse.status, errorText);
    
    // Check if it's a URL access error - need to use file upload instead
    if (errorText.includes('INVALID_ARGUMENT') && errorText.includes('fileUri')) {
      console.log('[Gemini] URL pública não suportada, tentando com Lovable AI...');
      return await transcribeWithLovableAI(videoUrl, videoSizeMB);
    }
    
    if (geminiResponse.status === 429) {
      throw new Error('Limite de requisições excedido. Tente novamente em alguns minutos.');
    }
    
    throw new Error(`Erro na API Gemini: ${geminiResponse.status} - ${errorText}`);
  }

  const result = await geminiResponse.json();
  const transcriptionText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!transcriptionText || transcriptionText.trim().length === 0) {
    console.error('[Gemini] Resposta vazia:', JSON.stringify(result));
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
      method: 'gemini-url'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Fallback: Use Lovable AI gateway which doesn't require file upload for smaller segments
async function transcribeWithLovableAI(videoUrl: string, videoSizeMB: number): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY não configurada');
  }

  console.log('[LovableAI] Usando Lovable AI gateway...');

  // For very large files, we need to tell user to use SRT
  if (videoSizeMB > 100) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Vídeo muito grande (${videoSizeMB.toFixed(1)}MB). Por favor, faça upload de um arquivo SRT ou VTT.`,
        requiresSrtUpload: true
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  // Download only first 20MB for transcription sample
  console.log('[LovableAI] Baixando amostra do vídeo (primeiros 20MB)...');
  
  const response = await fetch(videoUrl, {
    headers: {
      'Range': 'bytes=0-20971520' // First 20MB
    }
  });
  
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const sampleSizeMB = uint8Array.length / (1024 * 1024);
  
  console.log(`[LovableAI] ✓ Amostra baixada: ${sampleSizeMB.toFixed(1)} MB`);

  // Convert to base64
  let base64 = '';
  const chunkSize = 32768;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length));
    base64 += btoa(String.fromCharCode(...chunk));
  }

  console.log('[LovableAI] ✓ Base64 pronto:', (base64.length / 1024 / 1024).toFixed(1), 'MB');
  console.log('[LovableAI] Enviando para Gemini via Lovable AI...');

  const lovableResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              text: `Transcreva completamente todo o áudio deste vídeo. É uma transmissão de futebol de aproximadamente ${videoSizeMB.toFixed(0)} minutos. Esta é uma amostra dos primeiros ${sampleSizeMB.toFixed(1)}MB. Retorne apenas a transcrição completa, sem comentários adicionais.`
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

  if (!lovableResponse.ok) {
    const errorText = await lovableResponse.text();
    console.error('[LovableAI] Erro:', lovableResponse.status, errorText);
    
    if (lovableResponse.status === 429) {
      throw new Error('Limite de requisições excedido. Tente novamente em alguns minutos.');
    }
    
    if (lovableResponse.status === 402) {
      throw new Error('Créditos insuficientes na Lovable AI.');
    }
    
    throw new Error(`Erro na Lovable AI: ${lovableResponse.status}`);
  }

  const result = await lovableResponse.json();
  const transcriptionText = result.choices?.[0]?.message?.content || '';

  if (!transcriptionText || transcriptionText.trim().length === 0) {
    throw new Error('Transcrição retornou vazia. Verifique se o vídeo contém áudio audível.');
  }

  console.log('[LovableAI] ✓ Transcrição completa!');
  console.log('[LovableAI] Caracteres:', transcriptionText.length);

  return new Response(
    JSON.stringify({ 
      success: true, 
      srtContent: transcriptionText,
      text: transcriptionText,
      videoSizeMB: videoSizeMB.toFixed(1),
      method: 'lovable-ai',
      note: 'Transcrição baseada em amostra de 20MB do vídeo'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
