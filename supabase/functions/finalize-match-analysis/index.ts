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
    const { matchId, homeTeam, awayTeam, finalScore, duration } = await req.json();

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: 'matchId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Finalizing analysis for match ${matchId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all events for this match
    const { data: events, error: eventsError } = await supabase
      .from('match_events')
      .select('*')
      .eq('match_id', matchId)
      .order('minute', { ascending: true });

    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message}`);
    }

    const eventsList = events || [];
    console.log(`Found ${eventsList.length} events for match`);

    // Calculate statistics from events
    const stats: Record<string, any> = {
      totalEvents: eventsList.length,
      goals: eventsList.filter(e => ['goal', 'goal_home', 'goal_away'].includes(e.event_type)).length,
      shots: eventsList.filter(e => e.event_type === 'shot').length,
      fouls: eventsList.filter(e => e.event_type === 'foul').length,
      yellowCards: eventsList.filter(e => e.event_type === 'yellow_card').length,
      redCards: eventsList.filter(e => e.event_type === 'red_card').length,
      substitutions: eventsList.filter(e => e.event_type === 'substitution').length,
      homeGoals: eventsList.filter(e => e.event_type === 'goal_home').length,
      awayGoals: eventsList.filter(e => e.event_type === 'goal_away').length,
    };

    // Build key moments summary
    const keyMoments = eventsList
      .filter(e => ['goal', 'goal_home', 'goal_away', 'red_card', 'penalty'].includes(e.event_type))
      .map(e => ({
        minute: e.minute,
        second: e.second,
        type: e.event_type,
        description: e.description,
        analysis: (e.metadata as any)?.analysis?.expandedDescription || e.description
      }));

    // Generate final summary with AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    let finalSummary = `Partida finalizada: ${homeTeam || 'Casa'} ${finalScore?.home || 0} x ${finalScore?.away || 0} ${awayTeam || 'Visitante'}. `;
    finalSummary += `Total de ${stats.totalEvents} eventos registrados, incluindo ${stats.goals} gols, ${stats.shots} finalizações e ${stats.fouls} faltas.`;

    if (LOVABLE_API_KEY && eventsList.length > 0) {
      try {
        const eventsSummary = eventsList.map(e => 
          `${e.minute}'${e.second || 0}" - ${e.event_type}: ${e.description}`
        ).join('\n');

        const prompt = `Você é um analista de futebol. Gere um resumo final profissional desta partida:

PARTIDA: ${homeTeam || 'Casa'} ${finalScore?.home || 0} x ${finalScore?.away || 0} ${awayTeam || 'Visitante'}
DURAÇÃO: ${duration ? Math.floor(duration / 60) : 90} minutos

EVENTOS DA PARTIDA:
${eventsSummary}

ESTATÍSTICAS:
- Gols: ${stats.goals}
- Finalizações: ${stats.shots}
- Faltas: ${stats.fouls}
- Cartões Amarelos: ${stats.yellowCards}
- Cartões Vermelhos: ${stats.redCards}

Forneça um JSON com:
1. "matchSummary": Resumo completo da partida (3-5 frases)
2. "tacticalOverview": Análise tática geral da partida
3. "playerOfTheMatch": Sugestão de destaque da partida baseado nos eventos
4. "keyMomentDescription": Descrição do momento mais importante
5. "possessionFinal": { "home": number, "away": number } - posse estimada final
6. "offensiveRating": { "home": number 1-10, "away": number 1-10 }
7. "defensiveRating": { "home": number 1-10, "away": number 1-10 }

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
              { role: "system", content: "Você é um analista de futebol profissional. Responda em JSON válido." },
              { role: "user", content: prompt }
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const aiAnalysis = JSON.parse(jsonMatch[0]);
            finalSummary = aiAnalysis.matchSummary || finalSummary;
            
            // Store full AI analysis
            stats['aiAnalysis'] = aiAnalysis;
          }
        }
      } catch (aiError) {
        console.error('AI analysis failed, using default summary:', aiError);
      }
    }

    // Update analysis job with final results
    const { data: existingJob } = await supabase
      .from('analysis_jobs')
      .select('id, result')
      .eq('match_id', matchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const finalResult = {
      source: 'live',
      isPartial: false,
      eventsAnalyzed: eventsList.length,
      finalSummary,
      keyMoments,
      stats,
      completedAt: new Date().toISOString()
    };

    if (existingJob) {
      const existingResult = existingJob.result as Record<string, any> || {};
      await supabase
        .from('analysis_jobs')
        .update({
          status: 'completed',
          progress: 100,
          current_step: 'Análise completa',
          completed_at: new Date().toISOString(),
          result: {
            ...existingResult,
            ...finalResult
          }
        })
        .eq('id', existingJob.id);
    } else {
      await supabase
        .from('analysis_jobs')
        .insert({
          match_id: matchId,
          status: 'completed',
          progress: 100,
          current_step: 'Análise completa',
          completed_at: new Date().toISOString(),
          result: finalResult
        });
    }

    // Update match status
    await supabase
      .from('matches')
      .update({ status: 'analyzed' })
      .eq('id', matchId);

    console.log('Match analysis finalized successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary: finalSummary,
        stats,
        keyMoments
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in finalize-match-analysis:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});