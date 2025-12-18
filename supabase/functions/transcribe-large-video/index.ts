import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_WHISPER_SIZE = 24 * 1024 * 1024; // 24MB (Whisper limit is 25MB)
const SAMPLE_SIZE = 12 * 1024 * 1024; // 12MB sample for Lovable AI (smaller to stay safe)

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

    // Use Whisper for smaller files, Lovable AI for larger ones
    if (videoSizeBytes <= MAX_WHISPER_SIZE) {
      console.log('[TranscribeLarge] Usando Whisper (arquivo ≤ 24MB)...');
      return await transcribeWithWhisper(videoUrl, videoSizeMB);
    } else {
      console.log('[TranscribeLarge] Usando Lovable AI (arquivo > 24MB)...');
      return await transcribeWithLovableAI(videoUrl, videoSizeMB);
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

async function transcribeWithLovableAI(videoUrl: string, videoSizeMB: number): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY não configurada');
  }

  console.log('[LovableAI] Baixando amostra do vídeo...');
  
  // Download only a sample to avoid memory issues
  const response = await fetch(videoUrl, {
    headers: {
      'Range': `bytes=0-${SAMPLE_SIZE - 1}`
    }
  });
  
  if (!response.ok && response.status !== 206) {
    console.log('[LovableAI] Range não suportado, baixando início do vídeo...');
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const sampleSizeMB = uint8Array.length / (1024 * 1024);
  
  console.log(`[LovableAI] ✓ Amostra baixada: ${sampleSizeMB.toFixed(1)} MB`);

  // Use Deno's built-in base64 encoder for proper encoding
  console.log('[LovableAI] Convertendo para base64...');
  const base64 = base64Encode(arrayBuffer);
  
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
              text: `Transcreva completamente todo o áudio deste vídeo. É uma transmissão de futebol. O vídeo completo tem ${videoSizeMB.toFixed(0)}MB. Retorne apenas a transcrição completa, sem comentários adicionais.`
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
      throw new Error('Créditos insuficientes na Lovable AI. Adicione créditos em Settings > Workspace > Usage.');
    }
    
    throw new Error(`Erro na Lovable AI: ${lovableResponse.status} - ${errorText}`);
  }

  const result = await lovableResponse.json();
  const transcriptionText = result.choices?.[0]?.message?.content || '';

  if (!transcriptionText || transcriptionText.trim().length === 0) {
    console.error('[LovableAI] Resposta vazia:', JSON.stringify(result));
    throw new Error('Transcrição retornou vazia. Verifique se o vídeo contém áudio audível.');
  }

  console.log('[LovableAI] ✓ Transcrição completa!');
  console.log('[LovableAI] Caracteres:', transcriptionText.length);
  console.log('[LovableAI] Preview:', transcriptionText.substring(0, 200));

  return new Response(
    JSON.stringify({ 
      success: true, 
      srtContent: transcriptionText,
      text: transcriptionText,
      videoSizeMB: videoSizeMB.toFixed(1),
      method: 'lovable-ai',
      note: `Transcrição baseada em amostra de ${sampleSizeMB.toFixed(1)}MB do vídeo`
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
