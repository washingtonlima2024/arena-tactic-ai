import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { match_id, events, home_team, away_team } = await req.json();

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ error: "No events provided", generated: 0 }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let generated = 0;
    const batchSize = 5;

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      const prompt = `Voce e um comentarista tatico de futebol. Para cada evento abaixo, gere um comentario tatico em portugues brasileiro com EXATAMENTE 300 caracteres (nem mais, nem menos). Seja incisivo e tecnico. Nao use emojis nem markdown.

Partida: ${home_team} x ${away_team}

Eventos:
${batch.map((e: any, idx: number) => `${idx + 1}. [${e.event_type}] ${e.minute}' - ${e.description || 'Lance da partida'}`).join('\n')}

Responda APENAS com um JSON array de strings, um comentario por evento, na mesma ordem. Exemplo: ["comentario1", "comentario2"]`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Voce e um analista tatico de futebol profissional. Responda APENAS com JSON valido." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded", generated }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "Payment required", generated }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.error("AI error:", status, await response.text());
        continue;
      }

      const aiData = await response.json();
      let content = aiData.choices?.[0]?.message?.content || "";

      // Extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error("Could not parse AI response:", content.slice(0, 200));
        continue;
      }

      let comments: string[];
      try {
        comments = JSON.parse(jsonMatch[0]);
      } catch {
        console.error("JSON parse error:", jsonMatch[0].slice(0, 200));
        continue;
      }

      // Update events with comments
      for (let j = 0; j < batch.length && j < comments.length; j++) {
        const event = batch[j];
        const comment = comments[j]?.slice(0, 350) || "";

        if (!comment) continue;

        const updatedMetadata = { ...(event.metadata || {}), ai_comment: comment };

        const { error } = await supabase
          .from("match_events")
          .update({ metadata: updatedMetadata })
          .eq("id", event.id);

        if (error) {
          console.error(`Error updating event ${event.id}:`, error);
        } else {
          generated++;
        }
      }

      // Small delay between batches
      if (i + batchSize < events.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    return new Response(JSON.stringify({ success: true, generated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-event-comments error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
