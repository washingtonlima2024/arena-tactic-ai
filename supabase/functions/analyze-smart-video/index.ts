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

  let projectId: string | null = null;

  try {
    const body = await req.json();
    projectId = body.projectId;
    const { videoUrl, language, minClipDuration, maxClipDuration, maxClips, cutIntensity } = body;

    console.log('Starting smart video analysis:', { projectId, language, cutIntensity, videoUrl });

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

    // Try to get video duration from HEAD request
    let videoDuration = 300; // Default 5 minutes
    try {
      console.log('Fetching video metadata...');
      const headResponse = await fetch(videoUrl, { method: 'HEAD' });
      const contentLength = headResponse.headers.get('content-length');
      
      // Estimate duration based on file size (rough estimate: ~1MB per 10 seconds for typical video)
      if (contentLength) {
        const fileSizeMB = parseInt(contentLength) / (1024 * 1024);
        videoDuration = Math.max(60, Math.min(3600, Math.round(fileSizeMB * 10)));
        console.log(`Estimated video duration from file size (${fileSizeMB.toFixed(1)}MB): ${videoDuration}s`);
      }
    } catch (metaError) {
      console.log('Could not fetch video metadata, using default duration');
    }

    // Use AI to generate intelligent clip suggestions based on video duration and settings
    console.log('Generating clip suggestions with AI...');

    const intensityGuide = {
      basic: '3-5 momentos com clips mais longos',
      medium: '6-10 momentos com duração equilibrada',
      detailed: '10-15 momentos com clips mais curtos'
    };

    const targetClips = {
      basic: Math.min(5, maxClips),
      medium: Math.min(10, maxClips),
      detailed: Math.min(15, maxClips)
    };

    const targetCount = targetClips[cutIntensity as keyof typeof targetClips] || 8;

    const prompt = `Você é um editor de vídeo profissional. Gere sugestões inteligentes de cortes para um vídeo com duração estimada de ${videoDuration} segundos.

CONFIGURAÇÕES:
- Duração total do vídeo: ${videoDuration} segundos (${Math.floor(videoDuration / 60)} minutos e ${videoDuration % 60} segundos)
- Idioma: ${language === 'pt' ? 'Português' : language === 'es' ? 'Espanhol' : 'Inglês'}
- Intensidade: ${cutIntensity} - ${intensityGuide[cutIntensity as keyof typeof intensityGuide] || intensityGuide.medium}
- Duração mínima de cada clip: ${minClipDuration} segundos
- Duração máxima de cada clip: ${maxClipDuration} segundos
- Quantidade de clips: ${targetCount}

ESTRATÉGIA DE CORTES:
1. Comece com uma introdução interessante (primeiros 5-15% do vídeo)
2. Distribua os clips uniformemente ao longo do vídeo
3. Evite sobreposições entre clips
4. Varie a duração dos clips para criar ritmo
5. Inclua um clip perto do final para fechamento

RETORNE APENAS um array JSON, sem markdown:
[
  {"start_second": N, "end_second": N, "title": "Título descritivo", "event_type": "tipo", "confidence": 0.X}
]

event_type pode ser: "abertura", "destaque", "desenvolvimento", "climax", "fechamento"
confidence deve ser entre 0.6 e 0.95

Gere exatamente ${targetCount} clips bem distribuídos ao longo dos ${videoDuration} segundos.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your workspace.');
      }
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log('AI response received, length:', content.length);

    // Parse JSON from response
    let clips: Array<{ start_second: number; end_second: number; title: string; event_type: string; confidence: number }> = [];
    
    try {
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        clips = JSON.parse(jsonMatch[0]);
        console.log(`Parsed ${clips.length} clips from AI`);
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.log('Raw content:', content.substring(0, 500));
    }

    // Validate clips
    clips = clips.filter(clip => 
      typeof clip.start_second === 'number' &&
      typeof clip.end_second === 'number' &&
      clip.start_second >= 0 &&
      clip.end_second > clip.start_second &&
      clip.end_second <= videoDuration + 60 && // Allow some tolerance
      (clip.end_second - clip.start_second) >= minClipDuration &&
      (clip.end_second - clip.start_second) <= maxClipDuration
    ).slice(0, maxClips);

    // If AI failed, generate fallback clips
    if (clips.length === 0) {
      console.log('Generating fallback clips...');
      clips = generateSmartClips(videoDuration, minClipDuration, maxClipDuration, targetCount, language);
    }

    console.log(`Final clips: ${clips.length}`);

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
      .update({ status: 'ready' })
      .eq('id', projectId);

    console.log('Analysis complete!');

    return new Response(JSON.stringify({ 
      success: true,
      clipsCount: clips.length,
      estimatedDuration: videoDuration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    
    // Update project status to error
    if (projectId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('smart_edit_projects')
          .update({ status: 'error' })
          .eq('id', projectId);
      } catch (e) {
        console.error('Failed to update error status:', e);
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Generate intelligent clips based on video duration
function generateSmartClips(
  duration: number,
  minClipDuration: number,
  maxClipDuration: number,
  count: number,
  language: string
): Array<{ start_second: number; end_second: number; title: string; event_type: string; confidence: number }> {
  const clips: Array<{ start_second: number; end_second: number; title: string; event_type: string; confidence: number }> = [];
  
  const titles = language === 'pt' 
    ? ['Introdução', 'Momento inicial', 'Desenvolvimento', 'Ponto alto', 'Destaque', 'Clímax', 'Momento chave', 'Transição', 'Conclusão', 'Encerramento']
    : language === 'es'
    ? ['Introducción', 'Momento inicial', 'Desarrollo', 'Punto alto', 'Destacado', 'Clímax', 'Momento clave', 'Transición', 'Conclusión', 'Cierre']
    : ['Introduction', 'Opening moment', 'Development', 'Highlight', 'Key moment', 'Climax', 'Peak moment', 'Transition', 'Conclusion', 'Closing'];

  const eventTypes = ['abertura', 'desenvolvimento', 'destaque', 'climax', 'fechamento'];
  
  // Calculate spacing between clips
  const avgClipDuration = (minClipDuration + maxClipDuration) / 2;
  const totalClipTime = avgClipDuration * count;
  const availableGapTime = duration - totalClipTime;
  const gapPerClip = Math.max(5, availableGapTime / (count + 1));

  let currentTime = gapPerClip;

  for (let i = 0; i < count && currentTime < duration - minClipDuration; i++) {
    // Vary clip duration
    const durationVariance = (maxClipDuration - minClipDuration) * 0.5;
    const clipDuration = Math.round(
      avgClipDuration + (Math.random() - 0.5) * durationVariance
    );
    const actualDuration = Math.max(minClipDuration, Math.min(maxClipDuration, clipDuration));

    const start = Math.round(currentTime);
    const end = Math.min(Math.round(currentTime + actualDuration), duration);

    // Determine event type based on position
    let eventType: string;
    const position = i / count;
    if (position < 0.15) eventType = 'abertura';
    else if (position < 0.4) eventType = 'desenvolvimento';
    else if (position < 0.7) eventType = 'destaque';
    else if (position < 0.85) eventType = 'climax';
    else eventType = 'fechamento';

    clips.push({
      start_second: start,
      end_second: end,
      title: titles[i % titles.length],
      event_type: eventType,
      confidence: 0.6 + Math.random() * 0.3
    });

    currentTime = end + gapPerClip;
  }

  return clips;
}
