import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DetectedObject {
  class: string;
  class_id: number;
  confidence: number;
  x: number;  // center x
  y: number;  // center y
  width: number;
  height: number;
}

interface PlayerPosition {
  id: string;
  x: number;  // field position in meters (0-105)
  y: number;  // field position in meters (0-68)
  team: 'home' | 'away' | 'unknown';
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface BallPosition {
  x: number;
  y: number;
  confidence: number;
}

interface DetectionResult {
  players: PlayerPosition[];
  ball: BallPosition | null;
  referee: PlayerPosition | null;
  frameTimestamp: number;
  processingTimeMs: number;
}

// Convert image pixel coordinates to field meters
// Assumes camera is positioned to capture full field width
function pixelToFieldCoordinates(
  pixelX: number,
  pixelY: number,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } {
  // Field dimensions in meters
  const fieldLength = 105;
  const fieldWidth = 68;
  
  // Simple linear mapping (assumes bird's eye view or broadcast angle)
  // In production, this would use homography transformation
  const x = (pixelX / imageWidth) * fieldLength;
  const y = (pixelY / imageHeight) * fieldWidth;
  
  return { x: Math.max(0, Math.min(fieldLength, x)), y: Math.max(0, Math.min(fieldWidth, y)) };
}

// Classify team based on bounding box color analysis
// In production, this would analyze jersey colors within the bounding box
function classifyTeam(classId: number, index: number): 'home' | 'away' | 'unknown' {
  // Simple alternating classification for demo
  // Real implementation would use color analysis or additional model
  if (classId === 0) { // person/player
    return index % 2 === 0 ? 'home' : 'away';
  }
  return 'unknown';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { 
      imageBase64, 
      imageUrl,
      frameTimestamp = 0,
      modelId = 'football-players-detection-3zvbc',  // Roboflow football model
      modelVersion = '1',
      confidence = 0.4
    } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Either imageBase64 or imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ROBOFLOW_API_KEY = Deno.env.get('ROBOFLOW_API_KEY');
    if (!ROBOFLOW_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ROBOFLOW_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting YOLO detection via Roboflow...');
    console.log(`Model: ${modelId}/${modelVersion}, Confidence: ${confidence}`);

    // Call Roboflow Inference API
    const roboflowUrl = `https://detect.roboflow.com/${modelId}/${modelVersion}`;
    
    let requestBody: any;
    let contentType: string;

    if (imageBase64) {
      // Send base64 image
      requestBody = imageBase64;
      contentType = 'application/x-www-form-urlencoded';
    } else {
      // Send image URL
      requestBody = imageUrl;
      contentType = 'application/x-www-form-urlencoded';
    }

    const roboflowResponse = await fetch(
      `${roboflowUrl}?api_key=${ROBOFLOW_API_KEY}&confidence=${confidence}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
        },
        body: requestBody,
      }
    );

    if (!roboflowResponse.ok) {
      const errorText = await roboflowResponse.text();
      console.error('Roboflow API error:', roboflowResponse.status, errorText);
      
      // Return mock data if Roboflow fails (for demo purposes)
      console.log('Returning mock detection data...');
      const mockResult = generateMockDetection(frameTimestamp);
      return new Response(
        JSON.stringify({
          ...mockResult,
          warning: 'Using mock data - Roboflow API unavailable',
          roboflowError: errorText
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const roboflowData = await roboflowResponse.json();
    console.log(`Roboflow detected ${roboflowData.predictions?.length || 0} objects`);

    // Process detections
    const imageWidth = roboflowData.image?.width || 1920;
    const imageHeight = roboflowData.image?.height || 1080;
    
    const players: PlayerPosition[] = [];
    let ball: BallPosition | null = null;
    let referee: PlayerPosition | null = null;
    let playerIndex = 0;

    for (const prediction of (roboflowData.predictions || [])) {
      const fieldPos = pixelToFieldCoordinates(
        prediction.x,
        prediction.y,
        imageWidth,
        imageHeight
      );

      const boundingBox = {
        x: prediction.x - prediction.width / 2,
        y: prediction.y - prediction.height / 2,
        width: prediction.width,
        height: prediction.height,
      };

      const className = prediction.class.toLowerCase();

      if (className.includes('ball') || className.includes('football')) {
        ball = {
          x: fieldPos.x,
          y: fieldPos.y,
          confidence: prediction.confidence,
        };
      } else if (className.includes('referee') || className.includes('arbitro')) {
        referee = {
          id: 'referee',
          x: fieldPos.x,
          y: fieldPos.y,
          team: 'unknown',
          confidence: prediction.confidence,
          boundingBox,
        };
      } else if (className.includes('player') || className.includes('person') || className.includes('jogador')) {
        const team = classifyTeam(prediction.class_id, playerIndex);
        players.push({
          id: `player_${playerIndex}`,
          x: fieldPos.x,
          y: fieldPos.y,
          team,
          confidence: prediction.confidence,
          boundingBox,
        });
        playerIndex++;
      }
    }

    const processingTimeMs = Date.now() - startTime;

    const result: DetectionResult = {
      players,
      ball,
      referee,
      frameTimestamp,
      processingTimeMs,
    };

    console.log(`Detection complete: ${players.length} players, ball: ${ball ? 'yes' : 'no'}, time: ${processingTimeMs}ms`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Detection error:', error);
    
    // Return mock data on error for demo purposes
    const mockResult = generateMockDetection(0);
    return new Response(
      JSON.stringify({
        ...mockResult,
        warning: 'Using mock data due to error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Generate mock detection data for demo/testing
function generateMockDetection(timestamp: number): DetectionResult {
  const players: PlayerPosition[] = [];
  
  // Generate 22 players (11 per team)
  for (let i = 0; i < 11; i++) {
    // Home team (left side)
    players.push({
      id: `home_${i}`,
      x: 10 + Math.random() * 40 + Math.sin(timestamp * 0.1 + i) * 5,
      y: 5 + (i * 5.5) + Math.cos(timestamp * 0.1 + i) * 3,
      team: 'home',
      confidence: 0.85 + Math.random() * 0.1,
      boundingBox: { x: 0, y: 0, width: 50, height: 100 },
    });
    
    // Away team (right side)
    players.push({
      id: `away_${i}`,
      x: 55 + Math.random() * 40 + Math.sin(timestamp * 0.1 + i + 5) * 5,
      y: 5 + (i * 5.5) + Math.cos(timestamp * 0.1 + i + 5) * 3,
      team: 'away',
      confidence: 0.85 + Math.random() * 0.1,
      boundingBox: { x: 0, y: 0, width: 50, height: 100 },
    });
  }

  // Ball position
  const ball: BallPosition = {
    x: 52.5 + Math.sin(timestamp * 0.5) * 20,
    y: 34 + Math.cos(timestamp * 0.3) * 15,
    confidence: 0.95,
  };

  return {
    players,
    ball,
    referee: {
      id: 'referee',
      x: 52.5 + Math.sin(timestamp * 0.2) * 10,
      y: 20 + Math.cos(timestamp * 0.2) * 10,
      team: 'unknown',
      confidence: 0.9,
      boundingBox: { x: 0, y: 0, width: 50, height: 100 },
    },
    frameTimestamp: timestamp,
    processingTimeMs: 45 + Math.random() * 20,
  };
}
