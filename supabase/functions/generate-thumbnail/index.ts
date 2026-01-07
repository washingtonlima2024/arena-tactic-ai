import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, eventType, matchInfo, eventId, matchId } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Generating thumbnail for:', eventType, matchInfo);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-image-preview',
        messages: [
          {
            role: 'user',
            content: `Generate an image: ${prompt}. Do not include any text in your response, only generate the image.`
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos ao workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');

    const base64Image = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!base64Image) {
      console.error('No image in response:', JSON.stringify(data));
      throw new Error('Nenhuma imagem gerada');
    }

    // Extract base64 data and convert to binary
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Generate unique filename
    const fileName = `${matchId || 'unknown'}/${eventId || crypto.randomUUID()}.png`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(fileName, binaryData, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error('Erro ao salvar imagem no storage');
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(fileName);

    const imageUrl = urlData.publicUrl;
    console.log('Image saved to storage:', imageUrl);

    // Save to database if we have eventId and matchId
    if (eventId && matchId) {
      const eventLabels: Record<string, string> = {
        goal: 'GOL',
        shot: 'FINALIZAÇÃO',
        shot_on_target: 'CHUTE NO GOL',
        save: 'DEFESA',
        foul: 'FALTA',
        yellow_card: 'CARTÃO AMARELO',
        red_card: 'CARTÃO VERMELHO',
        corner: 'ESCANTEIO',
        penalty: 'PÊNALTI',
        offside: 'IMPEDIMENTO',
      };

      const title = eventLabels[eventType] || eventType.toUpperCase();

      const { error: dbError } = await supabase
        .from('thumbnails')
        .upsert({
          event_id: eventId,
          match_id: matchId,
          image_url: imageUrl,
          event_type: eventType,
          title: title
        }, { onConflict: 'event_id' });

      if (dbError) {
        console.error('Database error:', dbError);
        // Don't throw, we still have the image
      } else {
        console.log('Thumbnail saved to database');
      }
    }

    return new Response(
      JSON.stringify({ 
        imageUrl,
        eventType,
        matchInfo,
        eventId,
        matchId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating thumbnail:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar thumbnail';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});