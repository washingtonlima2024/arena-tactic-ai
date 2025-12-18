import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl, matchId, videoId } = await req.json();
    
    console.log('[Google Speech] ========================================');
    console.log('[Google Speech] Iniciando transcrição');
    console.log('[Google Speech] Video URL:', videoUrl);
    console.log('[Google Speech] Match ID:', matchId);
    
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_CLOUD_API_KEY não configurada');
    }

    // Para URLs de embed, tentar extrair URL direta
    let audioSourceUrl = videoUrl;
    
    if (videoUrl.includes('/embed/')) {
      console.log('[Google Speech] Detectada URL de embed, tentando extrair URL direta...');
      
      // Tentar padrões comuns de conversão embed -> direto
      const embedPatterns = [
        { pattern: /\/embed\/([^?]+)/, replace: '/video/$1' },
        { pattern: /\/embed\/([^?]+)/, replace: '/download/$1' },
        { pattern: /\/embed\/([^?]+)/, replace: '/api/v1/video/$1' },
      ];
      
      for (const { pattern, replace } of embedPatterns) {
        const match = videoUrl.match(pattern);
        if (match) {
          const testUrl = videoUrl.replace(pattern, replace);
          try {
            const testResponse = await fetch(testUrl, { method: 'HEAD' });
            if (testResponse.ok) {
              audioSourceUrl = testUrl;
              console.log('[Google Speech] ✓ URL direta encontrada:', testUrl);
              break;
            }
          } catch {
            // Continue tentando outros padrões
          }
        }
      }
    }

    // Baixar o arquivo de áudio/vídeo
    console.log('[Google Speech] Baixando arquivo de:', audioSourceUrl);
    
    const response = await fetch(audioSourceUrl);
    if (!response.ok) {
      throw new Error(`Erro ao baixar arquivo: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const fileSizeMB = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) : 'desconhecido';
    console.log('[Google Speech] Tamanho do arquivo:', fileSizeMB, 'MB');

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
    
    console.log('[Google Speech] Base64 length:', audioBase64.length);

    // Chamar Google Cloud Speech-to-Text API
    // Usando modelo de reconhecimento longo para arquivos maiores
    console.log('[Google Speech] Enviando para Google Speech-to-Text API...');

    const speechRequest = {
      config: {
        encoding: 'MP3',
        sampleRateHertz: 16000,
        languageCode: 'pt-BR',
        enableAutomaticPunctuation: true,
        model: 'default',
        useEnhanced: true,
      },
      audio: {
        content: audioBase64
      }
    };

    // Para arquivos pequenos (< 1 minuto), usar reconhecimento síncrono
    // Para arquivos maiores, precisaria usar assíncrono (longrunningrecognize)
    const isLongAudio = audioBuffer.byteLength > 10 * 1024 * 1024; // > 10MB

    let transcriptionText = '';

    if (isLongAudio) {
      console.log('[Google Speech] Arquivo grande, usando reconhecimento assíncrono...');
      
      // Iniciar reconhecimento de longa duração
      const longResponse = await fetch(
        `https://speech.googleapis.com/v1/speech:longrunningrecognize?key=${GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(speechRequest)
        }
      );

      if (!longResponse.ok) {
        const errorText = await longResponse.text();
        console.error('[Google Speech] Erro na API:', errorText);
        throw new Error(`Erro na API Google Speech: ${errorText}`);
      }

      const operationResult = await longResponse.json();
      console.log('[Google Speech] Operação iniciada:', operationResult.name);

      // Polling para verificar conclusão
      let operationComplete = false;
      let pollCount = 0;
      const maxPolls = 60; // 5 minutos no máximo (5s por poll)

      while (!operationComplete && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos
        pollCount++;

        const statusResponse = await fetch(
          `https://speech.googleapis.com/v1/operations/${operationResult.name}?key=${GOOGLE_API_KEY}`
        );
        const statusResult = await statusResponse.json();

        console.log(`[Google Speech] Poll ${pollCount}: done=${statusResult.done}`);

        if (statusResult.done) {
          operationComplete = true;
          if (statusResult.response?.results) {
            transcriptionText = statusResult.response.results
              .map((r: any) => r.alternatives?.[0]?.transcript || '')
              .filter(Boolean)
              .join(' ');
          }
        }
      }

      if (!operationComplete) {
        throw new Error('Timeout aguardando conclusão da transcrição');
      }

    } else {
      console.log('[Google Speech] Arquivo pequeno, usando reconhecimento síncrono...');
      
      const syncResponse = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(speechRequest)
        }
      );

      if (!syncResponse.ok) {
        const errorText = await syncResponse.text();
        console.error('[Google Speech] Erro na API:', errorText);
        throw new Error(`Erro na API Google Speech: ${errorText}`);
      }

      const result = await syncResponse.json();
      console.log('[Google Speech] Resultado:', JSON.stringify(result).substring(0, 500));

      if (result.results) {
        transcriptionText = result.results
          .map((r: any) => r.alternatives?.[0]?.transcript || '')
          .filter(Boolean)
          .join(' ');
      }
    }

    if (!transcriptionText || transcriptionText.trim().length === 0) {
      throw new Error('Transcrição retornou vazia. Verifique se o áudio contém fala audível.');
    }

    console.log('[Google Speech] ✓ Transcrição completa!');
    console.log('[Google Speech] Texto:', transcriptionText.length, 'caracteres');
    console.log('[Google Speech] Preview:', transcriptionText.substring(0, 200));
    console.log('[Google Speech] ========================================');

    return new Response(
      JSON.stringify({
        success: true,
        text: transcriptionText,
        srt: '', // Google Speech não gera SRT diretamente
        method: 'google-speech'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Google Speech] ✗ ERRO:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        method: 'google-speech'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
