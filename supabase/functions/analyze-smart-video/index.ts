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

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Update project status
    await supabase
      .from('smart_edit_projects')
      .update({ status: 'analyzing' })
      .eq('id', projectId);

    // Use Lovable AI (Gemini) to analyze the video directly via URL
    console.log('Analyzing video with Gemini Vision...');

    const intensityGuide = {
      basic: '3-5 momentos muito importantes com clips mais longos (20-60s)',
      medium: '6-10 momentos relevantes com duração equilibrada (10-40s)',
      detailed: '10-15 momentos interessantes com clips mais curtos (5-20s)'
    };

    const targetClips = {
      basic: Math.min(5, maxClips),
      medium: Math.min(10, maxClips),
      detailed: Math.min(15, maxClips)
    };

    const prompt = `Você é um editor de vídeo profissional. Analise este vídeo e identifique os trechos mais relevantes para criar um compilado/highlight.

CONFIGURAÇÕES:
- Idioma: ${language === 'pt' ? 'Português' : language === 'es' ? 'Espanhol' : 'Inglês'}
- Intensidade de cortes: ${cutIntensity} - ${intensityGuide[cutIntensity as keyof typeof intensityGuide] || intensityGuide.medium}
- Duração mínima de cada clip: ${minClipDuration} segundos
- Duração máxima de cada clip: ${maxClipDuration} segundos
- Quantidade de clips desejada: ${targetClips[cutIntensity as keyof typeof targetClips] || 8}

CRITÉRIOS PARA SELEÇÃO:
1. Momentos de destaque ou ação
2. Falas importantes ou emocionantes
3. Transições visuais interessantes
4. Reações expressivas
5. Começo e fim de segmentos importantes

INSTRUÇÕES:
1. Assista o vídeo completo
2. Identifique os melhores momentos
3. Anote os timestamps em segundos
4. Distribua os clips ao longo do vídeo

IMPORTANTE: Retorne APENAS um array JSON válido, sem markdown, sem explicações.
Cada clip deve ter:
- start_second: número inteiro (início em segundos)
- end_second: número inteiro (fim em segundos)
- title: string curta descritiva em ${language === 'pt' ? 'português' : language === 'es' ? 'espanhol' : 'inglês'}
- event_type: "destaque" | "fala" | "ação" | "reação" | "transição"
- confidence: número de 0.5 a 1.0

Exemplo de resposta:
[{"start_second":5,"end_second":25,"title":"Abertura do vídeo","event_type":"destaque","confidence":0.9}]`;

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
              { type: 'text', text: prompt },
              { type: 'video_url', video_url: { url: videoUrl } }
            ]
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your workspace.');
      }
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log('AI response length:', content.length);
    console.log('AI response preview:', content.substring(0, 500));

    // Parse JSON from response
    let clips: Array<{ start_second: number; end_second: number; title: string; event_type: string; confidence: number }> = [];
    
    try {
      // Try to extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        clips = JSON.parse(jsonMatch[0]);
        console.log(`Parsed ${clips.length} clips from AI response`);
      } else {
        console.error('No JSON array found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
    }

    // Validate and clean clips
    clips = clips.filter(clip => 
      typeof clip.start_second === 'number' &&
      typeof clip.end_second === 'number' &&
      clip.end_second > clip.start_second &&
      (clip.end_second - clip.start_second) >= minClipDuration &&
      (clip.end_second - clip.start_second) <= maxClipDuration
    ).slice(0, maxClips);

    // If no valid clips, generate fallback
    if (clips.length === 0) {
      console.log('No valid clips from AI, generating fallback...');
      clips = generateFallbackClips(minClipDuration, maxClipDuration, maxClips, cutIntensity);
    }

    console.log(`Final clip count: ${clips.length}`);

    // Insert clips into database
    const clipsToInsert = clips.map((clip, index) => ({
      project_id: projectId,
      start_second: Math.round(clip.start_second),
      end_second: Math.round(clip.end_second),
      title: clip.title || `Clip ${index + 1}`,
      event_type: clip.event_type || 'destaque',
      confidence: clip.confidence || 0.7,
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
        transcription: null
      })
      .eq('id', projectId);

    console.log('Analysis complete!');

    return new Response(JSON.stringify({ 
      success: true,
      clipsCount: clips.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    
    // Update project status to error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      const body = await req.clone().json().catch(() => ({}));
      
      if (body.projectId) {
        await supabase
          .from('smart_edit_projects')
          .update({ status: 'error' })
          .eq('id', body.projectId);
      }
    } catch (e) {
      console.error('Failed to update error status:', e);
    }

    const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Generate fallback clips when AI analysis fails
function generateFallbackClips(
  minClipDuration: number,
  maxClipDuration: number,
  maxClips: number,
  cutIntensity: string
): Array<{ start_second: number; end_second: number; title: string; event_type: string; confidence: number }> {
  const clips: Array<{ start_second: number; end_second: number; title: string; event_type: string; confidence: number }> = [];
  
  const targetCount = cutIntensity === 'basic' ? 4 : cutIntensity === 'detailed' ? 12 : 8;
  const count = Math.min(targetCount, maxClips);
  
  // Assume 5 minute video as baseline
  const assumedDuration = 300;
  const spacing = assumedDuration / (count + 1);
  const avgDuration = Math.floor((minClipDuration + maxClipDuration) / 2);

  for (let i = 0; i < count; i++) {
    const start = Math.round(spacing * (i + 1));
    
    clips.push({
      start_second: start,
      end_second: start + avgDuration,
      title: `Trecho ${i + 1}`,
      event_type: 'destaque',
      confidence: 0.5
    });
  }

  return clips;
}
