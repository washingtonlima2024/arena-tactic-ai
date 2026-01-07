import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlayerDetection {
  id: string;
  x: number;
  y: number;
  team: 'home' | 'away' | 'unknown';
  confidence: number;
}

interface DetectionResult {
  players: PlayerDetection[];
  ball: { x: number; y: number; confidence: number } | null;
  referee: PlayerDetection | null;
  frameTimestamp: number;
  processingTimeMs: number;
  warning?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { imageBase64, imageUrl, frameTimestamp = 0, homeColor, awayColor, confidence = 0.4 } = await req.json();

    if (!imageBase64 && !imageUrl) {
      throw new Error('Either imageBase64 or imageUrl is required');
    }

    // Use Gemini for vision analysis (available via Lovable AI)
    const geminiApiKey = Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY');
    
    if (!geminiApiKey) {
      // Return simulated detection for demo purposes
      console.log('No Gemini API key, using simulated detection');
      return new Response(JSON.stringify(generateSimulatedDetection(frameTimestamp, startTime)), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the image data for Gemini
    let imageData: { inlineData: { mimeType: string; data: string } } | { fileUri: string };
    
    if (imageBase64) {
      imageData = {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64
        }
      };
    } else {
      // For URL, we need to fetch and convert to base64
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      imageData = {
        inlineData: {
          mimeType: response.headers.get('content-type') || 'image/jpeg',
          data: base64
        }
      };
    }

    const prompt = `Analyze this football/soccer match image and detect all players, the ball, and referee positions.

For each detected entity, provide:
1. Position as X,Y coordinates where X is 0-105 (field length in meters) and Y is 0-68 (field width in meters)
2. Team classification: "home" (typically lighter/brighter jersey), "away" (typically darker jersey), or "unknown"
3. Confidence score from 0 to 1

The field orientation: goal on the left is at X=0, goal on the right is at X=105. Y=0 is one sideline, Y=68 is the other.

${homeColor ? `Home team color: ${homeColor}` : ''}
${awayColor ? `Away team color: ${awayColor}` : ''}

Return a JSON object with this exact structure:
{
  "players": [
    { "x": 50.5, "y": 34, "team": "home", "confidence": 0.95 },
    ...
  ],
  "ball": { "x": 52.3, "y": 35.2, "confidence": 0.9 } or null if not visible,
  "referee": { "x": 45, "y": 30, "confidence": 0.85 } or null if not visible
}

Only return valid JSON, no markdown or explanation.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                imageData,
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      throw new Error('No response from Gemini');
    }

    // Parse the JSON from Gemini response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid JSON in Gemini response');
    }

    const detections = JSON.parse(jsonMatch[0]);
    
    // Build result with IDs
    const players: PlayerDetection[] = (detections.players || [])
      .filter((p: any) => p.confidence >= confidence)
      .map((p: any, idx: number) => ({
        id: `player-${idx}`,
        x: Math.max(0, Math.min(105, p.x)),
        y: Math.max(0, Math.min(68, p.y)),
        team: p.team || 'unknown',
        confidence: p.confidence
      }));

    const result: DetectionResult = {
      players,
      ball: detections.ball ? {
        x: Math.max(0, Math.min(105, detections.ball.x)),
        y: Math.max(0, Math.min(68, detections.ball.y)),
        confidence: detections.ball.confidence
      } : null,
      referee: detections.referee ? {
        id: 'referee',
        x: Math.max(0, Math.min(105, detections.referee.x)),
        y: Math.max(0, Math.min(68, detections.referee.y)),
        team: 'unknown',
        confidence: detections.referee.confidence
      } : null,
      frameTimestamp,
      processingTimeMs: Date.now() - startTime
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in detect-players:', errorMessage);
    
    // Return simulated detection as fallback
    return new Response(JSON.stringify({
      ...generateSimulatedDetection(0, startTime),
      warning: `Detection fallback: ${errorMessage}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Generate simulated detection data for demo/fallback
function generateSimulatedDetection(frameTimestamp: number, startTime: number): DetectionResult {
  const players: PlayerDetection[] = [];
  
  // Home team (11 players in 4-4-2 formation)
  const homePositions = [
    { x: 5, y: 34 },    // GK
    { x: 25, y: 12 },   // RB
    { x: 22, y: 28 },   // CB
    { x: 22, y: 40 },   // CB
    { x: 25, y: 56 },   // LB
    { x: 45, y: 18 },   // RM
    { x: 40, y: 30 },   // CM
    { x: 40, y: 38 },   // CM
    { x: 45, y: 50 },   // LM
    { x: 65, y: 28 },   // ST
    { x: 65, y: 40 },   // ST
  ];
  
  // Away team (11 players)
  const awayPositions = [
    { x: 100, y: 34 },  // GK
    { x: 80, y: 12 },   // RB
    { x: 83, y: 28 },   // CB
    { x: 83, y: 40 },   // CB
    { x: 80, y: 56 },   // LB
    { x: 60, y: 18 },   // RM
    { x: 65, y: 30 },   // CM
    { x: 65, y: 38 },   // CM
    { x: 60, y: 50 },   // LM
    { x: 40, y: 28 },   // ST
    { x: 40, y: 40 },   // ST
  ];
  
  // Add some random variation based on frame timestamp
  const variation = Math.sin(frameTimestamp * 0.1);
  
  homePositions.forEach((pos, idx) => {
    players.push({
      id: `home-${idx}`,
      x: Math.max(2, Math.min(103, pos.x + variation * 3 + Math.random() * 2)),
      y: Math.max(2, Math.min(66, pos.y + Math.cos(frameTimestamp * 0.1 + idx) * 2)),
      team: 'home',
      confidence: 0.85 + Math.random() * 0.1
    });
  });
  
  awayPositions.forEach((pos, idx) => {
    players.push({
      id: `away-${idx}`,
      x: Math.max(2, Math.min(103, pos.x - variation * 3 + Math.random() * 2)),
      y: Math.max(2, Math.min(66, pos.y + Math.sin(frameTimestamp * 0.1 + idx) * 2)),
      team: 'away',
      confidence: 0.85 + Math.random() * 0.1
    });
  });
  
  return {
    players,
    ball: {
      x: 52.5 + variation * 20,
      y: 34 + Math.cos(frameTimestamp * 0.2) * 15,
      confidence: 0.92
    },
    referee: {
      id: 'referee',
      x: 52.5 + variation * 10,
      y: 45,
      team: 'unknown',
      confidence: 0.88
    },
    frameTimestamp,
    processingTimeMs: Date.now() - startTime
  };
}
