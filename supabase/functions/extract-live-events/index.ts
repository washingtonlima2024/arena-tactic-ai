import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedEvent {
  type: string;
  description: string;
  confidence: number;
  windowBefore: number;
  windowAfter: number;
}

interface ExtractionResponse {
  events: ExtractedEvent[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, homeTeam, awayTeam, currentScore, currentMinute } = await req.json();

    if (!transcript || transcript.trim().length < 10) {
      return new Response(
        JSON.stringify({ events: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
    
    const apiKey = LOVABLE_API_KEY || GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.error("No API key configured");
      return new Response(
        JSON.stringify({ events: [], error: "No API key configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Você é um detector de eventos de futebol ao vivo analisando a transcrição de um narrador.
Sua tarefa é identificar eventos importantes mencionados na narração.

Para cada evento detectado, você DEVE retornar:
- type: tipo do evento (goal, goal_home, goal_away, yellow_card, red_card, foul, corner, penalty, shot, save, offside, substitution, halftime)
- description: descrição breve do evento em português
- confidence: confiança de 0.0 a 1.0
- windowBefore: segundos para voltar ANTES do evento (janela de captura)
- windowAfter: segundos para avançar APÓS o evento (janela de captura)

JANELAS RECOMENDADAS por tipo de evento:
- goal/goal_home/goal_away: windowBefore=10, windowAfter=15 (capturar jogada completa + comemoração)
- penalty: windowBefore=10, windowAfter=20 (incluir infração + cobrança)
- red_card: windowBefore=8, windowAfter=5 (falta grave + reação)
- yellow_card: windowBefore=5, windowAfter=3
- shot: windowBefore=5, windowAfter=5 (finalização + reação)
- save: windowBefore=5, windowAfter=3 (defesa do goleiro)
- foul: windowBefore=3, windowAfter=5
- corner: windowBefore=3, windowAfter=8
- offside: windowBefore=3, windowAfter=3
- substitution: windowBefore=2, windowAfter=5
- halftime: windowBefore=5, windowAfter=5

REGRAS IMPORTANTES:
1. Só detecte eventos que estão CLARAMENTE mencionados na transcrição
2. Eventos de gol devem especificar se é goal_home ou goal_away baseado no contexto
3. Retorne um array vazio se não houver eventos claros
4. Cada evento deve ter alta confiança (>0.7) para ser incluído

Retorne APENAS um JSON válido no formato:
{
  "events": [
    {
      "type": "goal_home",
      "description": "Gol de cabeça após escanteio",
      "confidence": 0.95,
      "windowBefore": 10,
      "windowAfter": 15
    }
  ]
}`;

    const userPrompt = `Transcrição do narrador: "${transcript}"

Contexto:
- Time da casa: ${homeTeam || "Casa"}
- Time visitante: ${awayTeam || "Fora"}
- Placar atual: ${currentScore?.home || 0} x ${currentScore?.away || 0}
- Minuto aproximado: ${currentMinute || 0}'

Analise a transcrição e identifique eventos. Retorne APENAS o JSON.`;

    console.log(`[extract-live-events] Processing transcript (${transcript.length} chars) at minute ${currentMinute}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[extract-live-events] AI Gateway error: ${response.status}`, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ events: [], error: "Rate limit exceeded" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ events: [], error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    
    console.log(`[extract-live-events] Raw AI response:`, content);

    // Parse JSON from response
    let parsedEvents: ExtractionResponse = { events: [] };
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedEvents = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error(`[extract-live-events] JSON parse error:`, parseError);
    }

    // Validate and sanitize events
    const validEvents = (parsedEvents.events || [])
      .filter((e: any) => e.type && e.confidence >= 0.7)
      .map((e: any) => ({
        type: e.type,
        description: e.description || e.type,
        confidence: Math.min(1, Math.max(0, e.confidence)),
        windowBefore: Math.max(3, Math.min(30, e.windowBefore || 5)),
        windowAfter: Math.max(3, Math.min(30, e.windowAfter || 5)),
      }));

    console.log(`[extract-live-events] Detected ${validEvents.length} events`);

    return new Response(
      JSON.stringify({ events: validEvents }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[extract-live-events] Error:", error);
    return new Response(
      JSON.stringify({ events: [], error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
