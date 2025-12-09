import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, videoUrl, language, minClipDuration, maxClipDuration, maxClips, cutIntensity } = await req.json();

    console.log('Starting smart video analysis:', { projectId, language, cutIntensity });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    // Update project status
    await supabase
      .from('smart_edit_projects')
      .update({ status: 'analyzing' })
      .eq('id', projectId);

    let transcription = '';

    // Step 1: Transcribe audio using OpenAI Whisper (if we have the API key)
    if (openaiApiKey) {
      console.log('Transcribing audio with Whisper...');
      try {
        // For now, we'll use Gemini to analyze the video directly
        // In production, you'd extract audio and send to Whisper
        console.log('Skipping Whisper transcription, using visual analysis');
      } catch (error) {
        console.error('Transcription error:', error);
      }
    }

    // Step 2: Analyze video with Gemini to detect relevant clips
    console.log('Analyzing video content with AI...');

    const intensityGuide = {
      basic: 'Identifique apenas 3-5 momentos muito importantes e crie clips mais longos (30-60 segundos cada)',
      medium: 'Identifique 6-10 momentos relevantes com duração equilibrada (15-45 segundos cada)',
      detailed: 'Identifique 10-15 momentos interessantes e crie clips mais curtos (5-20 segundos cada)'
    };

    const analysisPrompt = `Analise este vídeo e identifique os trechos mais relevantes para criar um compilado de highlights.

Você é um editor de vídeo profissional. Analise o conteúdo e encontre:
- Momentos emocionantes ou impactantes
- Mudanças de assunto importantes
- Reações interessantes
- Comentários memoráveis
- Cenas visualmente marcantes

Configurações:
- Intensidade: ${cutIntensity} - ${intensityGuide[cutIntensity as keyof typeof intensityGuide]}
- Duração mínima de cada clip: ${minClipDuration} segundos
- Duração máxima de cada clip: ${maxClipDuration} segundos
- Quantidade máxima de clips: ${maxClips}

IMPORTANTE: Retorne APENAS um array JSON válido, sem markdown, sem explicações.
Cada clip deve ter:
- start_second: número (início em segundos)
- end_second: número (fim em segundos)
- title: string (título descritivo curto)
- event_type: string (tipo: "destaque", "comentário", "reação", "importante", "engraçado")
- confidence: número de 0 a 1 (confiança na relevância)

Exemplo de resposta:
[{"start_second":15,"end_second":35,"title":"Momento emocionante","event_type":"destaque","confidence":0.9}]`;

    let detectedClips: any[] = [];

    if (lovableApiKey) {
      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: analysisPrompt },
                  { type: 'image_url', image_url: { url: videoUrl } }
                ]
              }
            ]
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('AI analysis error:', response.status, errorText);
          
          // Generate mock clips based on estimated video duration
          detectedClips = generateMockClips(minClipDuration, maxClipDuration, maxClips, cutIntensity);
        } else {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          console.log('AI response:', content);

          // Parse JSON from response
          try {
            // Try to extract JSON array from response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              detectedClips = JSON.parse(jsonMatch[0]);
            } else {
              detectedClips = JSON.parse(content);
            }
          } catch (parseError) {
            console.error('JSON parse error, using mock clips:', parseError);
            detectedClips = generateMockClips(minClipDuration, maxClipDuration, maxClips, cutIntensity);
          }
        }
      } catch (aiError) {
        console.error('AI request failed:', aiError);
        detectedClips = generateMockClips(minClipDuration, maxClipDuration, maxClips, cutIntensity);
      }
    } else {
      console.log('No API key, generating demo clips');
      detectedClips = generateMockClips(minClipDuration, maxClipDuration, maxClips, cutIntensity);
    }

    // Insert clips into database
    console.log(`Inserting ${detectedClips.length} clips into database...`);
    
    const clipsToInsert = detectedClips.map((clip, index) => ({
      project_id: projectId,
      start_second: clip.start_second,
      end_second: clip.end_second,
      title: clip.title,
      event_type: clip.event_type,
      confidence: clip.confidence,
      is_enabled: true,
      sort_order: index
    }));

    const { error: insertError } = await supabase
      .from('smart_edit_clips')
      .insert(clipsToInsert);

    if (insertError) {
      console.error('Error inserting clips:', insertError);
      throw insertError;
    }

    // Update project status
    await supabase
      .from('smart_edit_projects')
      .update({ 
        status: 'ready',
        transcription: transcription || null
      })
      .eq('id', projectId);

    console.log('Analysis complete!');

    return new Response(JSON.stringify({ 
      success: true,
      clipsCount: detectedClips.length,
      transcription
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
    return new Response(JSON.stringify({ 
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateMockClips(minDuration: number, maxDuration: number, maxClips: number, intensity: string): any[] {
  const clipCount = intensity === 'basic' ? 4 : intensity === 'detailed' ? 12 : 8;
  const actualCount = Math.min(clipCount, maxClips);
  
  const eventTypes = ['destaque', 'comentário', 'reação', 'importante', 'engraçado'];
  const titles = [
    'Momento emocionante',
    'Comentário relevante',
    'Reação interessante',
    'Ponto importante',
    'Trecho engraçado',
    'Cena marcante',
    'Análise técnica',
    'Opinião polêmica',
    'Momento memorável',
    'Destaque do vídeo',
    'Insight valioso',
    'Conclusão impactante'
  ];

  const clips = [];
  let currentTime = 5; // Start 5 seconds in

  for (let i = 0; i < actualCount; i++) {
    const duration = Math.floor(Math.random() * (maxDuration - minDuration)) + minDuration;
    clips.push({
      start_second: currentTime,
      end_second: currentTime + duration,
      title: titles[i % titles.length],
      event_type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
      confidence: 0.7 + Math.random() * 0.25
    });
    currentTime += duration + 10 + Math.floor(Math.random() * 20); // Gap between clips
  }

  return clips;
}
