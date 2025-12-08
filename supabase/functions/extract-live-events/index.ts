import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, homeTeam, awayTeam, currentScore, currentMinute } = await req.json();

    if (!transcript) {
      return new Response(
        JSON.stringify({ events: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Você é um analista de futebol especializado em identificar eventos de partidas a partir de transcrições de áudio de narradores.

Contexto da partida:
- Time Casa: ${homeTeam || "Time Casa"}
- Time Fora: ${awayTeam || "Time Fora"}
- Placar atual: ${currentScore?.home || 0} x ${currentScore?.away || 0}
- Minuto aproximado: ${currentMinute || 0}

Analise o texto transcrito e identifique eventos de futebol. Para cada evento encontrado, retorne:
- type: tipo do evento (goal, yellow_card, red_card, shot, foul, substitution, halftime, fulltime, corner, penalty, offside, save)
- minute: minuto do evento (use o minuto aproximado fornecido se não for mencionado)
- second: segundo do evento (0 se não especificado)
- description: descrição curta do evento
- confidence: nível de confiança de 0 a 1

Retorne APENAS eventos claramente identificados. Se não houver eventos claros, retorne um array vazio.

IMPORTANTE: Retorne a resposta APENAS como um JSON válido no formato:
{"events": [{"type": "...", "minute": 0, "second": 0, "description": "...", "confidence": 0.9}]}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Transcrição:\n${transcript}` },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status, await response.text());
      return new Response(
        JSON.stringify({ events: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    let events = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        events = parsed.events || [];
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
    }

    console.log(`Extracted ${events.length} events from transcript`);

    return new Response(
      JSON.stringify({ events }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in extract-live-events:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", events: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
