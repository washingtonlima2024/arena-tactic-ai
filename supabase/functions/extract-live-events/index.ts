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

    console.log("=== EXTRACT-LIVE-EVENTS CALLED ===");
    console.log("Home Team:", homeTeam);
    console.log("Away Team:", awayTeam);
    console.log("Current Score:", JSON.stringify(currentScore));
    console.log("Current Minute:", currentMinute);
    console.log("Transcript length:", transcript?.length || 0);
    console.log("Transcript preview:", transcript?.substring(0, 300) || "EMPTY");

    if (!transcript || transcript.trim().length < 10) {
      console.log("Transcript too short or empty, returning empty events");
      return new Response(
        JSON.stringify({ events: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Você é um analista especializado em identificar eventos de futebol a partir de narrações em tempo real de partidas brasileiras.

CONTEXTO DA PARTIDA:
- Time Casa: ${homeTeam || "Time Casa"}
- Time Fora: ${awayTeam || "Time Fora"}  
- Placar atual: ${currentScore?.home || 0} x ${currentScore?.away || 0}
- Minuto aproximado: ${currentMinute || 0}

IMPORTANTE - EXPRESSÕES DE NARRADORES BRASILEIROS:
Narradores brasileiros usam expressões características. Identifique QUALQUER menção a:

🥅 GOL: "GOL!", "GOOOOL!", "GOLAÇO!", "É gol!", "gol de...", "abre o placar", "marca", "faz o gol", "amplia", "empata", "vira o jogo", "balançou as redes", "estufou a rede", "para o fundo do gol"

⚠️ FALTA: "falta!", "marcou falta", "derrubou", "fez falta", "entrada dura", "falta perigosa", "falta na entrada da área"

⚽ CHUTE/FINALIZAÇÃO: "chuta!", "finaliza!", "arremata!", "tenta o gol", "bateu forte", "mandou pra fora", "passou raspando", "acertou a trave", "no travessão", "isolou", "mandou longe"

🚩 ESCANTEIO: "escanteio!", "córner!", "sai pela linha de fundo", "vai cobrar escanteio"

🟨 CARTÃO AMARELO: "cartão amarelo", "amarelou", "foi advertido", "levou amarelo"

🟥 CARTÃO VERMELHO: "cartão vermelho!", "expulso!", "foi pra fora", "levou vermelho", "direto pro chuveiro"

⚖️ PÊNALTI: "pênalti!", "penalidade máxima!", "na marca da cal", "vai bater o pênalti"

🧤 DEFESA: "defendeu!", "o goleiro pegou!", "grande defesa!", "espalmou!", "tirou o gol"

📴 IMPEDIMENTO: "impedimento!", "estava impedido", "bandeira levantada"

🔄 SUBSTITUIÇÃO: "substituição", "vai entrar", "vai sair", "sai... entra..."

⏸️ INTERVALO: "fim do primeiro tempo", "intervalo", "vai pro descanso"

🏁 FIM DE JOGO: "fim de jogo!", "apita o árbitro", "acabou!", "termina a partida"

REGRAS DE DETECÇÃO:
1. Seja MENOS RESTRITIVO - se houver INDÍCIO de evento, retorne-o
2. Para eventos incertos, use confidence entre 0.4-0.7
3. Para eventos claros (ex: "GOOOOL!"), use confidence 0.8-1.0
4. O campo description deve ser em português, curto (máx 50 chars)
5. Se identificar gol, SEMPRE retorne com type "goal"

FORMATO DE RESPOSTA (JSON VÁLIDO):
{"events": [{"type": "goal", "minute": 15, "second": 30, "description": "Gol de cabeça após escanteio", "confidence": 0.95}]}`;

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

    console.log("=== AI RESPONSE ===");
    console.log("Raw AI content:", content);

    // Parse the JSON response
    let events = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        events = parsed.events || [];
        console.log("Parsed events:", JSON.stringify(events));
      } else {
        console.log("No JSON found in AI response");
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      console.error("Content that failed to parse:", content);
    }

    console.log(`✅ Extracted ${events.length} events from transcript`);

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
