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
    const { matchId, transcription, homeTeam, awayTeam, gameStartMinute = 0, gameEndMinute = 45 } = await req.json();

    if (!matchId) {
      throw new Error('matchId is required');
    }

    if (!transcription || transcription.trim().length < 50) {
      throw new Error('transcription is required and must be at least 50 characters');
    }

    console.log('=== ANÁLISE DE PARTIDA SIMPLIFICADA ===');
    console.log('Match ID:', matchId);
    console.log('Times:', homeTeam, 'vs', awayTeam);
    console.log('Tempo de jogo:', gameStartMinute, '-', gameEndMinute);
    console.log('Transcrição:', transcription.length, 'caracteres');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call AI to analyze transcription
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Você é um analista de futebol especializado em identificar eventos em narrações.
Analise a transcrição e extraia TODOS os eventos mencionados pelo narrador.

REGRAS IMPORTANTES:
1. Identifique TODOS os gols mencionados na narração
2. Para gols contra (own goals), marque isOwnGoal: true
3. Extraia o minuto aproximado do jogo baseado no contexto
4. Os minutos devem estar entre ${gameStartMinute} e ${gameEndMinute}
5. Use descrições curtas em português (máximo 60 caracteres)
6. Identifique qual time fez cada evento: "home" para ${homeTeam} ou "away" para ${awayTeam}

TIPOS DE EVENTOS (use exatamente estes valores):
- goal: gol marcado
- shot: chute/finalização
- save: defesa do goleiro
- foul: falta
- yellow_card: cartão amarelo
- red_card: cartão vermelho
- corner: escanteio
- offside: impedimento
- substitution: substituição
- chance: chance clara de gol
- penalty: pênalti

Retorne APENAS um JSON válido no formato:
{
  "events": [
    {
      "minute": 15,
      "second": 30,
      "event_type": "goal",
      "description": "Gol de cabeça após escanteio",
      "team": "home",
      "isOwnGoal": false
    }
  ],
  "homeScore": 2,
  "awayScore": 1
}`;

    const userPrompt = `Times: ${homeTeam} (casa) vs ${awayTeam} (visitante)
Período: ${gameStartMinute}' - ${gameEndMinute}'

TRANSCRIÇÃO DA NARRAÇÃO:
${transcription}

Extraia todos os eventos e calcule o placar final correto.`;

    console.log('Chamando IA para análise...');

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
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('Resposta da IA recebida:', aiContent.length, 'chars');

    // Parse JSON from AI response
    let analysisResult: AnalysisResult;
    try {
      // Extract JSON from response (may have markdown)
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      analysisResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('AI content:', aiContent);
      throw new Error('Failed to parse AI response as JSON');
    }

    console.log('Eventos detectados:', analysisResult.events?.length || 0);
    console.log('Placar:', analysisResult.homeScore, 'x', analysisResult.awayScore);

    // Insert events into database
    const eventsToInsert = (analysisResult.events || []).map(event => ({
      match_id: matchId,
      event_type: event.event_type,
      minute: Math.max(gameStartMinute, Math.min(gameEndMinute, event.minute)),
      second: event.second || 0,
      description: event.description?.substring(0, 100) || '',
      metadata: {
        team: event.team,
        isOwnGoal: event.isOwnGoal || false,
        teamName: event.team === 'home' ? homeTeam : awayTeam,
        source: 'ai-analysis'
      },
      approval_status: 'pending',
      is_highlight: ['goal', 'red_card', 'penalty'].includes(event.event_type)
    }));

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
