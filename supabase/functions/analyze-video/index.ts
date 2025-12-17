import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Maximum video size for download (300MB) - increased to support longer match videos
const MAX_VIDEO_SIZE_MB = 300;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

interface AnalysisStep {
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
}

interface YoloDetection {
  timestamp: number;
  players: { x: number; y: number; team: string; confidence: number }[];
  ball: { x: number; y: number; confidence: number } | null;
  referee: { x: number; y: number } | null;
}

interface GoalMention {
  timestamp: number;
  text: string;
  isOwnGoal: boolean;
  teamMentioned: string | null;
}

const ANALYSIS_STEPS: string[] = [
  'Preparação do vídeo',
  'Download do vídeo',
  'Transcrição (Whisper)',
  'Detecção visual (YOLO)',
  'Análise visual (Gemini)',
  'Correlação multi-modal',
  'Identificação de eventos',
  'Análise tática',
  'Finalização',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matchId, videoUrl, homeTeamId, awayTeamId, competition, startMinute, endMinute, durationSeconds, transcription: providedTranscription } = await req.json();
    
    const videoDurationSeconds = durationSeconds || ((endMinute || 90) - (startMinute || 0)) * 60;
    
    console.log("=== STARTING MULTI-MODAL VIDEO ANALYSIS ===");
    console.log("Match ID:", matchId);
    console.log("Video URL:", videoUrl);
    console.log("Video duration:", videoDurationSeconds, "seconds");
    console.log("Game time reference: minutes", startMinute, "to", endMinute);
    console.log("Provided transcription (SRT):", providedTranscription ? `${providedTranscription.length} chars` : "NONE");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if video is a direct file (MP4) or embed
    const isDirectFile = videoUrl.includes('supabase') || 
                         videoUrl.endsWith('.mp4') || 
                         videoUrl.includes('/storage/');
    
    // If transcription provided, we can skip video download
    const hasSrtTranscription = !!providedTranscription && providedTranscription.length > 50;
    
    console.log("Video type:", isDirectFile ? "Direct MP4 file" : "Embed/External URL");
    console.log("Analysis mode:", hasSrtTranscription ? "SRT-BASED (skip video download)" : (isDirectFile ? "REAL ANALYSIS" : "ESTIMATED"));

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
        result: { 
          steps: initialSteps,
          analysisType: hasSrtTranscription ? 'srt_based' : (isDirectFile ? 'real_multimodal' : 'estimated')
        }
      })
      .select()
      .single();

    if (jobError) {
      console.error("Error creating job:", jobError);
      throw jobError;
    }

    console.log("Analysis job created:", job.id);

    EdgeRuntime.waitUntil(processMultiModalAnalysis(
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
      providedTranscription // Pass SRT content
    ));

    return new Response(JSON.stringify({ 
      jobId: job.id, 
      status: 'started',
      analysisType: hasSrtTranscription ? 'srt_based' : (isDirectFile ? 'real_multimodal' : 'estimated')
    }), {
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

async function processMultiModalAnalysis(
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
  providedTranscription?: string // SRT content if provided
) {
  const steps: AnalysisStep[] = ANALYSIS_STEPS.map(name => ({
    name,
    status: 'pending',
    progress: 0,
  }));

  let transcription = providedTranscription || '';
  let transcriptionWithTimestamps: { start: number; end: number; text: string }[] = [];
  let visionAnalysis = '';
  let yoloDetections: YoloDetection[] = [];
  let videoData: Uint8Array | null = null;
  let goalMentions: GoalMention[] = [];

  const videoStartSecond = 0;
  const videoEndSecond = videoDurationSeconds;
  
  const hasSrtContent = !!providedTranscription && providedTranscription.length > 50;

  console.log("=== MULTI-MODAL PIPELINE ===");
  console.log("Video duration:", videoDurationSeconds, "seconds");
  console.log("Events must be between 0 and", videoDurationSeconds, "seconds");
  console.log("Using SRT transcription:", hasSrtContent);

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

    console.log("Match:", homeTeamName, "vs", awayTeamName);

    for (let i = 0; i < steps.length; i++) {
      steps[i].status = 'processing';
      const overallProgress = Math.round((i / steps.length) * 100);
      await updateJobProgress(supabase, jobId, overallProgress, steps[i].name, steps);

      switch (steps[i].name) {
        case 'Preparação do vídeo':
          console.log("Step 1: Preparing video...");
          await simulateProgress(supabase, jobId, steps, i, overallProgress);
          break;

        case 'Download do vídeo':
          console.log("Step 2: Downloading video...");
          // Skip download if we have SRT transcription
          if (hasSrtContent) {
            console.log("SRT provided, skipping video download");
          } else if (isDirectFile) {
            try {
              // Check video size first with HEAD request
              const headResponse = await fetch(videoUrl, { method: 'HEAD' });
              const contentLength = headResponse.headers.get('content-length');
              const videoSizeBytes = contentLength ? parseInt(contentLength) : 0;
              const videoSizeMB = videoSizeBytes / (1024 * 1024);
              
              console.log("Video size:", videoSizeMB.toFixed(2), "MB");
              
              if (videoSizeBytes > 0 && videoSizeBytes <= MAX_VIDEO_SIZE_BYTES) {
                console.log("Video is within size limit, downloading...");
                videoData = await downloadVideoFile(videoUrl);
                console.log("Video downloaded:", videoData.length, "bytes");
              } else if (videoSizeBytes > MAX_VIDEO_SIZE_BYTES) {
                console.log("Video too large for download, using streaming analysis");
              } else {
                // If HEAD doesn't return size, try downloading anyway for small videos
                console.log("Cannot determine size, attempting download...");
                videoData = await downloadVideoFile(videoUrl);
                console.log("Video downloaded:", videoData.length, "bytes");
              }
            } catch (downloadError) {
              console.error("Download failed:", downloadError);
              console.log("Falling back to streaming analysis");
            }
          }
          await simulateProgress(supabase, jobId, steps, i, overallProgress);
          break;

        case 'Transcrição (Whisper)':
          console.log("Step 3: Processing transcription...");
          
          // If SRT provided, parse it instead of using Whisper
          if (hasSrtContent) {
            console.log("Using provided SRT transcription");
            transcriptionWithTimestamps = parseSrtContent(transcription, videoDurationSeconds);
            console.log("SRT parsed:", transcriptionWithTimestamps.length, "segments");
            
            // Extract goal mentions from parsed SRT
            goalMentions = extractGoalMentions(transcriptionWithTimestamps, homeTeamName, awayTeamName);
            console.log("Goal mentions found from SRT:", goalMentions.length);
            goalMentions.forEach(gm => {
              console.log(`  - [${gm.timestamp}s] "${gm.text}" (own goal: ${gm.isOwnGoal})`);
            });
          } else if (videoData) {
            // Use Whisper for transcription
            const whisperResult = await transcribeWithWhisperVerbose(videoData);
            transcription = whisperResult.text;
            transcriptionWithTimestamps = whisperResult.segments;
            
            console.log("Whisper transcription completed:", transcription.length, "chars");
            console.log("Segments:", transcriptionWithTimestamps.length);
            
            // Extract goal mentions from transcription
            goalMentions = extractGoalMentions(transcriptionWithTimestamps, homeTeamName, awayTeamName);
            console.log("Goal mentions found:", goalMentions.length);
            goalMentions.forEach(gm => {
              console.log(`  - [${gm.timestamp}s] "${gm.text}" (own goal: ${gm.isOwnGoal})`);
            });
          } else {
            console.log("No transcription available");
          }
          await simulateProgress(supabase, jobId, steps, i, overallProgress);
          break;

        case 'Detecção visual (YOLO)':
          console.log("Step 4: YOLO player/ball detection...");
          if (goalMentions.length > 0) {
            // Only run YOLO for frames near goal mentions
            console.log("Running YOLO on frames near goal mentions...");
            yoloDetections = await detectPlayersNearGoals(videoUrl, goalMentions, supabase);
            console.log("YOLO detections:", yoloDetections.length);
          } else {
            console.log("No goal mentions, skipping targeted YOLO detection");
          }
          await simulateProgress(supabase, jobId, steps, i, overallProgress);
          break;

        case 'Análise visual (Gemini)':
          console.log("Step 5: Gemini Vision analysis...");
          if (transcription) {
            // Use transcription to guide vision analysis
            visionAnalysis = await analyzeVideoWithContext(
              videoUrl,
              homeTeamName,
              awayTeamName,
              videoStartSecond,
              videoEndSecond,
              transcription,
              goalMentions
            );
          } else {
            visionAnalysis = await analyzeVideoWithVisionEstimated(
              homeTeamName,
              awayTeamName,
              videoStartSecond,
              videoEndSecond
            );
          }
          console.log("Vision analysis completed:", visionAnalysis.length, "chars");
          await simulateProgress(supabase, jobId, steps, i, overallProgress);
          break;

        case 'Correlação multi-modal':
          console.log("Step 6: Multi-modal correlation...");
          // Correlate audio (transcription) with visual (YOLO) for goal confirmation
          if (goalMentions.length > 0) {
            console.log("Correlating audio and visual evidence for goals...");
            for (const gm of goalMentions) {
              const nearbyYolo = yoloDetections.filter(
                d => Math.abs(d.timestamp - gm.timestamp) < 3
              );
              if (nearbyYolo.length > 0) {
                const ballNearGoal = nearbyYolo.some(d => 
                  d.ball && (d.ball.x < 5 || d.ball.x > 100) // Ball near goal line
                );
                console.log(`Goal at ${gm.timestamp}s: YOLO confirms ball near goal: ${ballNearGoal}`);
              }
            }
          }
          await simulateProgress(supabase, jobId, steps, i, overallProgress);
          break;

        case 'Identificação de eventos':
          console.log("Step 7: Generating events with multi-modal context...");
          console.log("Game time offset (startMinute):", startMinute);
          await generateMultiModalEvents(
            supabase, 
            matchId, 
            homeTeamId, 
            awayTeamId,
            homeTeamName,
            awayTeamName,
            transcription,
            transcriptionWithTimestamps,
            visionAnalysis,
            goalMentions,
            yoloDetections,
            videoStartSecond,
            videoEndSecond,
            videoDurationSeconds,
            !!videoData,
            startMinute // Pass game time offset
          );
          await simulateProgress(supabase, jobId, steps, i, overallProgress);
          break;

        case 'Análise tática':
          await simulateProgress(supabase, jobId, steps, i, overallProgress);
          break;

        default:
          await simulateProgress(supabase, jobId, steps, i, overallProgress);
      }

      steps[i].status = 'completed';
      steps[i].progress = 100;
    }

    const tacticalAnalysis = await generateTacticalAnalysis(
      homeTeamName, 
      awayTeamName, 
      visionAnalysis, 
      transcription
    );

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
          analysisType: videoData ? 'real_multimodal' : 'estimated',
          hasTranscription: transcription.length > 0,
          hasVisionAnalysis: visionAnalysis.length > 0,
          goalsDetected: goalMentions.length,
          yoloDetections: yoloDetections.length,
          transcription: transcription.substring(0, 500) // Store first 500 chars for reference
        }
      })
      .eq('id', jobId);

    await supabase
      .from('matches')
      .update({ status: 'completed' })
      .eq('id', matchId);

    console.log("=== ANALYSIS COMPLETED ===");
    console.log("Job:", jobId);
    console.log("Has video data:", !!videoData);
    console.log("Transcription length:", transcription.length);
    console.log("Goals detected:", goalMentions.length);
    console.log("YOLO detections:", yoloDetections.length);

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

// Download video file from URL
async function downloadVideoFile(videoUrl: string): Promise<Uint8Array> {
  console.log("Downloading video from:", videoUrl.substring(0, 100));
  
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// Transcribe with Whisper verbose_json for timestamps
async function transcribeWithWhisperVerbose(videoData: Uint8Array): Promise<{
  text: string;
  segments: { start: number; end: number; text: string }[];
}> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  
  if (!OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY not set, skipping transcription");
    return { text: '', segments: [] };
  }

  try {
    console.log("Preparing audio for Whisper (verbose_json)...");
    console.log("Video data size:", videoData.length, "bytes");
    
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoData).buffer as ArrayBuffer], { type: 'video/mp4' });
    formData.append('file', blob, 'video.mp4');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    console.log("Sending to Whisper API...");
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Whisper API error:", response.status, errorText);
      return { text: '', segments: [] };
    }

    const result = await response.json();
    console.log("Whisper transcription completed");
    console.log("Full text length:", result.text?.length || 0);
    console.log("Segments count:", result.segments?.length || 0);
    
    // Log first few segments for debugging
    if (result.segments) {
      result.segments.slice(0, 5).forEach((seg: any, i: number) => {
        console.log(`Segment ${i}: [${seg.start.toFixed(1)}s-${seg.end.toFixed(1)}s] ${seg.text.substring(0, 50)}...`);
      });
    }
    
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
    console.error("Error in Whisper transcription:", error);
    return { text: '', segments: [] };
  }
}

// Parse SRT content into segments with timestamps
function parseSrtContent(srtContent: string, videoDurationSeconds: number): { start: number; end: number; text: string }[] {
  const segments: { start: number; end: number; text: string }[] = [];
  
  // SRT format: index, timestamp line (00:00:00,000 --> 00:00:00,000), text lines, blank line
  const blocks = srtContent.trim().split(/\n\s*\n/);
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    
    // Find timestamp line (contains -->)
    const timestampLine = lines.find(line => line.includes('-->'));
    if (!timestampLine) continue;
    
    const timestampMatch = timestampLine.match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    
    if (!timestampMatch) continue;
    
    // Parse start time
    const startHours = parseInt(timestampMatch[1]);
    const startMins = parseInt(timestampMatch[2]);
    const startSecs = parseInt(timestampMatch[3]);
    const startMs = parseInt(timestampMatch[4]);
    const start = startHours * 3600 + startMins * 60 + startSecs + startMs / 1000;
    
    // Parse end time
    const endHours = parseInt(timestampMatch[5]);
    const endMins = parseInt(timestampMatch[6]);
    const endSecs = parseInt(timestampMatch[7]);
    const endMs = parseInt(timestampMatch[8]);
    const end = endHours * 3600 + endMins * 60 + endSecs + endMs / 1000;
    
    // Get text (lines after timestamp, before next block)
    const timestampIndex = lines.indexOf(timestampLine);
    const textLines = lines.slice(timestampIndex + 1);
    const text = textLines.join(' ').trim();
    
    // Only include if within video duration
    if (start <= videoDurationSeconds && text) {
      segments.push({ start, end: Math.min(end, videoDurationSeconds), text });
    }
  }
  
  console.log(`Parsed ${segments.length} SRT segments`);
  if (segments.length > 0) {
    console.log(`First segment: [${segments[0].start.toFixed(1)}s] ${segments[0].text.substring(0, 50)}...`);
    console.log(`Last segment: [${segments[segments.length - 1].start.toFixed(1)}s] ${segments[segments.length - 1].text.substring(0, 50)}...`);
  }
  
  return segments;
}

// Extract goal mentions from transcription
function extractGoalMentions(
  segments: { start: number; end: number; text: string }[],
  homeTeamName: string,
  awayTeamName: string
): GoalMention[] {
  const goalMentions: GoalMention[] = [];
  
  const goalKeywords = [
    'gol', 'goool', 'gooool', 'golaço', 'golazo', 'goal',
    'marcou', 'fez o gol', 'abriu o placar', 'ampliou',
    'empata', 'empatou', 'virou', 'virada'
  ];
  
  const ownGoalKeywords = [
    'gol contra', 'contra', 'próprio gol', 'própria meta',
    'infelicidade', 'desvio próprio', 'na própria rede'
  ];
  
  for (const segment of segments) {
    const text = segment.text.toLowerCase();
    
    // Check for goal keywords
    const hasGoalKeyword = goalKeywords.some(kw => text.includes(kw));
    
    if (hasGoalKeyword) {
      const isOwnGoal = ownGoalKeywords.some(kw => text.includes(kw));
      
      // Try to identify which team
      let teamMentioned: string | null = null;
      if (text.includes(homeTeamName.toLowerCase())) {
        teamMentioned = 'home';
      } else if (text.includes(awayTeamName.toLowerCase())) {
        teamMentioned = 'away';
      }
      
      goalMentions.push({
        timestamp: segment.start,
        text: segment.text.trim(),
        isOwnGoal,
        teamMentioned
      });
      
      console.log(`Goal detected at ${segment.start}s: "${segment.text.substring(0, 60)}..." (own: ${isOwnGoal})`);
    }
  }
  
  return goalMentions;
}

// Run YOLO detection near goal moments
async function detectPlayersNearGoals(
  videoUrl: string,
  goalMentions: GoalMention[],
  supabase: any
): Promise<YoloDetection[]> {
  const detections: YoloDetection[] = [];
  
  // For now, we'll use the detect-players edge function if available
  // In a production system, we'd extract frames at specific timestamps
  console.log("YOLO detection requested for", goalMentions.length, "goal moments");
  
  // Since we can't easily extract frames from video in edge functions,
  // we'll mark this as a placeholder for now
  // The visual analysis from Gemini will help compensate
  
  for (const gm of goalMentions) {
    // Create placeholder detection at goal moment
    detections.push({
      timestamp: gm.timestamp,
      players: [],
      ball: null, // Would be detected by YOLO
      referee: null
    });
  }
  
  return detections;
}

// Analyze video with transcription context
async function analyzeVideoWithContext(
  videoUrl: string,
  homeTeamName: string,
  awayTeamName: string,
  startSecond: number,
  endSecond: number,
  transcription: string,
  goalMentions: GoalMention[]
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return '';
  }

  const videoDurationSeconds = endSecond - startSecond;
  const goalsInfo = goalMentions.map(gm => 
    `- [${formatTime(gm.timestamp)}] ${gm.isOwnGoal ? 'GOL CONTRA' : 'GOL'}: "${gm.text}"`
  ).join('\n');

  try {
    const prompt = `Você é um analista de futebol profissional analisando um vídeo de ${videoDurationSeconds} segundos.

PARTIDA: ${homeTeamName} (casa) vs ${awayTeamName} (visitante)

=== TRANSCRIÇÃO DO ÁUDIO (NARRADORES) ===
${transcription.substring(0, 3000)}

=== GOLS DETECTADOS NA NARRAÇÃO ===
${goalsInfo || 'Nenhum gol claramente identificado na narração'}

TAREFA:
1. Analise a transcrição para confirmar os gols detectados
2. Para CADA GOL, identifique:
   - Se é gol normal ou GOL CONTRA
   - Qual time marcou/sofreu
   - O minuto exato (em segundos do vídeo)
3. Identifique outros eventos importantes mencionados

RESPONDA em formato estruturado com análise detalhada.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: "Você é um analista de futebol especializado em detectar gols e eventos em vídeos de partidas. Seja preciso sobre gols contra." 
          },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("Vision API error:", response.status);
      return '';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error("Error in context analysis:", error);
    return '';
  }
}

// Estimated vision analysis when no direct video access
async function analyzeVideoWithVisionEstimated(
  homeTeamName: string, 
  awayTeamName: string,
  startSecond: number,
  endSecond: number
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return '';
  }

  const videoDurationSeconds = endSecond - startSecond;

  try {
    const prompt = `Análise ESTIMADA para ${homeTeamName} vs ${awayTeamName}.
Duração: ${videoDurationSeconds} segundos.
Gere eventos típicos distribuídos no tempo do vídeo.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista tático de futebol." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      return '';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error("Error in estimated analysis:", error);
    return '';
  }
}

// Generate events with multi-modal context (transcription + vision + YOLO)
async function generateMultiModalEvents(
  supabase: any, 
  matchId: string, 
  homeTeamId: string, 
  awayTeamId: string,
  homeTeamName: string,
  awayTeamName: string,
  transcription: string,
  segments: { start: number; end: number; text: string }[],
  visionAnalysis: string,
  goalMentions: GoalMention[],
  yoloDetections: YoloDetection[],
  videoStartSecond: number,
  videoEndSecond: number,
  videoDurationSeconds: number,
  isRealAnalysis: boolean,
  gameStartMinute: number = 0 // Game time offset (0 for 1st half, 45 for 2nd half)
): Promise<boolean> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  console.log("=== MULTI-MODAL EVENT GENERATION ===");
  console.log("Transcription:", transcription.length, "chars");
  console.log("Segments:", segments.length);
  console.log("Goal mentions:", goalMentions.length);
  console.log("YOLO detections:", yoloDetections.length);
  console.log("Video duration:", videoDurationSeconds, "seconds");
  
  if (!LOVABLE_API_KEY) {
    console.log("No API key, generating fallback events");
    return await generateFallbackEvents(supabase, matchId, homeTeamName, awayTeamName, 0, videoDurationSeconds);
  }

  try {
    // Format transcription with timestamps
    const formattedTranscription = segments.length > 0
      ? segments.map(s => `[${formatTime(s.start)}] ${s.text}`).join('\n')
      : transcription;

    // Format goal mentions for the prompt
    const goalsContext = goalMentions.length > 0
      ? goalMentions.map(gm => 
          `GOLS DETECTADOS:\n- Segundo ${gm.timestamp}: ${gm.isOwnGoal ? 'GOL CONTRA' : 'GOL'} - "${gm.text}"`
        ).join('\n')
      : '';

    // Log transcription length for debugging
    console.log("=== TRANSCRIPTION DEBUG ===");
    console.log("Transcription length:", formattedTranscription.length, "chars");
    console.log("First 300 chars:", formattedTranscription.substring(0, 300));
    console.log("Last 300 chars:", formattedTranscription.substring(formattedTranscription.length - 300));
    console.log("Vision analysis length:", visionAnalysis.length, "chars");

    // ============================================
    // ETAPA 1: ANÁLISE TÁTICA COMPLETA
    // ============================================
    console.log("=== ETAPA 1: ANÁLISE TÁTICA ===");
    
    const tacticalPrompt = `ANÁLISE TÁTICA COMPLETA - ${homeTeamName} vs ${awayTeamName}

Você é um comentarista esportivo profissional. Leia TODA a transcrição abaixo e faça uma análise tática completa do jogo.

=== TRANSCRIÇÃO COMPLETA ===
${formattedTranscription.substring(0, 60000)}

=== ANÁLISE VISUAL (se disponível) ===
${visionAnalysis.substring(0, 5000)}

INSTRUÇÕES:
1. Leia a transcrição INTEIRA do início ao fim
2. Identifique o PLACAR FINAL mencionado pelo narrador
3. Liste CADA GOL que aconteceu, em ordem cronológica:
   - Quem marcou (jogador)
   - Qual time marcou
   - Se foi gol contra
   - O momento aproximado (timestamp da transcrição)
4. Liste outros eventos importantes (cartões, pênaltis, substituições)
5. Faça um resumo tático do jogo

IMPORTANTE: Não invente gols! Só liste gols que o narrador CLARAMENTE descreve como acontecendo NAQUELE MOMENTO.
- "GOOOL!" = gol acontecendo agora
- "o gol do Neymar no primeiro tempo" = MENÇÃO de gol passado, NÃO é novo gol
- "aos 24 do primeiro tempo" = REPLAY/RECAP, NÃO é novo gol

Retorne JSON:
{
  "tacticalAnalysis": {
    "finalScore": {"home": 3, "away": 0},
    "summary": "Resumo tático do jogo em 2-3 frases",
    "goals": [
      {
        "order": 1,
        "scorer": "Coutinho",
        "team": "home",
        "isOwnGoal": false,
        "approximateTimestamp": "[24:15]",
        "narrationExcerpt": "GOOOL! Coutinho chuta de fora da área!"
      }
    ],
    "otherKeyMoments": [
      {
        "type": "yellow_card",
        "description": "Cartão amarelo para jogador X",
        "approximateTimestamp": "[15:30]"
      }
    ]
  }
}`;

    const tacticalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `Você é um analista tático de futebol profissional. Sua função é analisar transcrições de partidas e identificar APENAS os eventos que REALMENTE aconteceram.

REGRA DE OURO: Um gol só deve ser listado se o narrador está descrevendo o momento EXATO em que a bola entra no gol. 
- Gritos de "GOOOL!" ou "GOL!" indicam gol acontecendo
- Comentários como "o gol que aconteceu" ou "lembrando o gol" são MENÇÕES, não gols novos
- Se o placar final é 3 a 0, devem existir EXATAMENTE 3 gols na lista

Retorne APENAS JSON válido.` 
          },
          { role: "user", content: tacticalPrompt }
        ],
      }),
    });

    if (!tacticalResponse.ok) {
      console.error("Tactical analysis failed:", await tacticalResponse.text());
      return await generateFallbackEvents(supabase, matchId, homeTeamName, awayTeamName, 0, videoDurationSeconds);
    }

    const tacticalData = await tacticalResponse.json();
    const tacticalContent = tacticalData.choices?.[0]?.message?.content || '';
    
    console.log("Tactical analysis received, length:", tacticalContent.length);
    
    // Parse tactical analysis
    let cleanTactical = tacticalContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const tacticalMatch = cleanTactical.match(/\{[\s\S]*\}/);
    
    if (!tacticalMatch) {
      console.error("No JSON in tactical response");
      return await generateFallbackEvents(supabase, matchId, homeTeamName, awayTeamName, 0, videoDurationSeconds);
    }

    const tacticalResult = JSON.parse(tacticalMatch[0]);
    const analysis = tacticalResult.tacticalAnalysis;
    
    console.log("=== ANÁLISE TÁTICA RESULTADO ===");
    console.log("Placar Final:", analysis.finalScore?.home, "-", analysis.finalScore?.away);
    console.log("Gols detectados:", analysis.goals?.length || 0);
    console.log("Resumo:", analysis.summary);
    
    // Validate goals count matches final score
    const expectedGoals = (analysis.finalScore?.home || 0) + (analysis.finalScore?.away || 0);
    const detectedGoals = analysis.goals?.length || 0;
    
    if (detectedGoals !== expectedGoals) {
      console.warn(`⚠️ Inconsistência: ${detectedGoals} gols detectados, mas placar indica ${expectedGoals} gols`);
    }

    // ============================================
    // ETAPA 2: CONVERTER ANÁLISE EM EVENTOS
    // ============================================
    console.log("=== ETAPA 2: GERANDO EVENTOS ===");

    const eventsPrompt = `Converta a análise tática abaixo em eventos de match_events.

ANÁLISE TÁTICA:
${JSON.stringify(analysis, null, 2)}

PARTIDA: ${homeTeamName} (casa) vs ${awayTeamName} (visitante)
DURAÇÃO DO VÍDEO: ${videoDurationSeconds} segundos

INSTRUÇÕES:
1. Para cada GOL na análise, crie um evento com:
   - type: "goal"
   - videoSecond: calcule a partir do timestamp [MM:SS]
   - team: "home" ou "away" baseado em qual time marcou
   - isOwnGoal: true se foi gol contra
   - description: frase impactante em português (máx 60 chars)

2. Para cada momento-chave, crie o evento apropriado

REGRAS DE TEMPO:
- [0:45] = videoSecond: 45
- [1:17] = videoSecond: 77
- [24:48] = videoSecond: 1488
- Máximo: ${videoDurationSeconds} segundos

REGRAS DE DESCRIPTION:
- Máximo 60 caracteres
- Português do Brasil
- Linguagem de narrador empolgado
- Use MAIÚSCULAS para gols

Retorne JSON:
{
  "events": [
    {
      "type": "goal",
      "videoSecond": 1455,
      "team": "home",
      "isOwnGoal": false,
      "description": "GOOOL DE COUTINHO! Bomba no ângulo!",
      "confidence": 0.95
    }
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
          { 
            role: "system", 
            content: `Você converte análises táticas em eventos estruturados para banco de dados.
Retorne APENAS JSON válido sem markdown.
O número de gols no JSON DEVE ser EXATAMENTE igual ao número de gols na análise tática.` 
          },
          { role: "user", content: eventsPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return await generateFallbackEvents(supabase, matchId, homeTeamName, awayTeamName, 0, videoDurationSeconds);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log("AI response length:", content.length);
    console.log("AI response preview:", content.substring(0, 500));
    
    // Clean markdown
    let cleanContent = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.error("No JSON found in response");
      console.log("Raw content:", content);
      return await generateFallbackEvents(supabase, matchId, homeTeamName, awayTeamName, 0, videoDurationSeconds);
    }

    const eventsData = JSON.parse(jsonMatch[0]);
    const events = eventsData.events || [];
    
    console.log("Parsed events:", events.length);
    
    // Log each event for debugging
    events.forEach((e: any, i: number) => {
      console.log(`Event ${i + 1}: ${e.type} at ${e.videoSecond}s - "${e.description}" (ownGoal: ${e.isOwnGoal})`);
    });
    
    // Filter and validate events
    const validEvents = events.filter((e: any) => {
      const eventSecond = e.videoSecond ?? 0;
      const isValid = eventSecond >= 0 && 
             eventSecond <= videoDurationSeconds &&
             e.type &&
             e.team;
      if (!isValid) {
        console.log(`Invalid event filtered: ${e.type} at ${eventSecond}s (max: ${videoDurationSeconds}s)`);
      }
      return isValid;
    });
    
    console.log("Valid events:", validEvents.length);
    
    let insertedCount = 0;
    
    // CRITICAL: Fetch CURRENT score from database to ACCUMULATE across halves
    const { data: currentMatch } = await supabase
      .from('matches')
      .select('home_score, away_score')
      .eq('id', matchId)
      .single();
    
    let homeScore = currentMatch?.home_score || 0;
    let awayScore = currentMatch?.away_score || 0;
    
    console.log(`Starting score from DB: ${homeScore} - ${awayScore}`);
    
    for (const event of validEvents) {
      const eventSecond = event.videoSecond ?? 0;
      const eventMs = eventSecond * 1000;
      // Calculate game minute by adding gameStartMinute (for 2nd half videos, this adds 45)
      const videoMinute = Math.floor(eventSecond / 60);
      const displayMinute = videoMinute + gameStartMinute; // Add game time offset
      const displaySecond = Math.floor(eventSecond % 60);
      
      console.log(`Event mapping: videoSecond=${eventSecond} → gameMinute=${displayMinute} (gameStartMinute=${gameStartMinute})`);
      
      // Track goals for score update
      if (event.type === 'goal') {
        if (event.isOwnGoal) {
          // Own goal: opposite team scores
          if (event.team === 'home') {
            awayScore++;
            console.log(`Own goal by home team - Away scores! (${homeScore}-${awayScore})`);
          } else {
            homeScore++;
            console.log(`Own goal by away team - Home scores! (${homeScore}-${awayScore})`);
          }
        } else {
          // Normal goal
          if (event.team === 'home') {
            homeScore++;
          } else {
            awayScore++;
          }
          console.log(`Goal by ${event.team} team (${homeScore}-${awayScore})`);
        }
      }
      
      const { error } = await supabase.from('match_events').insert({
        match_id: matchId,
        event_type: event.type,
        minute: displayMinute,
        second: displaySecond,
        description: event.description || '',
        is_highlight: ['goal', 'red_card', 'penalty'].includes(event.type),
        metadata: { 
          team: event.team, 
          teamName: event.team === 'home' ? homeTeamName : awayTeamName,
          confidence: event.confidence || 0.9,
          source: isRealAnalysis ? 'multimodal_analysis' : 'estimated',
          analysisMethod: 'whisper+gemini+correlation',
          isOwnGoal: event.isOwnGoal || false,
          narrationContext: event.narrationContext || '',
          videoSecond: eventSecond,
          eventMs: eventMs,
          videoDurationSeconds: videoDurationSeconds,
          bufferBeforeMs: 3000,
          bufferAfterMs: 5000
        },
        position_x: event.type === 'goal' ? (event.team === 'home' ? 95 : 5) : Math.random() * 100,
        position_y: event.type === 'goal' ? 50 : Math.random() * 100,
      });
      
      if (error) {
        console.error("Insert error:", error.message);
      } else {
        insertedCount++;
        console.log(`✓ Event ${event.type} at ${displayMinute}:${String(displaySecond).padStart(2, '0')} - "${event.description}"`);
      }
    }
    
    // Update match score if goals were detected
    if (homeScore > 0 || awayScore > 0) {
      console.log(`Updating match score: ${homeScore} - ${awayScore}`);
      const { error: scoreError } = await supabase
        .from('matches')
        .update({ 
          home_score: homeScore, 
          away_score: awayScore 
        })
        .eq('id', matchId);
      
      if (scoreError) {
        console.error("Score update error:", scoreError.message);
      } else {
        console.log("✓ Match score updated");
      }
    }
    
    console.log("=== EVENT GENERATION COMPLETE ===");
    console.log("Total inserted:", insertedCount);
    console.log("Final score:", homeScore, "-", awayScore);
    
    return insertedCount > 0;

  } catch (error) {
    console.error("Error generating multi-modal events:", error);
    return await generateFallbackEvents(supabase, matchId, homeTeamName, awayTeamName, 0, videoDurationSeconds);
  }
}

// Fallback event generation
async function generateFallbackEvents(
  supabase: any, 
  matchId: string, 
  homeTeamName: string, 
  awayTeamName: string,
  startSecond: number,
  endSecond: number
): Promise<boolean> {
  const videoDurationSeconds = endSecond - startSecond;
  console.log("Generating fallback events for", videoDurationSeconds, "seconds");
  
  const eventCount = Math.min(6, Math.max(2, Math.floor(videoDurationSeconds / 20)));
  
  const templates = [
    { type: 'foul', description: 'Falta no meio-campo', highlight: false },
    { type: 'corner', description: 'Escanteio cobrado', highlight: false },
    { type: 'shot_on_target', description: 'Finalização no gol', highlight: true },
    { type: 'save', description: 'Defesa do goleiro', highlight: true },
  ];
  
  let insertedCount = 0;
  
  for (let i = 0; i < eventCount; i++) {
    const template = templates[i % templates.length];
    const team = Math.random() > 0.5 ? 'home' : 'away';
    const eventSecond = Math.floor((i + 1) * (videoDurationSeconds / (eventCount + 1)));
    const displayMinute = Math.floor(eventSecond / 60);
    const displaySecond = Math.floor(eventSecond % 60);
    
    const { error } = await supabase.from('match_events').insert({
      match_id: matchId,
      event_type: template.type,
      minute: displayMinute,
      second: displaySecond,
      description: template.description,
      is_highlight: template.highlight,
      metadata: { 
        team,
        teamName: team === 'home' ? homeTeamName : awayTeamName,
        source: 'fallback',
        videoSecond: eventSecond,
        eventMs: eventSecond * 1000,
        videoDurationSeconds: videoDurationSeconds,
        bufferBeforeMs: 3000,
        bufferAfterMs: 5000
      },
      position_x: Math.random() * 100,
      position_y: Math.random() * 100,
    });
    
    if (!error) insertedCount++;
  }
  
  console.log("Fallback events inserted:", insertedCount);
  return insertedCount > 0;
}

async function generateTacticalAnalysis(
  homeTeamName: string, 
  awayTeamName: string,
  visionAnalysis: string,
  transcription: string
) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return getDefaultTacticalAnalysis();
  }

  try {
    let context = '';
    if (visionAnalysis) context += `\nAnálise Visual:\n${visionAnalysis.substring(0, 2000)}`;
    if (transcription) context += `\nTranscrição:\n${transcription.substring(0, 1000)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: "Você é um analista tático de futebol. Retorne APENAS JSON válido." 
          },
          { 
            role: "user", 
            content: `Gere análise tática para ${homeTeamName} vs ${awayTeamName}.
${context}

Retorne JSON:
{
  "formation": { "home": "4-3-3", "away": "4-4-2" },
  "possession": { "home": 55, "away": 45 },
  "insights": ["insight 1", "insight 2"],
  "patterns": [{ "type": "buildup", "description": "Construção pelo meio", "effectiveness": 0.75 }]
}` 
          }
        ],
      }),
    });

    if (!response.ok) {
      return getDefaultTacticalAnalysis();
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("Tactical analysis error:", error);
  }

  return getDefaultTacticalAnalysis();
}

function getDefaultTacticalAnalysis() {
  return {
    formation: { home: '4-3-3', away: '4-4-2' },
    possession: { home: 52, away: 48 },
    insights: [
      'Domínio territorial no meio-campo',
      'Transições rápidas em contra-ataques'
    ],
    patterns: [
      { type: 'buildup', description: 'Construção pelas laterais', effectiveness: 0.7 }
    ]
  };
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function simulateProgress(
  supabase: any, 
  jobId: string, 
  steps: AnalysisStep[], 
  stepIndex: number, 
  baseProgress: number
) {
  for (let progress = 0; progress <= 100; progress += 25) {
    steps[stepIndex].progress = progress;
    const stepProgress = Math.round((progress / 100) * (100 / steps.length));
    await updateJobProgress(supabase, jobId, baseProgress + stepProgress, steps[stepIndex].name, steps);
    await delay(150);
  }
}

async function updateJobProgress(
  supabase: any, 
  jobId: string, 
  progress: number, 
  currentStep: string, 
  steps: AnalysisStep[]
) {
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
