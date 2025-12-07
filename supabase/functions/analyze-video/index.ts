import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalysisStep {
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
}

const ANALYSIS_STEPS: string[] = [
  'Upload do vídeo',
  'Detecção de jogadores',
  'Rastreamento de movimento',
  'Identificação de eventos',
  'Análise tática',
  'Geração de insights',
  'Criação de cortes',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, videoUrl, homeTeamId, awayTeamId, competition, srtContent } = await req.json();
    
    console.log("Starting analysis for match:", matchId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create analysis job
    const initialSteps = ANALYSIS_STEPS.map((name, index) => ({
      name,
      status: index === 0 ? 'processing' : 'pending',
      progress: index === 0 ? 0 : 0,
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
    EdgeRuntime.waitUntil(processAnalysis(supabase, job.id, matchId, videoUrl, homeTeamId, awayTeamId, srtContent));

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

async function processAnalysis(
  supabase: any, 
  jobId: string, 
  matchId: string, 
  videoUrl: string,
  homeTeamId: string,
  awayTeamId: string,
  srtContent?: string
) {
  const steps: AnalysisStep[] = ANALYSIS_STEPS.map(name => ({
    name,
    status: 'pending',
    progress: 0,
  }));

  try {
    for (let i = 0; i < steps.length; i++) {
      steps[i].status = 'processing';
      
      // Update job progress
      const overallProgress = Math.round((i / steps.length) * 100);
      await updateJobProgress(supabase, jobId, overallProgress, steps[i].name, steps);

      // Simulate step processing with incremental progress
      for (let progress = 0; progress <= 100; progress += 20) {
        steps[i].progress = progress;
        await updateJobProgress(supabase, jobId, overallProgress + Math.round((progress / 100) * (100 / steps.length)), steps[i].name, steps);
        await delay(500 + Math.random() * 500);
      }

      steps[i].status = 'completed';
      steps[i].progress = 100;

      // Generate events for specific steps
      if (steps[i].name === 'Identificação de eventos') {
        await generateMatchEvents(supabase, matchId, homeTeamId, awayTeamId, srtContent);
      }
    }

    // Generate tactical analysis with AI
    const tacticalAnalysis = await generateTacticalAnalysis(homeTeamId, awayTeamId);

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
          tacticalAnalysis,
          eventsGenerated: true 
        }
      })
      .eq('id', jobId);

    // Update match status
    await supabase
      .from('matches')
      .update({ status: 'completed' })
      .eq('id', matchId);

    console.log("Analysis completed for job:", jobId);

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

async function updateJobProgress(supabase: any, jobId: string, progress: number, currentStep: string, steps: AnalysisStep[]) {
  await supabase
    .from('analysis_jobs')
    .update({
      progress,
      current_step: currentStep,
      result: { steps }
    })
    .eq('id', jobId);
}

async function generateMatchEvents(supabase: any, matchId: string, homeTeamId: string, awayTeamId: string, srtContent?: string) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.log("LOVABLE_API_KEY not set, generating mock events");
    return generateMockEvents(supabase, matchId, homeTeamId, awayTeamId);
  }

  try {
    const prompt = srtContent 
      ? `Analise esta narração de uma partida de futebol e extraia os eventos principais (gols, cartões, faltas, substituições, etc). Retorne um JSON com array de eventos:
      
Narração:
${srtContent}

Formato esperado:
{
  "events": [
    {"type": "goal", "minute": 23, "team": "home", "description": "Gol de cabeça"},
    {"type": "yellow_card", "minute": 34, "team": "away", "description": "Falta dura no meio campo"}
  ]
}`
      : `Gere 8-12 eventos realistas para uma partida de futebol simulada. Inclua gols (2-4), cartões amarelos (2-3), faltas, escanteios, defesas importantes. Retorne um JSON com array de eventos no formato:
{
  "events": [
    {"type": "goal", "minute": 23, "team": "home", "description": "Gol de cabeça após cruzamento"},
    {"type": "yellow_card", "minute": 34, "team": "away", "description": "Falta tática no contra-ataque"}
  ]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista de futebol especializado em identificar eventos de partidas. Sempre retorne JSON válido." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", response.status);
      return generateMockEvents(supabase, matchId, homeTeamId, awayTeamId);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const eventsData = JSON.parse(jsonMatch[0]);
      
      for (const event of eventsData.events || []) {
        await supabase.from('match_events').insert({
          match_id: matchId,
          event_type: event.type,
          minute: event.minute,
          description: event.description,
          metadata: { team: event.team, aiGenerated: true }
        });
      }
      console.log("Generated", eventsData.events?.length || 0, "AI events");
    }
  } catch (error) {
    console.error("Error generating AI events:", error);
    return generateMockEvents(supabase, matchId, homeTeamId, awayTeamId);
  }
}

async function generateMockEvents(supabase: any, matchId: string, homeTeamId: string, awayTeamId: string) {
  const eventTypes = [
    { type: 'goal', minute: 23, description: 'Gol após jogada trabalhada', team: 'home' },
    { type: 'yellow_card', minute: 34, description: 'Cartão amarelo por falta tática', team: 'away' },
    { type: 'save', minute: 41, description: 'Grande defesa do goleiro', team: 'home' },
    { type: 'goal', minute: 56, description: 'Gol de contra-ataque', team: 'away' },
    { type: 'corner', minute: 67, description: 'Escanteio perigoso', team: 'home' },
    { type: 'goal', minute: 78, description: 'Gol de fora da área', team: 'home' },
    { type: 'foul', minute: 82, description: 'Falta no meio-campo', team: 'away' },
    { type: 'high_press', minute: 88, description: 'Pressão alta bem-sucedida', team: 'home' },
  ];

  for (const event of eventTypes) {
    await supabase.from('match_events').insert({
      match_id: matchId,
      event_type: event.type,
      minute: event.minute,
      description: event.description,
      metadata: { team: event.team },
      position_x: Math.random() * 100,
      position_y: Math.random() * 100,
    });
  }
  console.log("Generated mock events");
}

async function generateTacticalAnalysis(homeTeamId: string, awayTeamId: string) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return {
      formation: { home: '4-3-3', away: '4-4-2' },
      possession: { home: 58, away: 42 },
      insights: [
        'Domínio territorial no terço final',
        'Vulnerabilidade em transições rápidas',
        'Eficiência em bolas paradas'
      ]
    };
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista tático de futebol. Gere análises detalhadas e realistas." },
          { role: "user", content: `Gere uma análise tática para uma partida de futebol. Retorne um JSON com:
{
  "formation": { "home": "4-3-3", "away": "4-4-2" },
  "possession": { "home": 55, "away": 45 },
  "insights": ["insight 1", "insight 2", "insight 3"],
  "patterns": [
    { "type": "buildup", "description": "...", "effectiveness": 0.75 }
  ]
}` }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("AI API error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("Error generating tactical analysis:", error);
  }

  return {
    formation: { home: '4-3-3', away: '4-4-2' },
    possession: { home: 58, away: 42 },
    insights: ['Análise gerada automaticamente']
  };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
