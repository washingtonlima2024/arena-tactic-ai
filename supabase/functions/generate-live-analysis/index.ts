import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, event, allEvents, homeTeam, awayTeam, score } = await req.json();

    if (!matchId || !event) {
      return new Response(
        JSON.stringify({ error: 'matchId and event are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating live analysis for match ${matchId}, event: ${event.type}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build event history summary
    const eventsSummary = (allEvents || []).map((e: any) => 
      `${e.minute}'${e.second}" - ${e.type}: ${e.description}`
    ).join('\n');

    const prompt = `Você é um analista de futebol especializado. Analise o seguinte evento em tempo real:

PARTIDA: ${homeTeam || 'Time A'} ${score?.home || 0} x ${score?.away || 0} ${awayTeam || 'Time B'}

NOVO EVENTO:
- Tipo: ${event.type}
- Minuto: ${event.minute}'${event.second}"
- Descrição: ${event.description}

EVENTOS ANTERIORES:
${eventsSummary || 'Nenhum evento anterior'}

Forneça uma análise JSON com:
1. "expandedDescription": Descrição expandida e profissional do evento (2-3 frases)
2. "tacticalInsight": Insight tático sobre o momento do jogo
3. "estimatedPosition": { "x": number 0-100, "y": number 0-100 } - posição estimada no campo onde ocorreu
4. "partialSummary": Resumo parcial da partida até agora (2-3 frases)
5. "momentum": "home" | "away" | "neutral" - qual time está dominando
6. "intensity": "low" | "medium" | "high" - intensidade do jogo

Responda APENAS com JSON válido.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista de futebol profissional. Responda sempre em JSON válido." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Default analysis
      analysis = {
        expandedDescription: event.description,
        tacticalInsight: "Momento importante da partida.",
        estimatedPosition: { x: 50, y: 50 },
        partialSummary: `Partida em andamento: ${homeTeam} ${score?.home || 0} x ${score?.away || 0} ${awayTeam}`,
        momentum: "neutral",
        intensity: "medium"
      };
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update the event with analysis data
    const { error: updateError } = await supabase
      .from('match_events')
      .update({
        metadata: {
          ...(typeof event.metadata === 'object' ? event.metadata : {}),
          analysis: analysis,
          analyzedAt: new Date().toISOString()
        },
        position_x: analysis.estimatedPosition?.x || 50,
        position_y: analysis.estimatedPosition?.y || 50,
      })
      .eq('id', event.id);

    if (updateError) {
      console.error('Error updating event with analysis:', updateError);
    }

    // Update match with partial summary in analysis_jobs
    const { data: existingJob } = await supabase
      .from('analysis_jobs')
      .select('id, result')
      .eq('match_id', matchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingJob) {
      const existingResult = existingJob.result as Record<string, any> || {};
      await supabase
        .from('analysis_jobs')
        .update({
          result: {
            ...existingResult,
            partialSummary: analysis.partialSummary,
            momentum: analysis.momentum,
            intensity: analysis.intensity,
            lastEventAnalysis: analysis,
            lastUpdated: new Date().toISOString()
          },
          current_step: `Analisando: ${event.type}`,
          progress: Math.min(90, (existingResult.progress || 0) + 5)
        })
        .eq('id', existingJob.id);
    } else {
      // Create new analysis job for live match
      await supabase
        .from('analysis_jobs')
        .insert({
          match_id: matchId,
          status: 'processing',
          progress: 10,
          current_step: `Analisando: ${event.type}`,
          result: {
            source: 'live',
            partialSummary: analysis.partialSummary,
            momentum: analysis.momentum,
            intensity: analysis.intensity,
            lastEventAnalysis: analysis,
            lastUpdated: new Date().toISOString()
          }
        });
    }

    console.log('Live analysis generated successfully');

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-live-analysis:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
