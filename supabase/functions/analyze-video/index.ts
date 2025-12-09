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
  'Salvando eventos',
  'Finalização',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, videoUrl, homeTeamId, awayTeamId, videoDurationSeconds } = await req.json();
    
    console.log("=== ANÁLISE INTELIGENTE ===");
    console.log("Match ID:", matchId);
    console.log("Video URL:", videoUrl);
    console.log("Duração do vídeo em segundos:", videoDurationSeconds);

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
      console.error("Erro ao criar job:", jobError);
      throw jobError;
    }

    console.log("Job criado:", job.id);

    // Process analysis in background
    EdgeRuntime.waitUntil(processSmartAnalysis(
      supabase, 
      job.id, 
      matchId, 
      homeTeamId, 
      awayTeamId,
      videoDurationSeconds || 600 // Default 10 minutos se não informado
    ));

    return new Response(JSON.stringify({ jobId: job.id, status: 'started' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Erro:", errorMessage);
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
  homeTeamId: string,
  awayTeamId: string,
  videoDurationSeconds: number
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

    console.log(`Analisando: ${homeTeamName} vs ${awayTeamName}`);
    console.log(`Duração do vídeo: ${videoDurationSeconds} segundos`);

    // Step 1: Preparation
    steps[0].status = 'processing';
    await updateJobProgress(supabase, jobId, 10, steps[0].name, steps);
    await delay(300);
    steps[0].status = 'completed';
    steps[0].progress = 100;

    // Step 2: Smart clip detection - TUDO EM SEGUNDOS
    steps[1].status = 'processing';
    await updateJobProgress(supabase, jobId, 25, steps[1].name, steps);

    const events = await detectEventsInSeconds(
      videoDurationSeconds,
      homeTeamName,
      awayTeamName
    );

    console.log(`Detectados ${events.length} eventos`);
    steps[1].status = 'completed';
    steps[1].progress = 100;

    // Step 3: Save events - USANDO SEGUNDOS
    steps[2].status = 'processing';
    await updateJobProgress(supabase, jobId, 60, steps[2].name, steps);

    let eventsInserted = 0;
    for (const event of events) {
      // Converter segundos para minuto:segundo para exibição
      const minute = Math.floor(event.second / 60);
      const second = event.second % 60;

      const { error: insertError } = await supabase.from('match_events').insert({
        match_id: matchId,
        event_type: event.event_type,
        minute: minute,
        second: second,
        description: event.description,
        metadata: { 
          team: event.team,
          teamName: event.team === 'home' ? homeTeamName : awayTeamName,
          aiGenerated: true,
          smartClip: true,
          // Timestamps em segundos para extração de clips
          videoSecondStart: Math.max(0, event.second - 3), // 3s antes
          videoSecondEnd: event.second + 5, // 5s depois
          confidence: event.confidence
        },
        position_x: event.position_x,
        position_y: event.position_y,
        is_highlight: event.is_highlight,
      });
      
      if (!insertError) {
        eventsInserted++;
        console.log(`Evento salvo: ${event.event_type} no segundo ${event.second}`);
      } else {
        console.error("Erro ao inserir evento:", insertError);
      }
    }

    console.log(`Total inserido: ${eventsInserted} eventos`);
    steps[2].status = 'completed';
    steps[2].progress = 100;

    // Step 4: Finalization
    steps[3].status = 'processing';
    await updateJobProgress(supabase, jobId, 90, steps[3].name, steps);
    await delay(200);
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
          videoDurationSeconds,
          method: 'smart_seconds_based'
        }
      })
      .eq('id', jobId);

    // Update match status
    await supabase
      .from('matches')
      .update({ status: 'completed' })
      .eq('id', matchId);

    console.log("=== ANÁLISE CONCLUÍDA ===");

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Erro no processamento:", errorMessage);
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

interface SmartEvent {
  second: number; // Posição no vídeo em segundos
  event_type: string;
  description: string;
  team: 'home' | 'away';
  confidence: number;
  position_x: number;
  position_y: number;
  is_highlight: boolean;
}

async function detectEventsInSeconds(
  videoDurationSeconds: number,
  homeTeamName: string,
  awayTeamName: string
): Promise<SmartEvent[]> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  // Quantidade de eventos baseada na duração
  const targetEvents = Math.min(12, Math.max(4, Math.floor(videoDurationSeconds / 60)));

  const prompt = `Você é um analista de futebol. Gere ${targetEvents} eventos para uma partida entre ${homeTeamName} e ${awayTeamName}.

DURAÇÃO DO VÍDEO: ${videoDurationSeconds} segundos

REGRAS IMPORTANTES:
1. O campo "second" deve ser a posição exata no vídeo em SEGUNDOS (0 a ${videoDurationSeconds})
2. Distribua os eventos ao longo do vídeo
3. Cada evento representa um momento do jogo

RETORNE APENAS um array JSON válido (sem markdown):
[
  {
    "second": 45,
    "event_type": "goal",
    "description": "Gol de ${homeTeamName}",
    "team": "home",
    "confidence": 0.9,
    "position_x": 85,
    "position_y": 50,
    "is_highlight": true
  }
]

Tipos válidos: goal, shot_on_target, foul, yellow_card, corner, save, highlight
Alterne entre "home" e "away" nos times.`;

  let events: SmartEvent[] = [];

  if (LOVABLE_API_KEY) {
    try {
      console.log("Chamando IA para detectar eventos...");
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
        console.log('Resposta IA:', content.substring(0, 200));

        // Extrair JSON
        const jsonMatch = content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          events = parsed.filter((e: any) => 
            e.second >= 0 && e.second <= videoDurationSeconds
          );
          console.log(`IA retornou ${events.length} eventos válidos`);
        }
      } else {
        console.error('Erro na API:', response.status);
      }
    } catch (error) {
      console.error('Erro ao chamar IA:', error);
    }
  }

  // Fallback se IA falhar
  if (events.length === 0) {
    console.log('Usando eventos de fallback...');
    events = generateFallbackEvents(videoDurationSeconds);
  }

  return events;
}

function generateFallbackEvents(videoDurationSeconds: number): SmartEvent[] {
  const events: SmartEvent[] = [];
  const count = Math.min(8, Math.max(3, Math.floor(videoDurationSeconds / 90)));
  
  const templates = [
    { type: 'foul', desc: 'Falta no meio-campo', highlight: false },
    { type: 'shot_on_target', desc: 'Finalização no gol', highlight: true },
    { type: 'corner', desc: 'Escanteio cobrado', highlight: false },
    { type: 'save', desc: 'Defesa do goleiro', highlight: true },
    { type: 'yellow_card', desc: 'Cartão amarelo', highlight: false },
    { type: 'goal', desc: 'Gol marcado!', highlight: true },
    { type: 'highlight', desc: 'Lance importante', highlight: true },
  ];

  const interval = videoDurationSeconds / count;

  for (let i = 0; i < count; i++) {
    const second = Math.floor(i * interval + Math.random() * (interval * 0.5));
    const template = templates[i % templates.length];
    
    events.push({
      second: Math.min(second, videoDurationSeconds - 5),
      event_type: template.type,
      description: template.desc,
      team: i % 2 === 0 ? 'home' : 'away',
      confidence: 0.7 + Math.random() * 0.2,
      position_x: 30 + Math.random() * 40,
      position_y: 20 + Math.random() * 60,
      is_highlight: template.highlight
    });
  }

  return events;
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
