import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MatchEvent {
  minute: number;
  second: number;
  event_type: string;
  description: string;
  team: 'home' | 'away';
  isOwnGoal?: boolean;
}

interface AnalysisResult {
  events: MatchEvent[];
  homeScore: number;
  awayScore: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, transcription, homeTeam, awayTeam, gameStartMinute = 0, gameEndMinute = 45, halfType } = await req.json();
    
    // Determine half type from parameters or gameStartMinute
    const matchHalf = halfType || (gameStartMinute >= 45 ? 'second' : 'first');

    if (!matchId) {
      throw new Error('matchId is required');
    }

    if (!transcription || transcription.trim().length < 50) {
      throw new Error('transcription is required and must be at least 50 characters');
    }

    console.log('=== ANÁLISE DE PARTIDA ===');
    console.log('Match ID:', matchId);
    console.log('Times:', homeTeam, 'vs', awayTeam);
    console.log('Tempo de jogo:', gameStartMinute, '-', gameEndMinute);
    console.log('Período:', matchHalf === 'first' ? '1º Tempo' : '2º Tempo');
    console.log('Transcrição:', transcription.length, 'caracteres');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Você é um analista de futebol especializado em identificar eventos em narrações.
Analise a transcrição e extraia TODOS os eventos mencionados pelo narrador.

REGRAS:
1. Identifique TODOS os gols mencionados na narração
2. Para gols contra (own goals), marque isOwnGoal: true
3. Extraia o minuto aproximado do jogo baseado no contexto
4. Os minutos devem estar entre ${gameStartMinute} e ${gameEndMinute}
5. Use descrições curtas em português (máximo 60 caracteres)
6. Identifique qual time fez cada evento: "home" para ${homeTeam} ou "away" para ${awayTeam}

TIPOS DE EVENTOS (use exatamente):
- goal, shot, save, foul, yellow_card, red_card, corner, offside, substitution, chance, penalty`;

    const userPrompt = `Times: ${homeTeam} (casa) vs ${awayTeam} (visitante)
Período: ${gameStartMinute}' - ${gameEndMinute}'

TRANSCRIÇÃO:
${transcription}

Extraia todos os eventos e calcule o placar final.`;

    console.log('Chamando IA com tool calling...');

    // Use tool calling for structured output
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_match_events",
              description: "Extrair eventos da partida a partir da transcrição da narração",
              parameters: {
                type: "object",
                properties: {
                  events: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        minute: { type: "number", description: "Minuto do evento no jogo" },
                        second: { type: "number", description: "Segundo do evento (0-59)" },
                        event_type: { 
                          type: "string", 
                          enum: ["goal", "shot", "save", "foul", "yellow_card", "red_card", "corner", "offside", "substitution", "chance", "penalty"],
                          description: "Tipo do evento"
                        },
                        description: { type: "string", description: "Descrição curta em português (max 60 chars)" },
                        team: { type: "string", enum: ["home", "away"], description: "Time que fez o evento" },
                        isOwnGoal: { type: "boolean", description: "Se é gol contra" }
                      },
                      required: ["minute", "event_type", "description", "team"],
                      additionalProperties: false
                    }
                  },
                  homeScore: { type: "number", description: "Placar final do time da casa" },
                  awayScore: { type: "number", description: "Placar final do time visitante" }
                },
                required: ["events", "homeScore", "awayScore"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_match_events" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Tente novamente em alguns segundos.');
      }
      if (aiResponse.status === 402) {
        throw new Error('Créditos insuficientes. Adicione créditos ao workspace.');
      }
      throw new Error(`AI analysis failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    // Extract structured data from tool call
    let analysisResult: AnalysisResult;
    
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.function?.arguments) {
      try {
        analysisResult = JSON.parse(toolCall.function.arguments);
        console.log('Tool call parsed successfully');
      } catch (parseError) {
        console.error('Tool call parse error:', parseError);
        console.error('Raw arguments:', toolCall.function.arguments);
        throw new Error('Failed to parse tool call arguments');
      }
    } else {
      // Fallback: try to extract from content if tool call not used
      const content = aiData.choices?.[0]?.message?.content || '';
      console.log('No tool call, trying content parse. Content length:', content.length);
      
      try {
        // Remove markdown code blocks if present
        let jsonStr = content;
        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1];
        }
        
        // Try to find JSON object
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }
        
        analysisResult = JSON.parse(jsonMatch[0]);
      } catch (fallbackError) {
        console.error('Fallback parse error:', fallbackError);
        console.error('Content preview:', content.substring(0, 500));
        throw new Error('Failed to parse AI response');
      }
    }

    console.log('Eventos detectados:', analysisResult.events?.length || 0);
    console.log('Placar:', analysisResult.homeScore, 'x', analysisResult.awayScore);

    // Insert events into database
    const eventsToInsert = (analysisResult.events || []).map(event => {
      const eventMinute = Math.max(gameStartMinute, Math.min(gameEndMinute, event.minute));
      const eventSecond = event.second || 0;
      const videoSecond = (eventMinute - gameStartMinute) * 60 + eventSecond;
      const eventMs = videoSecond * 1000;
      
      return {
        match_id: matchId,
        event_type: event.event_type,
        minute: eventMinute,
        second: eventSecond,
        description: event.description?.substring(0, 100) || '',
        match_half: matchHalf,
        metadata: {
          team: event.team,
          isOwnGoal: event.isOwnGoal || false,
          teamName: event.team === 'home' ? homeTeam : awayTeam,
          source: 'ai-analysis',
          gameStartMinute,
          videoSecond,
          eventMs,
          half: matchHalf
        },
        approval_status: 'pending',
        is_highlight: ['goal', 'red_card', 'penalty'].includes(event.event_type)
      };
    });

    if (eventsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('match_events')
        .insert(eventsToInsert);

      if (insertError) {
        console.error('Insert events error:', insertError);
      } else {
        console.log('✓ Eventos inseridos:', eventsToInsert.length);
      }
    }

    // Update match score
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        home_score: analysisResult.homeScore || 0,
        away_score: analysisResult.awayScore || 0,
        status: 'completed'
      })
      .eq('id', matchId);

    if (updateError) {
      console.error('Update match error:', updateError);
    } else {
      console.log('✓ Placar atualizado:', analysisResult.homeScore, 'x', analysisResult.awayScore);
    }

    console.log('=== ANÁLISE COMPLETA ===');

    return new Response(JSON.stringify({
      success: true,
      eventsDetected: eventsToInsert.length,
      homeScore: analysisResult.homeScore || 0,
      awayScore: analysisResult.awayScore || 0,
      events: eventsToInsert
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-match:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
