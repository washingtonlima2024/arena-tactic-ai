import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, events, homeTeam, awayTeam, homeScore, awayScore, podcastType, tacticalAnalysis } = await req.json();

    if (!matchId || !events) {
      throw new Error('matchId and events are required');
    }

    console.log(`Generating ${podcastType} podcast for match ${matchId}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Step 1: Generate podcast script based on type
    const eventsText = events.map((e: any) => 
      `${e.minute}': ${e.description || e.event_type}`
    ).join('\n');

    let scriptPrompt = '';
    
    if (podcastType === 'tactical') {
      scriptPrompt = `Você é um analista tático de futebol profissional apresentando um podcast de análise. Crie um roteiro de podcast analítico e detalhado.

PARTIDA: ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}

EVENTOS DA PARTIDA:
${eventsText}

${tacticalAnalysis ? `ANÁLISE TÁTICA PRÉVIA:\n${JSON.stringify(tacticalAnalysis, null, 2)}` : ''}

INSTRUÇÕES:
- Comece com uma introdução ao podcast
- Analise a formação e estratégia de cada time
- Discuta os pontos fortes e fracos de cada equipe
- Destaque jogadas táticas importantes
- Conclua com um resumo da análise
- Use linguagem técnica mas acessível
- Mantenha entre 400-600 palavras
- Escreva em formato de monólogo para ser lido em voz alta`;
    } else if (podcastType === 'summary') {
      scriptPrompt = `Você é um apresentador de podcast esportivo brasileiro. Crie um resumo envolvente da partida.

PARTIDA: ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}

EVENTOS DA PARTIDA:
${eventsText}

INSTRUÇÕES:
- Comece com uma chamada empolgante
- Narre os principais momentos cronologicamente
- Destaque gols, cartões e jogadas importantes
- Mencione estatísticas relevantes
- Conclua com o impacto do resultado
- Use tom animado e envolvente
- Mantenha entre 300-500 palavras
- Escreva para ser lido como podcast`;
    } else if (podcastType === 'debate') {
      scriptPrompt = `Você é um roteirista de podcast esportivo. Crie um debate simulado entre dois comentaristas, um torcedor de cada time.

PARTIDA: ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}

EVENTOS DA PARTIDA:
${eventsText}

INSTRUÇÕES:
- Apresentador: Introduz o debate brevemente
- Torcedor ${homeTeam}: Defende seu time, destaca pontos positivos
- Torcedor ${awayTeam}: Defende seu time, responde aos argumentos
- Intercale as falas de forma natural
- Cada um deve ter 2-3 participações
- Inclua rivalidade saudável e bom humor
- Conclua com o apresentador resumindo
- Mantenha entre 400-600 palavras
- Marque as falas: [APRESENTADOR], [TORCEDOR_${homeTeam.toUpperCase().replace(/\s/g, '')}], [TORCEDOR_${awayTeam.toUpperCase().replace(/\s/g, '')}]`;
    }

    console.log('Generating podcast script with Lovable AI...');
    
    const scriptResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: scriptPrompt }
        ],
      }),
    });

    if (!scriptResponse.ok) {
      const errorText = await scriptResponse.text();
      console.error('Lovable AI error:', scriptResponse.status, errorText);
      
      if (scriptResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (scriptResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI script generation failed: ${errorText}`);
    }

    const scriptData = await scriptResponse.json();
    const podcastScript = scriptData.choices?.[0]?.message?.content;

    if (!podcastScript) {
      throw new Error('Failed to generate podcast script');
    }

    console.log('Podcast script generated, length:', podcastScript.length);

    // Step 2: Convert script to audio using OpenAI TTS
    // Select voice based on podcast type
    const voiceMap: Record<string, string> = {
      'tactical': 'onyx',    // Deep, analytical voice
      'summary': 'echo',     // Energetic voice
      'debate': 'nova',      // Clear, versatile voice
    };
    const voice = voiceMap[podcastType] || 'onyx';

    console.log('Converting to audio with OpenAI TTS, voice:', voice);

    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: podcastScript,
        voice: voice,
        response_format: 'mp3',
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('OpenAI TTS error:', ttsResponse.status, errorText);
      throw new Error(`TTS generation failed: ${errorText}`);
    }

    // Convert audio buffer to base64 in chunks to avoid stack overflow
    const audioBuffer = await ttsResponse.arrayBuffer();
    const uint8Array = new Uint8Array(audioBuffer);
    
    const chunkSize = 8192;
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const audioContent = btoa(binaryString);

    console.log('Podcast audio generated successfully');

    return new Response(JSON.stringify({ 
      success: true,
      script: podcastScript,
      audioContent,
      podcastType,
      voice,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-podcast:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
