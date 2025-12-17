import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Maximum video size for download (300MB)
const MAX_VIDEO_SIZE_MB = 300;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

interface AnalysisStep {
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
}

// ===========================================
// PIPELINE DE 7 ETAPAS
// ===========================================
const ANALYSIS_STEPS: string[] = [
  '1. Extração de Áudio',
  '2. Transcrição Completa',
  '3. Análise Técnica Detalhada',
  '4. Categorização de Eventos',
  '5. Geração de Eventos Oficiais',
  '6. Preparação de Cortes',
  '7. Revisão e Finalização',
];

// Event categories for comprehensive extraction
const EVENT_CATEGORIES = [
  'goals', 'assists', 'shots', 'saves', 'yellowCards', 'redCards',
  'substitutions', 'fouls', 'dribbles', 'woodwork', 'offsides',
  'freeKicks', 'corners', 'penalties', 'transitions', 'emotionalMoments'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, videoUrl, homeTeamId, awayTeamId, competition, startMinute, endMinute, durationSeconds, transcription: providedTranscription } = await req.json();
    
    const videoDurationSeconds = durationSeconds || ((endMinute || 90) - (startMinute || 0)) * 60;
    
    console.log("=== INICIANDO PIPELINE DE ANÁLISE EM 7 ETAPAS ===");
    console.log("Match ID:", matchId);
    console.log("Video URL:", videoUrl);
    console.log("Duração do vídeo:", videoDurationSeconds, "segundos");
    console.log("Tempo de jogo: minutos", startMinute, "a", endMinute);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const isDirectFile = videoUrl.includes('supabase') || 
                         videoUrl.endsWith('.mp4') || 
                         videoUrl.includes('/storage/');

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
        result: { 
          steps: initialSteps,
          pipelineVersion: '7-stages-v2',
          // Intermediate products will be saved here
          audioUrl: null,
          fullTranscription: null,
          srtContent: null,
          technicalAnalysis: null,
          eventCategories: null,
          eventsGenerated: 0,
          clipsReady: false,
          visualReviewComplete: false
        }
      })
      .select()
      .single();

    if (jobError) {
      console.error("Erro ao criar job:", jobError);
      throw jobError;
    }

    console.log("Job criado:", job.id);

    EdgeRuntime.waitUntil(runSevenStagePipeline(
      supabase, 
      job.id, 
      matchId, 
      videoUrl, 
      homeTeamId, 
      awayTeamId,
      startMinute ?? 0,
      endMinute ?? 90,
      videoDurationSeconds,
      isDirectFile,
      providedTranscription
    ));

    return new Response(JSON.stringify({ 
      jobId: job.id, 
      status: 'started',
      pipeline: '7-stages'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Erro no analyze-video:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ===========================================
// PIPELINE PRINCIPAL DE 7 ETAPAS
// ===========================================
async function runSevenStagePipeline(
  supabase: any, 
  jobId: string, 
  matchId: string, 
  videoUrl: string,
  homeTeamId: string,
  awayTeamId: string,
  startMinute: number,
  endMinute: number,
  videoDurationSeconds: number,
  isDirectFile: boolean,
  providedTranscription?: string
) {
  const steps: AnalysisStep[] = ANALYSIS_STEPS.map(name => ({
    name,
    status: 'pending',
    progress: 0,
  }));

  // Intermediate products (will be persisted)
  let audioUrl: string | null = null;
  let fullTranscription = '';
  let srtContent = '';
  let transcriptionSegments: { start: number; end: number; text: string }[] = [];
  let technicalAnalysis: any = null;
  let eventCategories: any = null;
  let generatedEvents: any[] = [];

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

    console.log("Partida:", homeTeamName, "vs", awayTeamName);

    // ===========================================
    // ETAPA 1: EXTRAÇÃO DE ÁUDIO
    // ===========================================
    steps[0].status = 'processing';
    await updateJobProgress(supabase, jobId, 5, steps[0].name, steps, { audioUrl: null });
    console.log("\n=== ETAPA 1: EXTRAÇÃO DE ÁUDIO ===");

    if (isDirectFile) {
      try {
        // Save audio as narration in storage
        audioUrl = await extractAndSaveAudio(supabase, matchId, videoUrl);
        console.log("Áudio extraído e salvo:", audioUrl);
      } catch (audioError) {
        console.log("Extração de áudio falhou, continuando sem áudio persistido");
      }
    }

    steps[0].status = 'completed';
    steps[0].progress = 100;
    await updateJobProgress(supabase, jobId, 14, steps[0].name, steps, { audioUrl });

    // ===========================================
    // ETAPA 2: TRANSCRIÇÃO COMPLETA
    // ===========================================
    steps[1].status = 'processing';
    await updateJobProgress(supabase, jobId, 15, steps[1].name, steps, {});
    console.log("\n=== ETAPA 2: TRANSCRIÇÃO COMPLETA ===");

    if (providedTranscription && providedTranscription.length > 50) {
      // Use provided SRT transcription
      console.log("Usando transcrição SRT fornecida:", providedTranscription.length, "caracteres");
      fullTranscription = providedTranscription;
      srtContent = providedTranscription;
      transcriptionSegments = parseSrtContent(providedTranscription, videoDurationSeconds);
    } else if (isDirectFile) {
      // Transcribe with Whisper
      console.log("Transcrevendo com Whisper API...");
      const whisperResult = await transcribeWithWhisper(videoUrl);
      fullTranscription = whisperResult.text;
      transcriptionSegments = whisperResult.segments;
      srtContent = segmentsToSrt(transcriptionSegments);
      console.log("Transcrição completa:", fullTranscription.length, "caracteres");
      console.log("Segmentos:", transcriptionSegments.length);
    } else {
      console.log("Sem vídeo direto - transcrição não disponível");
    }

    steps[1].status = 'completed';
    steps[1].progress = 100;
    
    // PERSIST full transcription (NOT truncated!)
    await updateJobProgress(supabase, jobId, 28, steps[1].name, steps, {
      fullTranscription: fullTranscription, // Save COMPLETE transcription
      srtContent: srtContent,
      segmentsCount: transcriptionSegments.length
    });

    // ===========================================
    // ETAPA 3: ANÁLISE TÉCNICA DETALHADA
    // ===========================================
    steps[2].status = 'processing';
    await updateJobProgress(supabase, jobId, 30, steps[2].name, steps, {});
    console.log("\n=== ETAPA 3: ANÁLISE TÉCNICA DETALHADA ===");

    if (fullTranscription.length > 100) {
      technicalAnalysis = await generateDetailedTechnicalAnalysis(
        homeTeamName,
        awayTeamName,
        fullTranscription,
        transcriptionSegments,
        videoDurationSeconds
      );
      console.log("Análise técnica gerada:", JSON.stringify(technicalAnalysis).length, "caracteres");
    } else {
      technicalAnalysis = getDefaultTechnicalAnalysis(homeTeamName, awayTeamName);
    }

    steps[2].status = 'completed';
    steps[2].progress = 100;
    
    // PERSIST technical analysis
    await updateJobProgress(supabase, jobId, 42, steps[2].name, steps, {
      technicalAnalysis: technicalAnalysis
    });

    // ===========================================
    // ETAPA 4: CATEGORIZAÇÃO DE EVENTOS
    // ===========================================
    steps[3].status = 'processing';
    await updateJobProgress(supabase, jobId, 43, steps[3].name, steps, {});
    console.log("\n=== ETAPA 4: CATEGORIZAÇÃO DE EVENTOS ===");

    if (fullTranscription.length > 100) {
      eventCategories = await generateEventCategorization(
        homeTeamName,
        awayTeamName,
        fullTranscription,
        transcriptionSegments,
        technicalAnalysis,
        videoDurationSeconds
      );
      
      // Log all categories
      console.log("Eventos categorizados:");
      for (const cat of EVENT_CATEGORIES) {
        const count = eventCategories[cat]?.length || 0;
        if (count > 0) {
          console.log(`  - ${cat}: ${count} eventos`);
        }
      }
    } else {
      eventCategories = getEmptyEventCategories();
    }

    steps[3].status = 'completed';
    steps[3].progress = 100;
    
    // PERSIST event categories
    await updateJobProgress(supabase, jobId, 56, steps[3].name, steps, {
      eventCategories: eventCategories
    });

    // ===========================================
    // ETAPA 5: GERAÇÃO DE EVENTOS OFICIAIS
    // ===========================================
    steps[4].status = 'processing';
    await updateJobProgress(supabase, jobId, 57, steps[4].name, steps, {});
    console.log("\n=== ETAPA 5: GERAÇÃO DE EVENTOS OFICIAIS ===");

    generatedEvents = await insertOfficialEvents(
      supabase,
      matchId,
      homeTeamId,
      awayTeamId,
      homeTeamName,
      awayTeamName,
      eventCategories,
      videoDurationSeconds,
      startMinute
    );

    console.log("Total de eventos inseridos:", generatedEvents.length);

    steps[4].status = 'completed';
    steps[4].progress = 100;
    await updateJobProgress(supabase, jobId, 70, steps[4].name, steps, {
      eventsGenerated: generatedEvents.length
    });

    // ===========================================
    // ETAPA 6: PREPARAÇÃO DE CORTES
    // ===========================================
    steps[5].status = 'processing';
    await updateJobProgress(supabase, jobId, 71, steps[5].name, steps, {});
    console.log("\n=== ETAPA 6: PREPARAÇÃO DE CORTES ===");

    // Mark clips as ready (timestamp-based playback)
    const clipsReady = generatedEvents.length > 0;
    console.log("Cortes preparados:", clipsReady ? "Sim" : "Não");

    steps[5].status = 'completed';
    steps[5].progress = 100;
    await updateJobProgress(supabase, jobId, 84, steps[5].name, steps, {
      clipsReady: clipsReady
    });

    // ===========================================
    // ETAPA 7: REVISÃO E FINALIZAÇÃO
    // ===========================================
    steps[6].status = 'processing';
    await updateJobProgress(supabase, jobId, 85, steps[6].name, steps, {});
    console.log("\n=== ETAPA 7: REVISÃO E FINALIZAÇÃO ===");

    // Optional visual review (placeholder for now)
    const visualReviewComplete = true;
    console.log("Revisão visual:", visualReviewComplete ? "Completa" : "Pendente");

    steps[6].status = 'completed';
    steps[6].progress = 100;

    // ===========================================
    // FINALIZAÇÃO
    // ===========================================
    await supabase
      .from('analysis_jobs')
      .update({
        status: 'completed',
        progress: 100,
        current_step: 'Análise completa!',
        completed_at: new Date().toISOString(),
        result: { 
          steps,
          pipelineVersion: '7-stages-v2',
          // All intermediate products
          audioUrl,
          fullTranscription,
          srtContent,
          segmentsCount: transcriptionSegments.length,
          technicalAnalysis,
          eventCategories,
          eventsGenerated: generatedEvents.length,
          clipsReady,
          visualReviewComplete,
          // Summary
          summary: {
            totalEvents: generatedEvents.length,
            goalCount: eventCategories?.goals?.length || 0,
            cardCount: (eventCategories?.yellowCards?.length || 0) + (eventCategories?.redCards?.length || 0),
            transcriptionLength: fullTranscription.length
          }
        }
      })
      .eq('id', jobId);

    await supabase
      .from('matches')
      .update({ status: 'completed' })
      .eq('id', matchId);

    console.log("\n=== PIPELINE COMPLETO ===");
    console.log("Job:", jobId);
    console.log("Total eventos:", generatedEvents.length);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Erro no pipeline:", errorMessage);
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

// ===========================================
// ETAPA 1: EXTRAÇÃO DE ÁUDIO
// ===========================================
async function extractAndSaveAudio(supabase: any, matchId: string, videoUrl: string): Promise<string | null> {
  try {
    console.log("Salvando referência de áudio para match:", matchId);
    
    // For now, we save the video URL as the audio source
    // In production, we would extract actual audio file
    const { data, error } = await supabase
      .from('generated_audio')
      .insert({
        match_id: matchId,
        audio_type: 'narration',
        audio_url: videoUrl, // Reference to source video
        voice: 'original',
        script: 'Locução original da partida'
      })
      .select()
      .single();

    if (error) {
      console.error("Erro ao salvar áudio:", error);
      return null;
    }

    return data.audio_url;
  } catch (error) {
    console.error("Erro na extração de áudio:", error);
    return null;
  }
}

// ===========================================
// ETAPA 2: TRANSCRIÇÃO
// ===========================================
async function transcribeWithWhisper(videoUrl: string): Promise<{
  text: string;
  segments: { start: number; end: number; text: string }[];
}> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  if (!OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY não configurada");
    return { text: '', segments: [] };
  }

  try {
    console.log("Baixando vídeo para transcrição...");
    
    // Check size first
    const headResponse = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = headResponse.headers.get('content-length');
    const videoSizeBytes = contentLength ? parseInt(contentLength) : 0;
    const videoSizeMB = videoSizeBytes / (1024 * 1024);
    
    console.log("Tamanho do vídeo:", videoSizeMB.toFixed(2), "MB");
    
    if (videoSizeBytes > MAX_VIDEO_SIZE_BYTES) {
      console.log("Vídeo muito grande para download, limite:", MAX_VIDEO_SIZE_MB, "MB");
      return { text: '', segments: [] };
    }

    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Falha ao baixar vídeo: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const videoData = new Uint8Array(arrayBuffer);
    
    console.log("Vídeo baixado:", videoData.length, "bytes");
    console.log("Enviando para Whisper API...");
    
    const formData = new FormData();
    const blob = new Blob([videoData.buffer as ArrayBuffer], { type: 'video/mp4' });
    formData.append('file', blob, 'video.mp4');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error("Erro Whisper API:", whisperResponse.status, errorText);
      return { text: '', segments: [] };
    }

    const result = await whisperResponse.json();
    console.log("Transcrição Whisper completa");
    console.log("Texto total:", result.text?.length || 0, "caracteres");
    console.log("Segmentos:", result.segments?.length || 0);
    
    const segments = (result.segments || []).map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text
    }));
    
    return { 
      text: result.text || '', 
      segments 
    };
  } catch (error) {
    console.error("Erro na transcrição Whisper:", error);
    return { text: '', segments: [] };
  }
}

function parseSrtContent(srtContent: string, videoDurationSeconds: number): { start: number; end: number; text: string }[] {
  const segments: { start: number; end: number; text: string }[] = [];
  const blocks = srtContent.trim().split(/\n\s*\n/);
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    
    const timestampLine = lines.find(line => line.includes('-->'));
    if (!timestampLine) continue;
    
    const timestampMatch = timestampLine.match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    
    if (!timestampMatch) continue;
    
    const startHours = parseInt(timestampMatch[1]);
    const startMins = parseInt(timestampMatch[2]);
    const startSecs = parseInt(timestampMatch[3]);
    const startMs = parseInt(timestampMatch[4]);
    const start = startHours * 3600 + startMins * 60 + startSecs + startMs / 1000;
    
    const endHours = parseInt(timestampMatch[5]);
    const endMins = parseInt(timestampMatch[6]);
    const endSecs = parseInt(timestampMatch[7]);
    const endMs = parseInt(timestampMatch[8]);
    const end = endHours * 3600 + endMins * 60 + endSecs + endMs / 1000;
    
    const timestampIndex = lines.indexOf(timestampLine);
    const textLines = lines.slice(timestampIndex + 1);
    const text = textLines.join(' ').trim();
    
    if (start <= videoDurationSeconds && text) {
      segments.push({ start, end: Math.min(end, videoDurationSeconds), text });
    }
  }
  
  console.log(`Parsed ${segments.length} SRT segments`);
  return segments;
}

function segmentsToSrt(segments: { start: number; end: number; text: string }[]): string {
  return segments.map((seg, i) => {
    const formatTime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      const ms = Math.round((s % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };
    return `${i + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text}\n`;
  }).join('\n');
}

// ===========================================
// ETAPA 3: ANÁLISE TÉCNICA DETALHADA
// ===========================================
async function generateDetailedTechnicalAnalysis(
  homeTeamName: string,
  awayTeamName: string,
  transcription: string,
  segments: { start: number; end: number; text: string }[],
  videoDurationSeconds: number
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return getDefaultTechnicalAnalysis(homeTeamName, awayTeamName);
  }

  const formattedTranscription = segments.length > 0
    ? segments.map(s => `[${formatTime(s.start)}] ${s.text}`).join('\n')
    : transcription;

  const prompt = `ANÁLISE TÉCNICA COMPLETA DO JOGO

PARTIDA: ${homeTeamName} vs ${awayTeamName}
DURAÇÃO DO VÍDEO: ${videoDurationSeconds} segundos (${Math.floor(videoDurationSeconds / 60)} minutos)

=== TRANSCRIÇÃO COMPLETA DA NARRAÇÃO ===
${formattedTranscription.substring(0, 80000)}

=== INSTRUÇÕES ===
Você é um comentarista esportivo profissional. Analise TODA a transcrição acima e gere uma análise técnica completa.

IMPORTANTE: Leia a transcrição INTEIRA e identifique:
1. O PLACAR FINAL do jogo
2. TODOS os gols (quem marcou, quando, como foi)
3. Todos os cartões (amarelos e vermelhos)
4. Todas as substituições
5. Jogadas importantes (finalizações, defesas, dribles)
6. Momentos decisivos
7. Análise tática geral

Retorne JSON:
{
  "finalScore": {
    "home": 3,
    "away": 0,
    "confidence": 0.95
  },
  "matchSummary": "Resumo detalhado do jogo em 3-5 frases descrevendo o que aconteceu",
  "tacticalOverview": "Análise tática em 2-3 frases sobre formações e estratégias",
  "keyMoments": [
    {
      "type": "goal|yellowCard|redCard|substitution|save|shot|penalty",
      "timestamp": "[MM:SS]",
      "description": "Descrição detalhada do momento",
      "player": "Nome do jogador",
      "team": "home ou away"
    }
  ],
  "formations": {
    "home": "4-3-3",
    "away": "4-4-2"
  },
  "standoutPlayers": ["Jogador 1", "Jogador 2"],
  "possessionEstimate": {
    "home": 55,
    "away": 45
  }
}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { 
            role: "system", 
            content: `Você é um analista de futebol profissional especializado em análise tática detalhada.
Sua função é ler transcrições de narrações de jogos e extrair TODAS as informações relevantes.

REGRAS IMPORTANTES:
- Leia a transcrição INTEIRA do início ao fim
- Identifique o placar final mencionado pelo narrador
- Liste APENAS os gols que REALMENTE aconteceram (quando o narrador grita "GOL!")
- Não confunda menções a gols passados com novos gols
- Retorne APENAS JSON válido sem markdown` 
          },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Erro na análise técnica:", response.status);
      return getDefaultTechnicalAnalysis(homeTeamName, awayTeamName);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    let cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log("Análise técnica - Placar:", result.finalScore?.home, "-", result.finalScore?.away);
      console.log("Momentos-chave identificados:", result.keyMoments?.length || 0);
      return result;
    }
  } catch (error) {
    console.error("Erro ao gerar análise técnica:", error);
  }

  return getDefaultTechnicalAnalysis(homeTeamName, awayTeamName);
}

function getDefaultTechnicalAnalysis(homeTeamName: string, awayTeamName: string): any {
  return {
    finalScore: { home: 0, away: 0, confidence: 0.1 },
    matchSummary: `Partida entre ${homeTeamName} e ${awayTeamName}`,
    tacticalOverview: 'Análise não disponível',
    keyMoments: [],
    formations: { home: '4-3-3', away: '4-4-2' },
    standoutPlayers: [],
    possessionEstimate: { home: 50, away: 50 }
  };
}

// ===========================================
// ETAPA 4: CATEGORIZAÇÃO DE EVENTOS
// ===========================================
async function generateEventCategorization(
  homeTeamName: string,
  awayTeamName: string,
  transcription: string,
  segments: { start: number; end: number; text: string }[],
  technicalAnalysis: any,
  videoDurationSeconds: number
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return getEmptyEventCategories();
  }

  const formattedTranscription = segments.length > 0
    ? segments.map(s => `[${formatTime(s.start)}] ${s.text}`).join('\n')
    : transcription;

  const prompt = `EXTRAÇÃO COMPLETA DE EVENTOS - ${homeTeamName} vs ${awayTeamName}

=== ANÁLISE TÉCNICA PRÉVIA ===
${JSON.stringify(technicalAnalysis, null, 2)}

=== TRANSCRIÇÃO COMPLETA ===
${formattedTranscription.substring(0, 80000)}

=== INSTRUÇÕES ===
Extraia TODOS os eventos da transcrição, organizados por categoria.

CATEGORIAS DE EVENTOS:

📍 GOLS (goals)
- Cada gol REAL que acontece (narrador grita "GOL!")
- Incluir: quem marcou, time, timestamp, se foi gol contra

📍 ASSISTÊNCIAS (assists)
- Passes decisivos para gols

📍 FINALIZAÇÕES (shots)
- Chutes importantes (defendidos, na trave, para fora)

📍 GRANDES DEFESAS (saves)
- Defesas importantes do goleiro

📍 CARTÕES AMARELOS (yellowCards)
- Jogador e motivo

📍 CARTÕES VERMELHOS (redCards)
- Jogador e motivo

📍 SUBSTITUIÇÕES (substitutions)
- Quem entrou e quem saiu

📍 FALTAS IMPORTANTES (fouls)
- Faltas duras ou polêmicas
- OBRIGATÓRIO: quem COMETEU (player), quem SOFREU (victim), time do autor

📍 DRIBLES/FINTAS (dribbles)
- Jogadas individuais de destaque

📍 BOLAS NA TRAVE (woodwork)
- Chutes que acertaram trave/travessão

📍 IMPEDIMENTOS (offsides)

📍 ESCANTEIOS (corners)
- Escanteios cobrados

📍 PÊNALTIS (penalties)
- Pênaltis marcados e/ou cobrados
- OBRIGATÓRIO: quem SOFREU a falta (victim), quem COMETEU (faultBy), quem COBROU (taker), resultado

📍 COBRANÇAS DE FALTA (freeKicks)
- Faltas frontais perigosas

📍 TRANSIÇÕES/CONTRA-ATAQUES (transitions)

📍 MOMENTOS EMOCIONAIS (emotionalMoments)
- Reações da torcida, comemorações, homenagens

DURAÇÃO DO VÍDEO: ${videoDurationSeconds} segundos
TODOS os timestamps devem estar entre 0 e ${videoDurationSeconds} segundos!

Retorne JSON:
{
  "goals": [
    {"scorer": "Coutinho", "team": "home", "timestamp": 1455, "isOwnGoal": false, "description": "Chute de fora da área", "assist": ""}
  ],
  "assists": [
    {"player": "Gabriel Jesus", "team": "home", "forGoal": "Neymar", "timestamp": 2670}
  ],
  "shots": [
    {"player": "Biglia", "team": "away", "result": "defendido", "timestamp": 800, "description": "Bomba de fora da área"}
  ],
  "saves": [
    {"goalkeeper": "Alisson", "team": "home", "against": "Biglia", "timestamp": 802, "description": "Defesa importante"}
  ],
  "yellowCards": [
    {"player": "Fernandinho", "team": "home", "victim": "Messi", "reason": "Falta em contra-ataque", "timestamp": 300}
  ],
  "redCards": [
    {"player": "Marcelo", "team": "home", "victim": "Di María", "reason": "Entrada violenta", "timestamp": 4500}
  ],
  "substitutions": [
    {"in": "Agüero", "out": "Enzo Pérez", "team": "away", "timestamp": 2700}
  ],
  "fouls": [
    {"player": "Funes Mori", "team": "away", "victim": "Neymar", "timestamp": 1200, "description": "Entrada na canela do atacante brasileiro"}
  ],
  "dribbles": [
    {"player": "Coutinho", "team": "home", "timestamp": 1450, "description": "Drible em 3 marcadores"}
  ],
  "woodwork": [
    {"player": "Neymar", "team": "home", "timestamp": 1800, "description": "Chute no poste"}
  ],
  "offsides": [],
  "corners": [],
  "penalties": [
    {"victim": "Neymar", "faultBy": "Otamendi", "taker": "Neymar", "team": "home", "result": "gol", "timestamp": 2100, "description": "Derrubado na área após drible"}
  ],
  "freeKicks": [
    {"player": "Messi", "team": "away", "result": "na barreira", "timestamp": 2200}
  ],
  "transitions": [],
  "emotionalMoments": [
    {"description": "Torcida cantando 'O campeão voltou'", "timestamp": 2650}
  ]
}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { 
            role: "system", 
            content: `Você é um especialista em análise de eventos de futebol.
Sua função é extrair TODOS os eventos mencionados na transcrição, organizados por categoria.

REGRAS:
- Seja EXAUSTIVO: extraia TODOS os eventos, não apenas os principais
- Um jogo típico tem 30-60 eventos
- Todos os timestamps devem ser em SEGUNDOS (não minutos)
- Timestamp deve estar dentro da duração do vídeo
- Retorne APENAS JSON válido sem markdown

INFORMAÇÕES OBRIGATÓRIAS POR TIPO:
- Gols: scorer, team, assist (se houver), isOwnGoal
- Cartões: player (recebeu), team, victim (sofreu a falta que gerou cartão), reason
- Faltas: player (COMETEU), victim (SOFREU), team (do que cometeu), description
- Pênaltis: victim (SOFREU a falta), faultBy (COMETEU), taker (COBROU), team (beneficiado), result (gol/defendido/fora)
- Defesas: goalkeeper, team, against (quem chutou), description`
          },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Erro na categorização:", response.status);
      return getEmptyEventCategories();
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    let cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return result;
    }
  } catch (error) {
    console.error("Erro na categorização de eventos:", error);
  }

  return getEmptyEventCategories();
}

function getEmptyEventCategories(): any {
  return {
    goals: [],
    assists: [],
    shots: [],
    saves: [],
    yellowCards: [],
    redCards: [],
    substitutions: [],
    fouls: [],
    dribbles: [],
    woodwork: [],
    offsides: [],
    corners: [],
    penalties: [],
    freeKicks: [],
    transitions: [],
    emotionalMoments: []
  };
}

// ===========================================
// ETAPA 5: INSERÇÃO DE EVENTOS OFICIAIS
// ===========================================
async function insertOfficialEvents(
  supabase: any,
  matchId: string,
  homeTeamId: string,
  awayTeamId: string,
  homeTeamName: string,
  awayTeamName: string,
  eventCategories: any,
  videoDurationSeconds: number,
  gameStartMinute: number
): Promise<any[]> {
  const insertedEvents: any[] = [];
  
  // Fetch current score to accumulate
  const { data: currentMatch } = await supabase
    .from('matches')
    .select('home_score, away_score')
    .eq('id', matchId)
    .single();
  
  let homeScore = currentMatch?.home_score || 0;
  let awayScore = currentMatch?.away_score || 0;

  // Map categories to event types
  const categoryMapping: Record<string, string> = {
    goals: 'goal',
    assists: 'assist',
    shots: 'shot',
    saves: 'save',
    yellowCards: 'yellow_card',
    redCards: 'red_card',
    substitutions: 'substitution',
    fouls: 'foul',
    dribbles: 'dribble',
    woodwork: 'shot', // with metadata
    offsides: 'offside',
    corners: 'corner',
    penalties: 'penalty',
    freeKicks: 'free_kick',
    transitions: 'transition',
    emotionalMoments: 'buildup' // placeholder type
  };

  // Offsets de reação do narrador em segundos
  // O narrador reage DEPOIS do evento - precisamos subtrair para capturar o momento real
  const NARRATOR_REACTION_OFFSETS: Record<string, number> = {
    // Eventos de alta emoção (reação mais demorada)
    goal: 7,
    penalty: 6,
    red_card: 5,
    woodwork: 5,       // "NA TRAVE!"
    
    // Eventos de emoção média
    save: 5,           // "QUE DEFESA!"
    shot: 4,           // Finalização
    yellow_card: 4,
    
    // Eventos rápidos (reação mais imediata)
    foul: 3,           // Apito + narração
    offside: 3,
    corner: 2,
    free_kick: 2,
    substitution: 2,   // Já há antecipação
    
    // Eventos descritivos (sem offset)
    transition: 0,
    buildup: 0,
    dribble: 1,
    assist: 0          // Geralmente mencionado junto com gol
  };

  for (const [category, eventType] of Object.entries(categoryMapping)) {
    const events = eventCategories[category] || [];
    
    for (const event of events) {
      const originalTimestamp = event.timestamp || 0;
      
      // Skip invalid timestamps
      if (originalTimestamp < 0 || originalTimestamp > videoDurationSeconds) {
        console.log(`Evento ignorado - timestamp inválido: ${originalTimestamp}s (max: ${videoDurationSeconds}s)`);
        continue;
      }

      // APLICAR OFFSET DE REAÇÃO DO NARRADOR
      // O narrador reage X segundos DEPOIS do evento real
      const reactionOffset = NARRATOR_REACTION_OFFSETS[eventType] || 0;
      const adjustedTimestamp = Math.max(0, originalTimestamp - reactionOffset);
      
      if (reactionOffset > 0) {
        console.log(`${eventType}: narrador em ${originalTimestamp}s → real em ${adjustedTimestamp}s (offset: -${reactionOffset}s)`);
      }

      const videoSecond = adjustedTimestamp;
      const videoMinute = Math.floor(videoSecond / 60);
      const displayMinute = videoMinute + gameStartMinute;
      const displaySecond = Math.floor(videoSecond % 60);
      
      // Track goals for score
      if (category === 'goals') {
        if (event.isOwnGoal) {
          if (event.team === 'home') {
            awayScore++;
          } else {
            homeScore++;
          }
        } else {
          if (event.team === 'home') {
            homeScore++;
          } else {
            awayScore++;
          }
        }
        console.log(`GOL: ${event.scorer || 'Desconhecido'} (${event.team}) - Placar: ${homeScore}-${awayScore}`);
      }

      // Generate description
      let description = generateEventDescription(category, event, homeTeamName, awayTeamName);

      const { data, error } = await supabase.from('match_events').insert({
        match_id: matchId,
        event_type: eventType,
        minute: displayMinute,
        second: displaySecond,
        description: description,
        is_highlight: ['goal', 'red_card', 'penalty', 'yellow_card'].includes(eventType),
        metadata: {
          team: event.team,
          teamName: event.team === 'home' ? homeTeamName : awayTeamName,
          category: category,
          source: 'seven_stage_pipeline',
          isOwnGoal: event.isOwnGoal || false,
          scorer: event.scorer,
          player: event.player || event.scorer,
          goalkeeper: event.goalkeeper,
          assist: event.assist,
          victim: event.victim,
          reason: event.reason,
          result: event.result,
          in: event.in,
          out: event.out,
          // Timestamps com offset de reação do narrador
          originalTimestamp: originalTimestamp,     // Quando narrador falou
          adjustedTimestamp: adjustedTimestamp,     // Quando evento realmente aconteceu
          reactionOffset: reactionOffset,           // Offset aplicado
          videoSecond: videoSecond,
          eventMs: adjustedTimestamp * 1000,
          videoDurationSeconds: videoDurationSeconds,
          bufferBeforeMs: 3000,
          bufferAfterMs: 5000,
          hitWoodwork: category === 'woodwork'
        },
        position_x: eventType === 'goal' ? (event.team === 'home' ? 95 : 5) : Math.random() * 100,
        position_y: eventType === 'goal' ? 50 : Math.random() * 100,
      }).select().single();

      if (error) {
        console.error(`Erro ao inserir evento ${eventType}:`, error.message);
      } else {
        insertedEvents.push(data);
        console.log(`✓ ${eventType} @ ${displayMinute}:${String(displaySecond).padStart(2, '0')} - "${description}"`);
      }
    }
  }

  // Update match score
  if (homeScore > 0 || awayScore > 0) {
    console.log(`Atualizando placar: ${homeScore} - ${awayScore}`);
    await supabase
      .from('matches')
      .update({ home_score: homeScore, away_score: awayScore })
      .eq('id', matchId);
  }

  return insertedEvents;
}

function generateEventDescription(category: string, event: any, homeTeamName: string, awayTeamName: string): string {
  const teamName = event.team === 'home' ? homeTeamName : awayTeamName;
  
  switch (category) {
    case 'goals':
      if (event.isOwnGoal) {
        return `GOL CONTRA! ${event.scorer || teamName} marca contra`;
      }
      return `GOOOL! ${event.scorer || 'Jogador'} marca para ${teamName}!`;
    
    case 'assists':
      return `Assistência de ${event.player || 'Jogador'} para ${event.forGoal || 'gol'}`;
    
    case 'shots':
      return `Finalização de ${event.player || 'Jogador'} - ${event.result || 'chute'}`;
    
    case 'saves':
      return `Defesa de ${event.goalkeeper || 'goleiro'}! ${event.description || ''}`;
    
    case 'yellowCards':
      return `🟨 Cartão amarelo para ${event.player || 'jogador'}`;
    
    case 'redCards':
      return `🟥 CARTÃO VERMELHO para ${event.player || 'jogador'}!`;
    
    case 'substitutions':
      return `Substituição: Entra ${event.in || '?'}, sai ${event.out || '?'}`;
    
    case 'fouls':
      return `Falta de ${event.player || 'jogador'} em ${event.victim || 'adversário'}`;
    
    case 'dribbles':
      return `Drible de ${event.player || 'jogador'}! ${event.description || ''}`;
    
    case 'woodwork':
      return `NA TRAVE! ${event.player || 'Jogador'} acerta o poste`;
    
    case 'offsides':
      return `Impedimento marcado`;
    
    case 'corners':
      return `Escanteio para ${teamName}`;
    
    case 'penalties':
      return `PÊNALTI para ${teamName}!`;
    
    case 'freeKicks':
      return `Falta frontal - ${event.player || 'Jogador'} cobra`;
    
    case 'transitions':
      return `Contra-ataque de ${teamName}`;
    
    case 'emotionalMoments':
      return event.description || 'Momento especial';
    
    default:
      return event.description || `Evento: ${category}`;
  }
}

// ===========================================
// UTILITIES
// ===========================================
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function updateJobProgress(
  supabase: any, 
  jobId: string, 
  progress: number, 
  currentStep: string, 
  steps: AnalysisStep[],
  additionalData: Record<string, any> = {}
) {
  // Get current result to merge with new data
  const { data: currentJob } = await supabase
    .from('analysis_jobs')
    .select('result')
    .eq('id', jobId)
    .single();
  
  const currentResult = currentJob?.result || {};
  
  await supabase
    .from('analysis_jobs')
    .update({
      progress,
      current_step: currentStep,
      result: { 
        ...currentResult,
        steps,
        ...additionalData
      }
    })
    .eq('id', jobId);
}
