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

    // 3. Para vídeos grandes, enviar direto para Whisper em partes menores
    // O Whisper aceita até 25MB, então dividimos em partes de ~20MB
    console.log('[TranscribeLarge] Vídeo grande - processando em partes...');
    
    // Baixar vídeo completo
    console.log('[TranscribeLarge] Baixando vídeo...');
    const videoResponse = await fetch(videoUrl);
    const videoBuffer = await videoResponse.arrayBuffer();
    console.log('[TranscribeLarge] ✓ Vídeo baixado:', (videoBuffer.byteLength / (1024 * 1024)).toFixed(1), 'MB');

    // Calcular número de partes baseado no tamanho (max 20MB por parte)
    const MAX_PART_SIZE = 20 * 1024 * 1024; // 20MB
    const numParts = Math.ceil(videoBuffer.byteLength / MAX_PART_SIZE);
    const partSize = Math.ceil(videoBuffer.byteLength / numParts);
    
    console.log(`[TranscribeLarge] Dividindo em ${numParts} partes de ~${(partSize / (1024 * 1024)).toFixed(1)}MB`);

    const transcriptions: string[] = [];

    for (let i = 0; i < numParts; i++) {
      const startByte = i * partSize;
      const endByte = Math.min((i + 1) * partSize, videoBuffer.byteLength);
      const partBuffer = videoBuffer.slice(startByte, endByte);
      const partSizeMB = partBuffer.byteLength / (1024 * 1024);
      
      console.log(`[TranscribeLarge] Parte ${i + 1}/${numParts}: ${partSizeMB.toFixed(1)}MB`);

      // Verificar se a parte não é muito grande para Whisper
      if (partSizeMB > 25) {
        console.log(`[TranscribeLarge] Parte ${i + 1} muito grande (${partSizeMB.toFixed(1)}MB), subdividindo...`);
        // Subdividir esta parte
        const subParts = Math.ceil(partBuffer.byteLength / MAX_PART_SIZE);
        const subPartSize = Math.ceil(partBuffer.byteLength / subParts);
        
        for (let j = 0; j < subParts; j++) {
          const subStart = j * subPartSize;
          const subEnd = Math.min((j + 1) * subPartSize, partBuffer.byteLength);
          const subBuffer = partBuffer.slice(subStart, subEnd);
          
          try {
            const formData = new FormData();
            const subBlob = new Blob([subBuffer], { type: 'video/mp4' });
            formData.append('file', subBlob, `part_${i}_${j}.mp4`);
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
                transcriptions.push(text);
                console.log(`[TranscribeLarge] ✓ Subparte ${i+1}.${j+1} transcrita: ${text.length} chars`);
              }
            } else {
              const error = await whisperResponse.text();
              console.error(`[TranscribeLarge] Subparte ${i+1}.${j+1} falhou:`, error);
            }
          } catch (subError) {
            console.error(`[TranscribeLarge] Erro na subparte ${i+1}.${j+1}:`, subError);
          }
        }
        continue;
      }

      try {
        const formData = new FormData();
        const partBlob = new Blob([partBuffer], { type: 'video/mp4' });
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
            transcriptions.push(text);
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
