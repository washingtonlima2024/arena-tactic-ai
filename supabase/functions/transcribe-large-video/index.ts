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
      console.log('[TranscribeLarge] Usando Gemini via URL (arquivo > 24MB)...');
      return await transcribeWithGeminiUrl(videoUrl, videoSizeMB);
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

async function transcribeWithGeminiUrl(videoUrl: string, videoSizeMB: number): Promise<Response> {
  const GOOGLE_CLOUD_API_KEY = Deno.env.get('GOOGLE_CLOUD_API_KEY');
  if (!GOOGLE_CLOUD_API_KEY) {
    throw new Error('GOOGLE_CLOUD_API_KEY não configurada');
  }

  console.log('[Gemini] Usando API direta do Google com URL...');
  console.log('[Gemini] Vídeo:', videoSizeMB.toFixed(1), 'MB');

  // Use Google's Generative Language API directly with file URI
  // First, we need to upload the file to Google's File API
  console.log('[Gemini] Iniciando upload para Google File API...');
  
  // Start resumable upload
  const startUploadResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GOOGLE_CLOUD_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Type': 'video/mp4',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: {
          display_name: `match-video-${Date.now()}.mp4`
        }
      }),
    }
  );

  if (!startUploadResponse.ok) {
    const errorText = await startUploadResponse.text();
    console.error('[Gemini] Erro ao iniciar upload:', errorText);
    throw new Error(`Erro ao iniciar upload: ${errorText}`);
  }

  const uploadUrl = startUploadResponse.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    throw new Error('URL de upload não retornada pelo Google');
  }

  console.log('[Gemini] Upload URL obtida, baixando vídeo em streaming...');
  
  // Stream the video directly to Google without loading entire file in memory
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok || !videoResponse.body) {
    throw new Error(`Erro ao acessar vídeo: ${videoResponse.status}`);
  }

  // Get total size
  const totalSize = parseInt(videoResponse.headers.get('content-length') || '0', 10);
  
  // Read video in chunks and upload
  const reader = videoResponse.body.getReader();
  const chunks: Uint8Array[] = [];
  let downloadedSize = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    downloadedSize += value.length;
    
    // Log progress every 10MB
    if (downloadedSize % (10 * 1024 * 1024) < value.length) {
      console.log(`[Gemini] Download: ${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB`);
    }
  }
  
  // Combine chunks
  const videoData = new Uint8Array(downloadedSize);
  let offset = 0;
  for (const chunk of chunks) {
    videoData.set(chunk, offset);
    offset += chunk.length;
  }
  
  console.log(`[Gemini] ✓ Vídeo baixado: ${(videoData.length / 1024 / 1024).toFixed(1)} MB`);
  console.log('[Gemini] Enviando para Google...');

  // Upload the video data
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': 'video/mp4',
    },
    body: videoData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error('[Gemini] Erro no upload:', errorText);
    throw new Error(`Erro no upload do vídeo: ${errorText}`);
  }

  const fileInfo = await uploadResponse.json();
  const fileUri = fileInfo.file?.uri;
  
  if (!fileUri) {
    console.error('[Gemini] Resposta do upload:', JSON.stringify(fileInfo));
    throw new Error('URI do arquivo não retornada pelo Google');
  }

  console.log('[Gemini] ✓ Upload completo! URI:', fileUri);
  
  // Wait for file to be processed
  console.log('[Gemini] Aguardando processamento do arquivo...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Now use the file URI with Gemini
  console.log('[Gemini] Enviando para Gemini 2.0 Flash...');
  
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
                  fileUri: fileUri
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
    console.error('[Gemini] Erro na geração:', geminiResponse.status, errorText);
    
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

  // Cleanup: delete the uploaded file
  try {
    const fileName = fileUri.split('/').pop();
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${GOOGLE_CLOUD_API_KEY}`,
      { method: 'DELETE' }
    );
    console.log('[Gemini] ✓ Arquivo temporário deletado');
  } catch (e) {
    console.log('[Gemini] Aviso: não foi possível deletar arquivo temporário');
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      srtContent: transcriptionText,
      text: transcriptionText,
      videoSizeMB: videoSizeMB.toFixed(1),
      method: 'gemini-direct'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
