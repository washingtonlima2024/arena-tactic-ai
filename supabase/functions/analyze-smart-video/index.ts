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

    console.log('Starting smart video analysis with Google Video Intelligence:', { projectId, language, cutIntensity });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const googleApiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    // Update project status
    await supabase
      .from('smart_edit_projects')
      .update({ status: 'analyzing' })
      .eq('id', projectId);

    let transcription = '';
    let shotChanges: number[] = [];
    let speechSegments: Array<{ start: number; end: number; text: string }> = [];
    let labels: Array<{ name: string; segments: Array<{ start: number; end: number; confidence: number }> }> = [];

    // Step 1: Use Google Video Intelligence API if available
    if (googleApiKey) {
      console.log('Using Google Video Intelligence API...');
      
      try {
        // Start async video annotation
        const annotateResponse = await fetch(
          `https://videointelligence.googleapis.com/v1/videos:annotate?key=${googleApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inputUri: videoUrl.startsWith('gs://') ? videoUrl : undefined,
              inputContent: !videoUrl.startsWith('gs://') ? await getBase64FromUrl(videoUrl) : undefined,
              features: [
                'SHOT_CHANGE_DETECTION',
                'SPEECH_TRANSCRIPTION',
                'LABEL_DETECTION'
              ],
              videoContext: {
                speechTranscriptionConfig: {
                  languageCode: language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US',
                  enableAutomaticPunctuation: true,
                  enableWordTimeOffsets: true
                },
                labelDetectionConfig: {
                  labelDetectionMode: 'SHOT_MODE',
                  stationaryCamera: false
                }
              }
            })
          }
        );

        if (annotateResponse.ok) {
          const operationData = await annotateResponse.json();
          const operationName = operationData.name;
          console.log('Video Intelligence operation started:', operationName);

          // Poll for results (with timeout)
          let result = null;
          const maxAttempts = 60; // 5 minutes max
          for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

            const statusResponse = await fetch(
              `https://videointelligence.googleapis.com/v1/${operationName}?key=${googleApiKey}`
            );
            
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              console.log(`Polling attempt ${i + 1}/${maxAttempts}, done: ${statusData.done}`);
              
              if (statusData.done) {
                if (statusData.error) {
                  console.error('Video Intelligence error:', statusData.error);
                } else {
                  result = statusData.response;
                }
                break;
              }
            }
          }

          if (result?.annotationResults?.[0]) {
            const annotations = result.annotationResults[0];

            // Extract shot changes
            if (annotations.shotAnnotations) {
              shotChanges = annotations.shotAnnotations.map((shot: any) => 
                parseGoogleTimestamp(shot.startTimeOffset)
              );
              console.log(`Detected ${shotChanges.length} shot changes`);
            }

            // Extract speech transcription
            if (annotations.speechTranscriptions) {
              for (const transcriptionResult of annotations.speechTranscriptions) {
                for (const alternative of transcriptionResult.alternatives || []) {
                  if (alternative.words) {
                    const words = alternative.words;
                    if (words.length > 0) {
                      const start = parseGoogleTimestamp(words[0].startTime);
                      const end = parseGoogleTimestamp(words[words.length - 1].endTime);
                      speechSegments.push({
                        start,
                        end,
                        text: alternative.transcript || ''
                      });
                    }
                  }
                  transcription += (alternative.transcript || '') + ' ';
                }
              }
              console.log(`Transcribed ${speechSegments.length} speech segments`);
            }

            // Extract labels
            if (annotations.shotLabelAnnotations) {
              labels = annotations.shotLabelAnnotations.map((label: any) => ({
                name: label.entity?.description || 'Unknown',
                segments: (label.segments || []).map((seg: any) => ({
                  start: parseGoogleTimestamp(seg.segment?.startTimeOffset),
                  end: parseGoogleTimestamp(seg.segment?.endTimeOffset),
                  confidence: seg.confidence || 0.5
                }))
              }));
              console.log(`Detected ${labels.length} labels`);
            }
          }
        } else {
          const errorText = await annotateResponse.text();
          console.error('Google Video Intelligence API error:', annotateResponse.status, errorText);
        }
      } catch (googleError) {
        console.error('Google Video Intelligence error:', googleError);
      }
    }

    // Step 2: Use AI to identify important clips based on analysis
    console.log('Identifying important clips with AI...');
    
    const detectedClips = await identifyClipsWithAI({
      transcription,
      shotChanges,
      speechSegments,
      labels,
      minClipDuration,
      maxClipDuration,
      maxClips,
      cutIntensity,
      lovableApiKey
    });

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
        transcription: transcription.trim() || null
      })
      .eq('id', projectId);

    console.log('Analysis complete!');

    return new Response(JSON.stringify({ 
      success: true,
      clipsCount: detectedClips.length,
      transcription: transcription.trim(),
      shotChanges: shotChanges.length,
      speechSegments: speechSegments.length,
      labels: labels.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Parse Google's timestamp format (e.g., "1.500s" or "90s")
function parseGoogleTimestamp(timestamp: string | undefined): number {
  if (!timestamp) return 0;
  const match = timestamp.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? parseFloat(match[1]) : 0;
}

// Get base64 content from URL (for non-GCS URLs)
async function getBase64FromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Use AI to identify the most important clips
async function identifyClipsWithAI(params: {
  transcription: string;
  shotChanges: number[];
  speechSegments: Array<{ start: number; end: number; text: string }>;
  labels: Array<{ name: string; segments: Array<{ start: number; end: number; confidence: number }> }>;
  minClipDuration: number;
  maxClipDuration: number;
  maxClips: number;
  cutIntensity: string;
  lovableApiKey: string | undefined;
}): Promise<Array<{ start_second: number; end_second: number; title: string; event_type: string; confidence: number }>> {
  
  const { transcription, shotChanges, speechSegments, labels, minClipDuration, maxClipDuration, maxClips, cutIntensity, lovableApiKey } = params;

  // Build context from Google analysis
  const analysisContext = {
    hasTranscription: transcription.length > 0,
    shotCount: shotChanges.length,
    speechSegmentCount: speechSegments.length,
    labelCount: labels.length,
    topLabels: labels.slice(0, 10).map(l => l.name),
    shotTimestamps: shotChanges.slice(0, 30),
    speechPreview: speechSegments.slice(0, 10).map(s => ({
      time: `${Math.floor(s.start)}s`,
      text: s.text.substring(0, 100)
    }))
  };

  const intensityGuide = {
    basic: 'Identifique apenas 3-5 momentos muito importantes com clips mais longos',
    medium: 'Identifique 6-10 momentos relevantes com duração equilibrada',
    detailed: 'Identifique 10-15 momentos interessantes com clips mais curtos'
  };

  const prompt = `Você é um editor de vídeo profissional. Analise os dados da análise de vídeo e identifique os trechos mais relevantes para criar um compilado.

DADOS DA ANÁLISE:
- Transcrição: ${transcription.substring(0, 2000)}${transcription.length > 2000 ? '...' : ''}
- Mudanças de cena detectadas: ${shotChanges.length} (timestamps: ${shotChanges.slice(0, 20).join(', ')}s...)
- Segmentos de fala: ${speechSegments.length}
- Labels detectados: ${labels.slice(0, 15).map(l => l.name).join(', ')}

CONFIGURAÇÕES:
- Intensidade: ${cutIntensity} - ${intensityGuide[cutIntensity as keyof typeof intensityGuide]}
- Duração mínima de cada clip: ${minClipDuration} segundos
- Duração máxima de cada clip: ${maxClipDuration} segundos
- Quantidade máxima de clips: ${maxClips}

CRITÉRIOS PARA SELEÇÃO:
1. Mudanças de cena significativas (use os timestamps de shot changes)
2. Momentos com fala importante ou emoção
3. Ações ou eventos visuais interessantes (baseado nos labels)
4. Diversidade de conteúdo ao longo do vídeo

IMPORTANTE: Retorne APENAS um array JSON válido, sem markdown.
Cada clip deve ter:
- start_second: número (início em segundos, baseado nos shot changes ou speech segments)
- end_second: número (fim em segundos)
- title: string (título descritivo curto baseado no conteúdo)
- event_type: string (tipo: "destaque", "fala", "ação", "reação", "transição")
- confidence: número de 0 a 1

Exemplo:
[{"start_second":15,"end_second":35,"title":"Momento de destaque","event_type":"destaque","confidence":0.9}]`;

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
          messages: [{ role: 'user', content: prompt }]
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        // Parse JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const clips = JSON.parse(jsonMatch[0]);
          console.log(`AI identified ${clips.length} clips`);
          return clips;
        }
      } else {
        console.error('AI request failed:', response.status);
      }
    } catch (aiError) {
      console.error('AI error:', aiError);
    }
  }

  // Fallback: Generate clips from shot changes and speech segments
  console.log('Using fallback clip generation from analysis data...');
  return generateClipsFromAnalysis({
    shotChanges,
    speechSegments,
    labels,
    minClipDuration,
    maxClipDuration,
    maxClips,
    cutIntensity
  });
}

// Fallback: Generate clips directly from Google analysis
function generateClipsFromAnalysis(params: {
  shotChanges: number[];
  speechSegments: Array<{ start: number; end: number; text: string }>;
  labels: Array<{ name: string; segments: Array<{ start: number; end: number; confidence: number }> }>;
  minClipDuration: number;
  maxClipDuration: number;
  maxClips: number;
  cutIntensity: string;
}): Array<{ start_second: number; end_second: number; title: string; event_type: string; confidence: number }> {
  
  const { shotChanges, speechSegments, labels, minClipDuration, maxClipDuration, maxClips, cutIntensity } = params;
  const clips: Array<{ start_second: number; end_second: number; title: string; event_type: string; confidence: number }> = [];

  // Strategy 1: Use shot changes as clip boundaries
  if (shotChanges.length >= 2) {
    for (let i = 0; i < shotChanges.length - 1 && clips.length < maxClips; i++) {
      const start = shotChanges[i];
      const end = shotChanges[i + 1];
      const duration = end - start;

      if (duration >= minClipDuration && duration <= maxClipDuration) {
        // Find relevant label for this segment
        const relevantLabel = labels.find(l => 
          l.segments.some(s => s.start <= start && s.end >= end)
        );

        clips.push({
          start_second: start,
          end_second: end,
          title: relevantLabel?.name || `Cena ${i + 1}`,
          event_type: 'transição',
          confidence: 0.7
        });
      }
    }
  }

  // Strategy 2: Use speech segments
  if (clips.length < maxClips && speechSegments.length > 0) {
    for (const segment of speechSegments) {
      if (clips.length >= maxClips) break;
      
      const duration = segment.end - segment.start;
      if (duration >= minClipDuration && duration <= maxClipDuration) {
        // Check if overlaps with existing clip
        const overlaps = clips.some(c => 
          (segment.start >= c.start_second && segment.start <= c.end_second) ||
          (segment.end >= c.start_second && segment.end <= c.end_second)
        );

        if (!overlaps) {
          clips.push({
            start_second: segment.start,
            end_second: segment.end,
            title: segment.text.substring(0, 50) + (segment.text.length > 50 ? '...' : ''),
            event_type: 'fala',
            confidence: 0.8
          });
        }
      }
    }
  }

  // Strategy 3: Use label segments with high confidence
  if (clips.length < maxClips) {
    for (const label of labels) {
      for (const segment of label.segments) {
        if (clips.length >= maxClips) break;
        
        const duration = segment.end - segment.start;
        if (duration >= minClipDuration && duration <= maxClipDuration && segment.confidence > 0.6) {
          const overlaps = clips.some(c => 
            (segment.start >= c.start_second && segment.start <= c.end_second) ||
            (segment.end >= c.start_second && segment.end <= c.end_second)
          );

          if (!overlaps) {
            clips.push({
              start_second: segment.start,
              end_second: segment.end,
              title: label.name,
              event_type: 'ação',
              confidence: segment.confidence
            });
          }
        }
      }
    }
  }

  // If still not enough clips, generate evenly spaced ones
  if (clips.length === 0) {
    const targetCount = cutIntensity === 'basic' ? 4 : cutIntensity === 'detailed' ? 12 : 8;
    const count = Math.min(targetCount, maxClips);
    
    // Assume 5 minute video if no data
    const assumedDuration = 300;
    const spacing = assumedDuration / (count + 1);

    for (let i = 0; i < count; i++) {
      const start = Math.round(spacing * (i + 1));
      const duration = Math.floor(Math.random() * (maxClipDuration - minClipDuration)) + minClipDuration;
      
      clips.push({
        start_second: start,
        end_second: start + duration,
        title: `Trecho ${i + 1}`,
        event_type: 'destaque',
        confidence: 0.5
      });
    }
  }

  // Sort by timestamp
  clips.sort((a, b) => a.start_second - b.start_second);

  return clips.slice(0, maxClips);
}
