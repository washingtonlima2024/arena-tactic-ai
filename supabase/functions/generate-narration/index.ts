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
    const { matchId, events, homeTeam, awayTeam, homeScore, awayScore, voice } = await req.json();

    if (!matchId || !events) {
      throw new Error('matchId and events are required');
    }

    console.log(`Generating narration for match ${matchId} with ${events.length} events`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const GOOGLE_CLOUD_API_KEY = Deno.env.get('GOOGLE_CLOUD_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!GOOGLE_CLOUD_API_KEY) {
      throw new Error('GOOGLE_CLOUD_API_KEY is not configured');
    }

    // Step 1: Generate narration script using Lovable AI
    const eventsText = events.map((e: any) => 
      `${e.minute}': ${e.description || e.event_type}`
    ).join('\n');

    const scriptPrompt = `Você é um narrador esportivo brasileiro profissional. Crie uma narração emocionante e envolvente para esta partida de futebol.

PARTIDA: ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}

EVENTOS DA PARTIDA:
${eventsText}

INSTRUÇÕES:
- Use um tom vibrante e emocionante típico de narradores brasileiros
- Destaque os momentos mais importantes (gols, defesas, cartões)
- Mantenha a narração entre 200-400 palavras
- Use expressões típicas do futebol brasileiro
- Não use emojis ou formatação especial
- Escreva um texto contínuo e fluido para ser lido em voz alta`;

    console.log('Generating script with Lovable AI...');
    
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
    const narrationScript = scriptData.choices?.[0]?.message?.content;

    if (!narrationScript) {
      throw new Error('Failed to generate narration script');
    }

    console.log('Script generated successfully, length:', narrationScript.length);

    // Step 2: Convert script to audio using Google Cloud TTS
    const voiceOptions: Record<string, { name: string; ssmlGender: string }> = {
      'narrator': { name: 'pt-BR-Wavenet-B', ssmlGender: 'MALE' },
      'commentator': { name: 'pt-BR-Wavenet-C', ssmlGender: 'FEMALE' },
      'dynamic': { name: 'pt-BR-Wavenet-A', ssmlGender: 'FEMALE' },
    };
    const selectedVoice = voice || 'narrator';
    const voiceConfig = voiceOptions[selectedVoice] || voiceOptions['narrator'];

    console.log('Converting to audio with Google TTS...');

    const ttsResponse = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_CLOUD_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: narrationScript },
        voice: {
          languageCode: 'pt-BR',
          name: voiceConfig.name,
          ssmlGender: voiceConfig.ssmlGender,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.1,
          pitch: 0,
        },
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('Google TTS error:', ttsResponse.status, errorText);
      throw new Error(`TTS generation failed: ${errorText}`);
    }

    const ttsData = await ttsResponse.json();
    const audioContent = ttsData.audioContent;

    if (!audioContent) {
      throw new Error('Failed to generate audio');
    }

    console.log('Audio generated successfully');

    return new Response(JSON.stringify({ 
      success: true,
      script: narrationScript,
      audioContent,
      voice: voiceConfig.name,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-narration:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
