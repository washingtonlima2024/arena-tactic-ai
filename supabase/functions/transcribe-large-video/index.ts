import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tamanho máximo por parte (20MB para ter margem com Whisper que aceita 25MB)
const MAX_CHUNK_SIZE = 20 * 1024 * 1024;

// Função para transcrever um chunk de áudio
async function transcribeChunk(
  audioData: ArrayBuffer,
  chunkIndex: number,
  openaiKey: string
): Promise<string> {
  console.log(`[Chunk ${chunkIndex}] Transcrevendo ${(audioData.byteLength / (1024 * 1024)).toFixed(2)}MB...`);
  
  const blob = new Blob([audioData], { type: 'audio/mpeg' });
  const formData = new FormData();
  formData.append('file', blob, `chunk_${chunkIndex}.mp3`);
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt');
  formData.append('response_format', 'text');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Chunk ${chunkIndex}] Erro:`, errorText);
    throw new Error(`Whisper error: ${errorText}`);
  }

  const text = await response.text();
  console.log(`[Chunk ${chunkIndex}] ✓ Transcrito: ${text.length} caracteres`);
  return text;
}

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

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Verificar tamanho do vídeo
    console.log('[TranscribeLarge] Verificando tamanho do vídeo...');
    const headResponse = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = headResponse.headers.get('content-length');
    const videoSizeMB = contentLength ? parseInt(contentLength) / (1024 * 1024) : 0;
    console.log('[TranscribeLarge] Tamanho:', videoSizeMB.toFixed(1), 'MB');

    // 2. Se o vídeo for pequeno, enviar direto para Whisper
    if (videoSizeMB <= 25) {
      console.log('[TranscribeLarge] Vídeo pequeno - enviando direto para Whisper');
      
      const videoResponse = await fetch(videoUrl);
      const videoBuffer = await videoResponse.arrayBuffer();
      const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
      
      const formData = new FormData();
      formData.append('file', videoBlob, 'video.mp4');
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt');
      formData.append('response_format', 'text');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: formData,
      });

      if (!whisperResponse.ok) {
        const error = await whisperResponse.text();
        throw new Error(`Whisper error: ${error}`);
      }

      const text = await whisperResponse.text();
      console.log('[TranscribeLarge] ✓ Transcrição direta completa:', text.length, 'chars');
      
      return new Response(JSON.stringify({ 
        success: true, 
        text,
        method: 'direct',
        parts: 1
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Para vídeos grandes, baixar e processar em partes
    console.log('[TranscribeLarge] Vídeo grande - processando em partes...');
    
    // Estimar duração baseado no tamanho (5MB por minuto aproximadamente)
    const estimatedMinutes = videoSizeMB / 5;
    const partDurationMinutes = 10; // 10 minutos por parte
    const numParts = Math.ceil(estimatedMinutes / partDurationMinutes);
    
    console.log(`[TranscribeLarge] Estimativa: ${estimatedMinutes.toFixed(0)} min, ${numParts} partes`);

    // Baixar vídeo completo
    console.log('[TranscribeLarge] Baixando vídeo...');
    const videoResponse = await fetch(videoUrl);
    const videoBuffer = await videoResponse.arrayBuffer();
    console.log('[TranscribeLarge] ✓ Vídeo baixado:', (videoBuffer.byteLength / (1024 * 1024)).toFixed(1), 'MB');

    // Dividir o buffer em partes proporcionais
    const partSize = Math.ceil(videoBuffer.byteLength / numParts);
    const transcriptions: string[] = [];

    for (let i = 0; i < numParts; i++) {
      const startByte = i * partSize;
      const endByte = Math.min((i + 1) * partSize, videoBuffer.byteLength);
      const partBuffer = videoBuffer.slice(startByte, endByte);
      
      const startMin = Math.floor((i * partDurationMinutes));
      const endMin = Math.floor(Math.min((i + 1) * partDurationMinutes, estimatedMinutes));
      
      console.log(`[TranscribeLarge] Parte ${i + 1}/${numParts} (${startMin}'-${endMin}'): ${(partBuffer.byteLength / (1024 * 1024)).toFixed(1)}MB`);

      // Criar blob da parte e enviar para Whisper
      const partBlob = new Blob([partBuffer], { type: 'video/mp4' });
      
      // Verificar se a parte não é muito grande para Whisper
      if (partBlob.size > 25 * 1024 * 1024) {
        console.log(`[TranscribeLarge] Parte ${i + 1} muito grande, pulando...`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', partBlob, `part_${i}.mp4`);
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt');
        formData.append('response_format', 'text');

        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
          body: formData,
        });

        if (whisperResponse.ok) {
          const text = await whisperResponse.text();
          if (text && text.trim()) {
            transcriptions.push(`[${startMin}'-${endMin}']\n${text}`);
            console.log(`[TranscribeLarge] ✓ Parte ${i + 1} transcrita: ${text.length} chars`);
          }
        } else {
          const error = await whisperResponse.text();
          console.error(`[TranscribeLarge] Parte ${i + 1} falhou:`, error);
        }
      } catch (partError) {
        console.error(`[TranscribeLarge] Erro na parte ${i + 1}:`, partError);
      }
    }

    // 4. Combinar transcrições
    const fullText = transcriptions.join('\n\n');
    
    if (!fullText || fullText.trim().length === 0) {
      throw new Error('Nenhuma parte foi transcrita com sucesso');
    }

    console.log('[TranscribeLarge] ✓ Transcrição completa:', fullText.length, 'chars,', numParts, 'partes');

    return new Response(JSON.stringify({ 
      success: true,
      text: fullText,
      method: 'chunked',
      parts: transcriptions.length,
      totalParts: numParts
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[TranscribeLarge] ERRO:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
