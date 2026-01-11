import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audio, language = 'pt' } = await req.json();
    
    if (!audio) {
      console.error('[transcribe-audio] No audio provided');
      return new Response(
        JSON.stringify({ success: false, error: 'No audio provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use GOOGLE_API_KEY directly (already configured in secrets)
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    
    if (!GOOGLE_API_KEY) {
      console.error('[transcribe-audio] GOOGLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'GOOGLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detect mime type from base64 header
    // WebM starts with 0x1A 0x45 (base64: "Gk" or similar patterns)
    // OGG starts with "OggS" (base64: "T2dn")
    let mimeType = 'audio/webm';
    if (audio.startsWith('T2dn')) {
      mimeType = 'audio/ogg';
    }
    
    const languageNames: Record<string, string> = {
      'pt': 'português brasileiro',
      'es': 'espanhol', 
      'en': 'inglês',
      'it': 'italiano',
      'fr': 'francês',
      'de': 'alemão'
    };

    const audioSizeKB = Math.round(audio.length * 0.75 / 1024);
    console.log(`[transcribe-audio] Processing ${audioSizeKB}KB audio, mime: ${mimeType}, lang: ${language}`);

    // Call Google Gemini API directly
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: audio
                }
              },
              {
                text: `Transcreva este áudio em ${languageNames[language] || 'português brasileiro'}.
Retorne APENAS o texto transcrito, sem formatação, comentários ou explicações.
Se não houver fala audível ou apenas ruído/música, retorne uma string vazia.
Não inclua timestamps nem identificação de falantes.`
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[transcribe-audio] Google API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded, try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 400) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid audio format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: `Google API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    // Extract text from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // Check for blocked content
    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
      console.warn('[transcribe-audio] Content blocked by safety filters');
      return new Response(
        JSON.stringify({ success: true, text: '' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[transcribe-audio] Transcribed ${text.length} chars: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

    return new Response(
      JSON.stringify({ success: true, text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[transcribe-audio] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
