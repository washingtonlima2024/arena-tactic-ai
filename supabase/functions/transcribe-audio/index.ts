import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audio, language = "pt" } = await req.json();

    if (!audio) {
      return new Response(
        JSON.stringify({ success: false, error: "No audio data provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const languageNames: Record<string, string> = {
      pt: "Portuguese",
      es: "Spanish",
      en: "English",
    };
    const langName = languageNames[language] || "Portuguese";

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
            content: `You are a professional audio transcription service specialized in sports broadcasting in ${langName}. 
Transcribe the audio exactly as spoken. Output ONLY the transcribed text, nothing else.
Rules:
- Do NOT add any commentary, timestamps, or formatting
- Do NOT translate - keep the original language
- If the audio is silent or unintelligible, return an empty string
- Focus on speech content, ignore background noise descriptions
- Keep proper nouns and team names as spoken`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcribe this ${langName} sports audio clip:`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:audio/webm;base64,${audio}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded. Try again in a few seconds." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "Credits exhausted. Add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: `AI Gateway error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(
      JSON.stringify({ success: true, text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("transcribe-audio error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
