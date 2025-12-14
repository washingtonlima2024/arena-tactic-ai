import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MatchEvent {
  id: string;
  event_type: string;
  minute: number;
  second: number;
  description: string;
  metadata: any;
}

interface RefinementResult {
  eventsRefined: number;
  goalsDetected: number;
  scoreUpdated: boolean;
  homeScore: number;
  awayScore: number;
  refinedEvents: any[];
  issues: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, transcription } = await req.json();

    if (!matchId) {
      throw new Error("matchId é obrigatório");
    }

    console.log("=== REFINE EVENTS ===");
    console.log("Match ID:", matchId);
    console.log("Transcription length:", transcription?.length || 0);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch existing events
    const { data: events, error: eventsError } = await supabase
      .from("match_events")
      .select("*")
      .eq("match_id", matchId)
      .order("minute", { ascending: true })
      .order("second", { ascending: true });

    if (eventsError) {
      throw new Error(`Erro ao buscar eventos: ${eventsError.message}`);
    }

    console.log("Existing events:", events?.length || 0);

    // Fetch match details
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select(`
        *,
        home_team:teams!matches_home_team_id_fkey(id, name, short_name),
        away_team:teams!matches_away_team_id_fkey(id, name, short_name)
      `)
      .eq("id", matchId)
      .single();

    if (matchError) {
      throw new Error(`Erro ao buscar partida: ${matchError.message}`);
    }

    const homeTeamName = match.home_team?.name || "Time Casa";
    const awayTeamName = match.away_team?.name || "Time Visitante";
    const homeTeamId = match.home_team_id;
    const awayTeamId = match.away_team_id;

    console.log("Match:", homeTeamName, "vs", awayTeamName);
    console.log("Current score:", match.home_score, "x", match.away_score);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    // Format existing events for analysis
    const existingEventsText = events?.map((e: MatchEvent) => 
      `[${e.minute}:${String(e.second || 0).padStart(2, '0')}] ${e.event_type}: ${e.description || 'sem descrição'}`
    ).join("\n") || "Nenhum evento detectado";

    // Build refinement prompt
    const prompt = `Você é um especialista em análise de partidas de futebol.

PARTIDA: ${homeTeamName} (casa) vs ${awayTeamName} (visitante)
PLACAR ATUAL: ${match.home_score || 0} x ${match.away_score || 0}

=== TRANSCRIÇÃO DA NARRAÇÃO ===
${transcription || "Transcrição não disponível"}

=== EVENTOS JÁ DETECTADOS ===
${existingEventsText}

TAREFAS:
1. IDENTIFICAR GOLS: Analise a transcrição buscando menções a gols (GOOOL, GOL, marcou, balançou a rede, etc.)
   - Para cada gol, identifique qual time marcou (${homeTeamName} = casa, ${awayTeamName} = visitante)
   - Identifique o minuto aproximado do gol baseado nos timestamps da transcrição

2. ATUALIZAR PLACAR: Calcule o placar final baseado nos gols identificados na narração

3. MELHORAR DESCRIÇÕES: Para cada evento existente, sugira uma descrição mais impactante em português do Brasil
   - Use linguagem de narrador esportivo
   - Máximo 60 caracteres
   - Seja criativo e empolgante

4. DETECTAR ERROS: Identifique eventos que parecem incorretos ou fora de contexto
   - Tipos de evento que não correspondem à descrição
   - Timestamps que não fazem sentido

5. EVENTOS FALTANTES: Identifique eventos importantes mencionados na narração que não estão nos eventos detectados

Retorne APENAS JSON válido:
{
  "goalsDetected": [
    {
      "team": "home" ou "away",
      "minute": 25,
      "second": 0,
      "scorer": "Nome do jogador se mencionado",
      "narrationContext": "Trecho da narração que menciona o gol"
    }
  ],
  "finalScore": {
    "home": 0,
    "away": 0
  },
  "refinedEvents": [
    {
      "eventId": "id-do-evento-existente",
      "originalType": "tipo-original",
      "suggestedType": "tipo-sugerido-se-diferente",
      "originalDescription": "descrição original",
      "improvedDescription": "Nova descrição impactante!",
      "issue": "Descrição do problema se houver"
    }
  ],
  "missingEvents": [
    {
      "type": "goal",
      "minute": 30,
      "second": 0,
      "description": "GOOOOL! Time marca!",
      "team": "home",
      "reason": "Mencionado na narração mas não detectado"
    }
  ],
  "issues": [
    "Lista de problemas gerais encontrados"
  ]
}`;

    console.log("Calling AI for event refinement...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um analista de futebol especializado em identificar gols e eventos em narrações.
            
PRIORIDADE MÁXIMA: Identificar GOLS na transcrição!
- Procure por: "GOL", "GOOOL", "marcou", "balançou a rede", "é gol", "mandou pra dentro", "abriu o placar", "empata", "vira o jogo"
- Cada menção de gol indica um gol real que precisa ser contabilizado

Retorne APENAS JSON válido, sem markdown.`
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`Erro na API de IA: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    console.log("AI response length:", content.length);

    // Parse JSON response
    let cleanContent = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Resposta da IA não contém JSON válido");
    }

    const refinementData = JSON.parse(jsonMatch[0]);
    
    console.log("Goals detected:", refinementData.goalsDetected?.length || 0);
    console.log("Final score:", refinementData.finalScore);
    console.log("Refined events:", refinementData.refinedEvents?.length || 0);
    console.log("Missing events:", refinementData.missingEvents?.length || 0);

    const result: RefinementResult = {
      eventsRefined: 0,
      goalsDetected: refinementData.goalsDetected?.length || 0,
      scoreUpdated: false,
      homeScore: match.home_score || 0,
      awayScore: match.away_score || 0,
      refinedEvents: [],
      issues: refinementData.issues || [],
    };

    // Update score if goals were detected
    if (refinementData.finalScore) {
      const newHomeScore = refinementData.finalScore.home;
      const newAwayScore = refinementData.finalScore.away;
      
      if (newHomeScore !== match.home_score || newAwayScore !== match.away_score) {
        console.log("Updating score:", newHomeScore, "x", newAwayScore);
        
        const { error: updateError } = await supabase
          .from("matches")
          .update({
            home_score: newHomeScore,
            away_score: newAwayScore,
          })
          .eq("id", matchId);

        if (!updateError) {
          result.scoreUpdated = true;
          result.homeScore = newHomeScore;
          result.awayScore = newAwayScore;
        } else {
          console.error("Error updating score:", updateError);
        }
      }
    }

    // Add missing goal events
    if (refinementData.goalsDetected?.length > 0) {
      for (const goal of refinementData.goalsDetected) {
        // Check if goal event already exists at this timestamp
        const existingGoal = events?.find((e: MatchEvent) => 
          e.event_type === "goal" && 
          Math.abs(e.minute - goal.minute) <= 1
        );

        if (!existingGoal) {
          console.log("Adding missing goal event:", goal);
          
          const { error: insertError } = await supabase
            .from("match_events")
            .insert({
              match_id: matchId,
              event_type: "goal",
              minute: goal.minute,
              second: goal.second || 0,
              description: goal.scorer 
                ? `GOL de ${goal.scorer}!`
                : `GOOOL do ${goal.team === "home" ? homeTeamName : awayTeamName}!`,
              is_highlight: true,
              metadata: {
                team: goal.team,
                teamName: goal.team === "home" ? homeTeamName : awayTeamName,
                scorer: goal.scorer,
                narration: goal.narrationContext,
                source: "transcription_refinement",
                confidence: 0.9,
              },
            });

          if (!insertError) {
            result.goalsDetected++;
          }
        }
      }
    }

    // Update refined event descriptions
    if (refinementData.refinedEvents?.length > 0) {
      for (const refined of refinementData.refinedEvents) {
        if (refined.eventId && refined.improvedDescription) {
          const updateData: any = {
            description: refined.improvedDescription,
          };

          // Only update type if suggested and different
          if (refined.suggestedType && refined.suggestedType !== refined.originalType) {
            updateData.event_type = refined.suggestedType;
          }

          const { error: updateError } = await supabase
            .from("match_events")
            .update(updateData)
            .eq("id", refined.eventId);

          if (!updateError) {
            result.eventsRefined++;
            result.refinedEvents.push(refined);
          }
        }
      }
    }

    // Add missing events (non-goal)
    if (refinementData.missingEvents?.length > 0) {
      for (const missing of refinementData.missingEvents) {
        if (missing.type !== "goal") { // Goals handled separately above
          const { error: insertError } = await supabase
            .from("match_events")
            .insert({
              match_id: matchId,
              event_type: missing.type,
              minute: missing.minute,
              second: missing.second || 0,
              description: missing.description,
              is_highlight: ["yellow_card", "red_card", "penalty"].includes(missing.type),
              metadata: {
                team: missing.team,
                teamName: missing.team === "home" ? homeTeamName : awayTeamName,
                source: "transcription_refinement",
                reason: missing.reason,
                confidence: 0.8,
              },
            });

          if (!insertError) {
            result.eventsRefined++;
          }
        }
      }
    }

    console.log("=== REFINEMENT COMPLETE ===");
    console.log("Events refined:", result.eventsRefined);
    console.log("Goals detected:", result.goalsDetected);
    console.log("Score updated:", result.scoreUpdated);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in refine-events:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Erro desconhecido",
        eventsRefined: 0,
        goalsDetected: 0,
        scoreUpdated: false,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
