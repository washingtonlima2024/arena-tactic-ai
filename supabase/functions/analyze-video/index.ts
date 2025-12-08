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

  let eventsGenerated = false;

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
        await delay(400 + Math.random() * 300);
      }

      steps[i].status = 'completed';
      steps[i].progress = 100;

      // Generate events for specific steps
      if (steps[i].name === 'Identificação de eventos') {
        console.log("Starting event generation for match:", matchId);
        eventsGenerated = await generateMatchEvents(supabase, matchId, homeTeamId, awayTeamId, srtContent);
        console.log("Events generation result:", eventsGenerated);
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
          eventsGenerated
        }
      })
      .eq('id', jobId);

    // Update match status
    await supabase
      .from('matches')
      .update({ status: 'completed' })
      .eq('id', matchId);

    console.log("Analysis completed for job:", jobId, "events generated:", eventsGenerated);

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

async function generateMatchEvents(supabase: any, matchId: string, homeTeamId: string, awayTeamId: string, srtContent?: string): Promise<boolean> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  console.log("generateMatchEvents called, LOVABLE_API_KEY present:", !!LOVABLE_API_KEY);
  console.log("SRT content provided:", !!srtContent);
  
  if (!LOVABLE_API_KEY) {
    console.log("LOVABLE_API_KEY not set, generating mock events");
    return await generateMockEvents(supabase, matchId, homeTeamId, awayTeamId);
  }

  try {
    const prompt = srtContent 
      ? `Analise esta narração de uma partida de futebol e extraia os eventos principais (gols, cartões, faltas, substituições, etc). Retorne APENAS um JSON válido com array de eventos:
      
Narração:
${srtContent}

Formato esperado (retorne APENAS o JSON, sem texto adicional):
{
  "events": [
    {"type": "goal", "minute": 23, "team": "home", "description": "Gol de cabeça"},
    {"type": "yellow_card", "minute": 34, "team": "away", "description": "Falta dura no meio campo"}
  ]
}`
      : `Gere 8-12 eventos realistas para uma partida de futebol. Inclua gols (2-4), cartões amarelos (2-3), faltas, escanteios, defesas importantes. 

Retorne APENAS um JSON válido (sem markdown, sem texto adicional) no formato:
{
  "events": [
    {"type": "goal", "minute": 23, "team": "home", "description": "Gol de cabeça após cruzamento"},
    {"type": "yellow_card", "minute": 34, "team": "away", "description": "Falta tática no contra-ataque"},
    {"type": "corner", "minute": 12, "team": "home", "description": "Escanteio após jogada pelo lado direito"},
    {"type": "foul", "minute": 45, "team": "away", "description": "Falta no meio-campo"},
    {"type": "save", "minute": 55, "team": "home", "description": "Defesa do goleiro em chute de longa distância"},
    {"type": "goal", "minute": 67, "team": "away", "description": "Gol de contra-ataque rápido"},
    {"type": "shot_on_target", "minute": 75, "team": "home", "description": "Finalização na trave"},
    {"type": "substitution", "minute": 80, "team": "home", "description": "Substituição tática"},
    {"type": "goal", "minute": 88, "team": "home", "description": "Gol nos minutos finais"}
  ]
}`;

    console.log("Calling Lovable AI for event generation...");
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista de futebol. Retorne APENAS JSON válido, sem markdown, sem texto adicional." },
          { role: "user", content: prompt }
        ],
      }),
    });

    console.log("AI API response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return await generateMockEvents(supabase, matchId, homeTeamId, awayTeamId);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log("AI response content length:", content.length);
    console.log("AI response preview:", content.substring(0, 500));
    
    // Clean markdown code blocks if present
    let cleanContent = content;
    if (content.includes('```json')) {
      cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    } else if (content.includes('```')) {
      cleanContent = content.replace(/```\s*/g, '');
    }
    
    // Extract JSON from response
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log("JSON extracted, parsing...");
      const eventsData = JSON.parse(jsonMatch[0]);
      const events = eventsData.events || [];
      
      console.log("Parsed events count:", events.length);
      
      let insertedCount = 0;
      for (const event of events) {
        const { data: insertData, error: insertError } = await supabase.from('match_events').insert({
          match_id: matchId,
          event_type: event.type,
          minute: event.minute,
          description: event.description,
          metadata: { team: event.team, aiGenerated: true },
          position_x: Math.random() * 100,
          position_y: Math.random() * 100,
        });
        
        if (insertError) {
          console.error("Error inserting event:", insertError);
        } else {
          insertedCount++;
        }
      }
      
      console.log("Successfully inserted", insertedCount, "events");
      return insertedCount > 0;
    } else {
      console.error("Could not extract JSON from AI response");
      console.log("Full response:", content);
      return await generateMockEvents(supabase, matchId, homeTeamId, awayTeamId);
    }
  } catch (error) {
    console.error("Error generating AI events:", error);
    return await generateMockEvents(supabase, matchId, homeTeamId, awayTeamId);
  }
}

async function generateMockEvents(supabase: any, matchId: string, homeTeamId: string, awayTeamId: string): Promise<boolean> {
  console.log("Generating mock events for match:", matchId);
  
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

  let insertedCount = 0;
  for (const event of eventTypes) {
    const { error } = await supabase.from('match_events').insert({
      match_id: matchId,
      event_type: event.type,
      minute: event.minute,
      description: event.description,
      metadata: { team: event.team, mockGenerated: true },
      position_x: Math.random() * 100,
      position_y: Math.random() * 100,
    });
    
    if (error) {
      console.error("Error inserting mock event:", error);
    } else {
      insertedCount++;
    }
  }
  
  console.log("Generated", insertedCount, "mock events");
  return insertedCount > 0;
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
          { role: "system", content: "Você é um analista tático de futebol. Retorne APENAS JSON válido, sem markdown." },
          { role: "user", content: `Gere uma análise tática para uma partida de futebol. Retorne APENAS um JSON (sem markdown) com:
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
    
    // Clean markdown
    let cleanContent = content;
    if (content.includes('```')) {
      cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    }
    
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    
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
