import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      message, 
      teamName, 
      teamType, 
      matchContext,
      conversationHistory 
    } = await req.json();

    if (!message || !teamName) {
      throw new Error('message and teamName are required');
    }

    console.log(`Chatbot for ${teamName} (${teamType}) received message:`, message);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Build context from match data
    const contextInfo = matchContext ? `
CONTEXTO DA PARTIDA:
- ${matchContext.homeTeam} ${matchContext.homeScore} x ${matchContext.awayScore} ${matchContext.awayTeam}
- Eventos: ${matchContext.events?.map((e: any) => `${e.minute}': ${e.description || e.event_type}`).join(', ') || 'Nenhum'}
- Análise: ${matchContext.tacticalAnalysis || 'Não disponível'}
` : '';

    const systemPrompt = teamType === 'home' 
      ? `Você é um torcedor fanático e apaixonado do ${teamName}. Você sempre defende seu time com entusiasmo, destaca os pontos positivos e minimiza os negativos. Você tem conhecimento tático mas fala como um torcedor de arquibancada. Use gírias de futebol brasileiro. Seja animado e passional. Responda em português brasileiro.

${contextInfo}

PERSONALIDADE:
- Apaixonado e emotivo
- Sempre otimista sobre o time
- Conhece a história do clube
- Usa expressões como "meu timão", "é nóis", "vamos que vamos"
- Critica o adversário com humor
- Nunca admite que o time jogou mal, sempre encontra desculpas criativas`
      : `Você é um torcedor fanático e apaixonado do ${teamName}. Você sempre defende seu time com entusiasmo, destaca os pontos positivos e minimiza os negativos. Você tem conhecimento tático mas fala como um torcedor de arquibancada. Use gírias de futebol brasileiro. Seja animado e passional. Responda em português brasileiro.

${contextInfo}

PERSONALIDADE:
- Apaixonado e emotivo
- Sempre otimista sobre o time
- Conhece a história do clube
- Usa expressões como "meu timão", "é nóis", "vamos que vamos"
- Critica o adversário com humor
- Nunca admite que o time jogou mal, sempre encontra desculpas criativas`;

    // Build messages with conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []).map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    // Generate response using Lovable AI
    console.log('Generating chatbot response...');
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI generation failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const responseText = aiData.choices?.[0]?.message?.content;

    if (!responseText) {
      throw new Error('Failed to generate response');
    }

    console.log('Response generated, length:', responseText.length);

    // Convert response to audio using OpenAI TTS
    const voice = teamType === 'home' ? 'onyx' : 'echo';
    
    console.log('Converting to audio with voice:', voice);

    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: responseText,
        voice: voice,
        response_format: 'mp3',
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('TTS error:', ttsResponse.status, errorText);
      // Return text-only response if TTS fails
      return new Response(JSON.stringify({ 
        success: true,
        text: responseText,
        audioContent: null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert audio to base64
    const audioBuffer = await ttsResponse.arrayBuffer();
    const uint8Array = new Uint8Array(audioBuffer);
    
    const chunkSize = 8192;
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const audioContent = btoa(binaryString);

    console.log('Audio generated successfully');

    return new Response(JSON.stringify({ 
      success: true,
      text: responseText,
      audioContent,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in team-chatbot:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
