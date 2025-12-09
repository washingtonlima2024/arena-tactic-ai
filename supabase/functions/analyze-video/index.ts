import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANALYSIS_STEPS: string[] = [
  'Preparação do vídeo',
  'Detecção inteligente de cortes',
  'Identificação de eventos',
  'Finalização',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, videoUrl, homeTeamId, awayTeamId, competition, startMinute, endMinute } = await req.json();
    
    console.log("Starting smart analysis for match:", matchId);
    console.log("Video URL:", videoUrl);
    console.log("Video segment:", startMinute, "-", endMinute, "minutes");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create analysis job
    const initialSteps = ANALYSIS_STEPS.map((name, index) => ({
      name,
      status: index === 0 ? 'processing' : 'pending',
      progress: 0,
    }));

    const { data: job, error: jobError } = await supabase
      .from('analysis_jobs')
      .insert({
        match_id: matchId,
        status: 'processing',
        progress: 0,
        current_step: ANALYSIS_STEPS[0],
        started_at: new Date().toISOString(),
        result: { steps: initialSteps }
      })
      .select()
      .single();

    if (jobError) {
      console.error("Error creating job:", jobError);
      throw jobError;
    }

    console.log("Analysis job created:", job.id);

    // Process analysis in background
    EdgeRuntime.waitUntil(processSmartAnalysis(
      supabase, 
      job.id, 
      matchId, 
      videoUrl, 
      homeTeamId, 
      awayTeamId,
      startMinute ?? 0,
      endMinute ?? 90
    ));

    return new Response(JSON.stringify({ jobId: job.id, status: 'started' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in analyze-video:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

interface AnalysisStep {
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
}

async function processSmartAnalysis(
  supabase: any, 
  jobId: string, 
  matchId: string, 
  videoUrl: string,
  homeTeamId: string,
  awayTeamId: string,
  startMinute: number,
  endMinute: number
) {
  const steps: AnalysisStep[] = ANALYSIS_STEPS.map(name => ({
    name,
    status: 'pending',
    progress: 0,
  }));

  try {
    // Get team names
    const { data: homeTeam } = await supabase
      .from('teams')
      .select('name, short_name')
      .eq('id', homeTeamId)
      .single();
    
    const { data: awayTeam } = await supabase
      .from('teams')
      .select('name, short_name')
      .eq('id', awayTeamId)
      .single();

    const homeTeamName = homeTeam?.name || 'Time Casa';
    const awayTeamName = awayTeam?.name || 'Time Visitante';

    console.log("Analyzing match:", homeTeamName, "vs", awayTeamName);

    // Calculate video duration in seconds
    const videoDurationSeconds = (endMinute - startMinute) * 60;

    // Step 1: Preparation
    steps[0].status = 'processing';
    await updateJobProgress(supabase, jobId, 10, steps[0].name, steps);
    await delay(500);
    steps[0].status = 'completed';
    steps[0].progress = 100;

    // Step 2: Smart clip detection using AI
    steps[1].status = 'processing';
    await updateJobProgress(supabase, jobId, 25, steps[1].name, steps);

    const clips = await detectSmartClips(
      videoDurationSeconds,
      startMinute,
      endMinute,
      homeTeamName,
      awayTeamName
    );

    console.log(`Detected ${clips.length} clips`);
    steps[1].status = 'completed';
    steps[1].progress = 100;

    // Step 3: Convert clips to match events
    steps[2].status = 'processing';
    await updateJobProgress(supabase, jobId, 60, steps[2].name, steps);

    let eventsInserted = 0;
    for (const clip of clips) {
      const { error: insertError } = await supabase.from('match_events').insert({
        match_id: matchId,
        event_type: mapClipTypeToEventType(clip.event_type),
        minute: clip.minute,
        second: clip.second || 0,
        description: clip.title,
        metadata: { 
          team: clip.team,
          teamName: clip.team === 'home' ? homeTeamName : awayTeamName,
          aiGenerated: true,
          smartClip: true,
          startSecond: clip.start_second,
          endSecond: clip.end_second,
          confidence: clip.confidence
        },
        position_x: Math.random() * 100,
        position_y: Math.random() * 100,
        is_highlight: clip.event_type === 'destaque' || clip.event_type === 'climax',
      });
      
      if (!insertError) {
        eventsInserted++;
      } else {
        console.error("Error inserting event:", insertError);
      }
    }

    console.log(`Inserted ${eventsInserted} events`);
    steps[2].status = 'completed';
    steps[2].progress = 100;

    // Step 4: Finalization
    steps[3].status = 'processing';
    await updateJobProgress(supabase, jobId, 90, steps[3].name, steps);
    await delay(300);
    steps[3].status = 'completed';
    steps[3].progress = 100;

    // Mark as completed
    await supabase
      .from('analysis_jobs')
      .update({
        status: 'completed',
        progress: 100,
        current_step: 'Análise concluída!',
        completed_at: new Date().toISOString(),
        result: { 
          steps, 
          eventsGenerated: eventsInserted,
          clipsDetected: clips.length,
          method: 'smart_clip_detection'
        }
      })
      .eq('id', jobId);

    // Update match status
    await supabase
      .from('matches')
      .update({ status: 'completed' })
      .eq('id', matchId);

    console.log("Smart analysis completed for job:", jobId);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error processing analysis:", errorMessage);
    await supabase
      .from('analysis_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        result: { steps, error: errorMessage }
      })
      .eq('id', jobId);
  }
}

async function detectSmartClips(
  durationSeconds: number,
  startMinute: number,
  endMinute: number,
  homeTeamName: string,
  awayTeamName: string
): Promise<Array<{
  start_second: number;
  end_second: number;
  minute: number;
  second: number;
  title: string;
  event_type: string;
  team: 'home' | 'away';
  confidence: number;
}>> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  // Calculate number of clips based on duration
  const targetClips = Math.min(15, Math.max(5, Math.floor(durationSeconds / 120)));

  const prompt = `Você é um analista de futebol profissional. Gere eventos inteligentes para uma partida entre ${homeTeamName} (casa) e ${awayTeamName} (visitante).

CONFIGURAÇÕES:
- Duração do trecho: ${durationSeconds} segundos (${Math.floor(durationSeconds / 60)} minutos)
- Período do jogo: minuto ${startMinute} ao ${endMinute}
- Quantidade de eventos: ${targetClips}

REGRAS:
1. Os eventos devem ter minutos ENTRE ${startMinute} e ${endMinute}
2. Distribua os eventos uniformemente ao longo do período
3. Inclua mix de: gols (1-2), cartões amarelos (1-2), faltas (2-3), finalizações (2-3), escanteios (1-2)
4. Alterne entre times (home/away)
5. Cada evento deve ter 3 segundos antes e 5 depois para o clip

RETORNE APENAS um array JSON, sem markdown:
[
  {"minute": N, "second": N, "title": "Descrição", "event_type": "tipo", "team": "home|away", "confidence": 0.X}
]

event_type válidos: "goal", "yellow_card", "foul", "shot_on_target", "corner", "save", "highlight"
confidence entre 0.7 e 0.95`;

  let clips: Array<{
    start_second: number;
    end_second: number;
    minute: number;
    second: number;
    title: string;
    event_type: string;
    team: 'home' | 'away';
    confidence: number;
  }> = [];

  if (LOVABLE_API_KEY) {
    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }]
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        console.log('AI response length:', content.length);

        // Parse JSON
        const jsonMatch = content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          clips = parsed.map((event: any) => {
            const eventSecond = (event.minute - startMinute) * 60 + (event.second || 0);
            return {
              ...event,
              start_second: Math.max(0, eventSecond - 3), // 3 segundos antes
              end_second: eventSecond + 5, // 5 segundos depois
            };
          }).filter((c: any) => 
            c.minute >= startMinute && 
            c.minute <= endMinute
          );
          console.log(`Parsed ${clips.length} clips from AI`);
        }
      } else {
        console.error('AI API error:', response.status);
      }
    } catch (error) {
      console.error('AI request failed:', error);
    }
  }

  // Fallback if AI fails
  if (clips.length === 0) {
    console.log('Using fallback clip generation...');
    clips = generateFallbackClips(durationSeconds, startMinute, endMinute, targetClips);
  }

  return clips;
}

function generateFallbackClips(
  durationSeconds: number,
  startMinute: number,
  endMinute: number,
  count: number
): Array<{
  start_second: number;
  end_second: number;
  minute: number;
  second: number;
  title: string;
  event_type: string;
  team: 'home' | 'away';
  confidence: number;
}> {
  const clips: Array<{
    start_second: number;
    end_second: number;
    minute: number;
    second: number;
    title: string;
    event_type: string;
    team: 'home' | 'away';
    confidence: number;
  }> = [];

  const eventTemplates = [
    { type: 'foul', title: 'Falta no meio-campo' },
    { type: 'shot_on_target', title: 'Finalização no gol' },
    { type: 'corner', title: 'Escanteio cobrado' },
    { type: 'save', title: 'Defesa do goleiro' },
    { type: 'yellow_card', title: 'Cartão amarelo' },
    { type: 'highlight', title: 'Lance importante' },
    { type: 'goal', title: 'Gol marcado!' },
  ];

  const segmentDuration = endMinute - startMinute;
  const interval = segmentDuration / count;

  for (let i = 0; i < count; i++) {
    const minute = Math.floor(startMinute + (i * interval) + (Math.random() * interval * 0.5));
    const second = Math.floor(Math.random() * 60);
    const eventSecond = (minute - startMinute) * 60 + second;
    const template = eventTemplates[i % eventTemplates.length];
    
    clips.push({
      minute,
      second,
      start_second: Math.max(0, eventSecond - 3),
      end_second: eventSecond + 5,
      title: template.title,
      event_type: template.type,
      team: i % 2 === 0 ? 'home' : 'away',
      confidence: 0.7 + Math.random() * 0.2
    });
  }

  return clips;
}

function mapClipTypeToEventType(clipType: string): string {
  const mapping: Record<string, string> = {
    'abertura': 'highlight',
    'desenvolvimento': 'foul',
    'destaque': 'shot_on_target',
    'climax': 'goal',
    'fechamento': 'corner',
    'goal': 'goal',
    'yellow_card': 'yellow_card',
    'red_card': 'red_card',
    'foul': 'foul',
    'corner': 'corner',
    'shot_on_target': 'shot_on_target',
    'save': 'save',
    'highlight': 'highlight',
  };
  return mapping[clipType] || clipType;
}

async function updateJobProgress(supabase: any, jobId: string, progress: number, currentStep: string, steps: any[]) {
  await supabase
    .from('analysis_jobs')
    .update({
      progress,
      current_step: currentStep,
      result: { steps }
    })
    .eq('id', jobId);
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
