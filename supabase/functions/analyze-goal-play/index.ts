import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlayerMovement {
  playerId: string;
  team: 'home' | 'away';
  number: number;
  role: string;
  movements: { x: number; y: number; action: string }[];
}

interface BallMovement {
  x: number;
  y: number;
  holder?: string;
  action: 'pass' | 'dribble' | 'shot' | 'cross' | 'header' | 'stationary';
}

interface GoalPlayAnalysis {
  playType: string;
  scorer: { name: string; number: number; team: 'home' | 'away' };
  assister?: { name: string; number: number };
  playSequence: string[];
  ballPath: BallMovement[];
  playerMovements: PlayerMovement[];
  keyMoments: { frame: number; description: string }[];
  duration: number; // in seconds
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { goalDescription, homeTeamName, awayTeamName, minute, contextNarration } = await req.json();

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    if (!GEMINI_API_KEY) {
      console.log('No Gemini API key, using intelligent parsing');
      return new Response(
        JSON.stringify(parseGoalPlayIntelligently(goalDescription, homeTeamName, awayTeamName)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prompt = `Você é um analista tático de futebol expert. Analise a descrição do gol e narração do contexto para gerar uma representação detalhada da jogada.

DESCRIÇÃO DO GOL: "${goalDescription}"
${contextNarration ? `\nNARRAÇÃO DE CONTEXTO: "${contextNarration}"` : ''}
TIME DA CASA: ${homeTeamName || 'Time A'}
TIME VISITANTE: ${awayTeamName || 'Time B'}
MINUTO: ${minute || '?'}

Retorne um JSON com a análise tática da jogada do gol:

{
  "playType": "string (long_shot|counter_attack|cross|penalty|free_kick|header|tap_in|dribble|team_play|corner|own_goal)",
  "scorer": {
    "name": "string (nome do jogador que marcou)",
    "number": number (número da camisa, estimado entre 7-11 para atacantes),
    "team": "home" ou "away"
  },
  "assister": {
    "name": "string (nome de quem deu assistência, se houver)",
    "number": number
  } ou null,
  "playSequence": ["array de strings descrevendo cada fase da jogada em ordem"],
  "startPosition": { "x": number 0-105, "y": number 0-68 (onde começou a jogada) },
  "keyPasses": [
    { "from": { "x": number, "y": number }, "to": { "x": number, "y": number }, "type": "pass|through_ball|cross|long_ball" }
  ],
  "shotPosition": { "x": number, "y": number (de onde foi o chute/cabeceio) },
  "goalPosition": { "x": number, "y": number (onde entrou no gol - entre 30.84 e 37.16 no eixo Y) },
  "keyMoments": [
    { "phase": number 0-1, "description": "string" }
  ],
  "estimatedDuration": number (segundos que a jogada levou, 3-15)
}

IMPORTANTE:
- Coordenadas X: 0 = gol esquerdo (time away defende), 105 = gol direito (time home defende)
- Coordenadas Y: 0 = linha lateral inferior, 68 = linha lateral superior, 34 = centro
- Se time home marca, a bola vai em direção a X=105
- Se time away marca, a bola vai em direção a X=0
- Analise palavras-chave como "chute de fora", "cabeceio", "cruzamento", "contra-ataque", "jogada individual"
- Use nomes dos jogadores mencionados na descrição
- Se não houver nome, use posições genéricas

Retorne APENAS o JSON, sem markdown.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    const data = await response.json();
    let analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Clean up markdown if present
    analysisText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let analysis: any;
    try {
      analysis = JSON.parse(analysisText);
    } catch (e) {
      console.error('Failed to parse Gemini response:', analysisText);
      analysis = parseGoalPlayIntelligently(goalDescription, homeTeamName, awayTeamName);
    }

    // Generate frames from analysis
    const frames = generateFramesFromAnalysis(analysis);

    return new Response(
      JSON.stringify({ analysis, frames }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error analyzing goal play:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseGoalPlayIntelligently(description: string, homeTeamName?: string, awayTeamName?: string): any {
  const desc = description.toLowerCase();
  
  // Determine play type from keywords
  let playType = 'tap_in';
  if (desc.includes('pênalti') || desc.includes('penalty')) playType = 'penalty';
  else if (desc.includes('falta') || desc.includes('livre')) playType = 'free_kick';
  else if (desc.includes('escanteio') || desc.includes('corner')) playType = 'corner';
  else if (desc.includes('cabeça') || desc.includes('cabeceio')) playType = 'header';
  else if (desc.includes('cruzamento') || desc.includes('cruza')) playType = 'cross';
  else if (desc.includes('contra-ataque') || desc.includes('velocidade')) playType = 'counter_attack';
  else if (desc.includes('fora da área') || desc.includes('longe') || desc.includes('bomba') || desc.includes('golaço')) playType = 'long_shot';
  else if (desc.includes('dribl') || desc.includes('jogada individual')) playType = 'dribble';
  else if (desc.includes('assistência') || desc.includes('passe')) playType = 'team_play';
  
  // Extract scorer name
  const scorerPatterns = [
    /gol(?:aço)?\s+de\s+(\w+)/i,
    /(\w+)\s+marca/i,
    /(\w+)\s+finaliza/i,
    /(\w+)\s+chuta/i,
    /(\w+)\s+cabece/i,
    /gol\s+do\s+(\w+)/i,
  ];
  
  let scorerName = 'Atacante';
  for (const pattern of scorerPatterns) {
    const match = description.match(pattern);
    if (match) {
      scorerName = match[1];
      break;
    }
  }
  
  // Extract assister
  const assisterPatterns = [
    /assistência\s+de\s+(\w+)/i,
    /(\w+)\s+dá\s+assistência/i,
    /(\w+)\s+cruza/i,
    /passe\s+de\s+(\w+)/i,
  ];
  
  let assisterName = null;
  for (const pattern of assisterPatterns) {
    const match = description.match(pattern);
    if (match) {
      assisterName = match[1];
      break;
    }
  }

  // Determine team (default home)
  const isAwayGoal = desc.includes(awayTeamName?.toLowerCase() || '___never___');
  const team = isAwayGoal ? 'away' : 'home';

  return {
    playType,
    scorer: { name: scorerName, number: 10, team },
    assister: assisterName ? { name: assisterName, number: 7 } : null,
    startPosition: getStartPositionByPlayType(playType, team),
    shotPosition: getShotPositionByPlayType(playType, team),
    goalPosition: { x: team === 'home' ? 105 : 0, y: 34 },
    keyPasses: getKeyPassesByPlayType(playType, team),
    playSequence: generatePlaySequence(playType, scorerName, assisterName),
    keyMoments: [
      { phase: 0, description: 'Início da jogada' },
      { phase: 0.5, description: 'Desenvolvimento' },
      { phase: 0.9, description: 'Finalização' },
      { phase: 1, description: 'GOL!' },
    ],
    estimatedDuration: getEstimatedDuration(playType),
  };
}

function getStartPositionByPlayType(playType: string, team: 'home' | 'away') {
  const isHome = team === 'home';
  switch (playType) {
    case 'penalty': return { x: isHome ? 94 : 11, y: 34 };
    case 'free_kick': return { x: isHome ? 75 : 30, y: 25 };
    case 'corner': return { x: isHome ? 105 : 0, y: 0 };
    case 'counter_attack': return { x: isHome ? 30 : 75, y: 34 };
    case 'long_shot': return { x: isHome ? 60 : 45, y: 30 };
    case 'cross': return { x: isHome ? 70 : 35, y: 60 };
    case 'header': return { x: isHome ? 80 : 25, y: 55 };
    case 'dribble': return { x: isHome ? 50 : 55, y: 40 };
    case 'team_play': return { x: isHome ? 45 : 60, y: 34 };
    default: return { x: isHome ? 80 : 25, y: 34 };
  }
}

function getShotPositionByPlayType(playType: string, team: 'home' | 'away') {
  const isHome = team === 'home';
  switch (playType) {
    case 'penalty': return { x: isHome ? 94 : 11, y: 34 };
    case 'free_kick': return { x: isHome ? 78 : 27, y: 30 };
    case 'corner': return { x: isHome ? 95 : 10, y: 34 };
    case 'long_shot': return { x: isHome ? 70 : 35, y: 32 };
    case 'cross': return { x: isHome ? 98 : 7, y: 36 };
    case 'header': return { x: isHome ? 97 : 8, y: 35 };
    case 'dribble': return { x: isHome ? 92 : 13, y: 38 };
    default: return { x: isHome ? 95 : 10, y: 34 };
  }
}

function getKeyPassesByPlayType(playType: string, team: 'home' | 'away') {
  const isHome = team === 'home';
  switch (playType) {
    case 'counter_attack':
      return [
        { from: { x: isHome ? 25 : 80, y: 34 }, to: { x: isHome ? 50 : 55, y: 25 }, type: 'long_ball' },
        { from: { x: isHome ? 50 : 55, y: 25 }, to: { x: isHome ? 80 : 25, y: 34 }, type: 'through_ball' },
      ];
    case 'cross':
      return [
        { from: { x: isHome ? 75 : 30, y: 58 }, to: { x: isHome ? 95 : 10, y: 35 }, type: 'cross' },
      ];
    case 'team_play':
      return [
        { from: { x: isHome ? 45 : 60, y: 34 }, to: { x: isHome ? 65 : 40, y: 28 }, type: 'pass' },
        { from: { x: isHome ? 65 : 40, y: 28 }, to: { x: isHome ? 85 : 20, y: 36 }, type: 'through_ball' },
      ];
    default:
      return [];
  }
}

function generatePlaySequence(playType: string, scorer: string, assister?: string | null): string[] {
  const sequences: Record<string, string[]> = {
    penalty: [`${scorer} se posiciona para a cobrança`, 'Arquibancada em silêncio', `${scorer} bate forte`, 'A bola entra!'],
    free_kick: ['Falta perigosa', `${scorer} prepara a cobrança`, 'Chute por cima da barreira', 'GOL!'],
    corner: ['Escanteio fechado', 'Bola na área', `${scorer} aparece para cabecear`, 'GOL de cabeça!'],
    counter_attack: ['Bola recuperada', 'Contra-ataque em velocidade', assister ? `${assister} aciona ${scorer}` : 'Passe em profundidade', `${scorer} finaliza`, 'GOL!'],
    long_shot: [`${scorer} recebe na entrada da área`, 'Espaço para chutar', 'Chute forte de fora', 'GOLAÇO!'],
    cross: [assister ? `${assister} pela ponta` : 'Jogada pela ponta', 'Cruzamento na área', `${scorer} finaliza`, 'GOL!'],
    header: ['Bola levantada na área', `${scorer} sobe mais que a defesa`, 'Cabeceio certeiro', 'GOL!'],
    dribble: [`${scorer} recebe`, 'Jogada individual', 'Passa por um defensor', 'Finaliza', 'GOL!'],
    team_play: ['Troca de passes', assister ? `${assister} encontra ${scorer}` : 'Bola filtrada', `${scorer} cara a cara com o goleiro`, 'GOL!'],
  };
  return sequences[playType] || [`${scorer} marca`, 'GOL!'];
}

function getEstimatedDuration(playType: string): number {
  const durations: Record<string, number> = {
    penalty: 4,
    free_kick: 5,
    corner: 6,
    counter_attack: 10,
    long_shot: 5,
    cross: 7,
    header: 6,
    dribble: 8,
    team_play: 12,
  };
  return durations[playType] || 6;
}

function generateFramesFromAnalysis(analysis: any) {
  const frames: any[] = [];
  const fps = 10;
  const duration = analysis.estimatedDuration || 6;
  const totalFrames = duration * fps;
  
  const team = analysis.scorer?.team || 'home';
  const isHome = team === 'home';
  const goalX = isHome ? 103 : 2;
  const goalY = 34;
  
  const startPos = analysis.startPosition || { x: isHome ? 50 : 55, y: 34 };
  const shotPos = analysis.shotPosition || { x: isHome ? 90 : 15, y: 34 };
  const keyPasses = analysis.keyPasses || [];
  
  // Build ball path through key passes and shot
  const waypoints = [startPos, ...keyPasses.map((p: any) => p.to), shotPos, { x: goalX, y: goalY }];
  
  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    
    // Interpolate ball position through waypoints
    const waypointIndex = Math.min(Math.floor(t * (waypoints.length - 1)), waypoints.length - 2);
    const localT = (t * (waypoints.length - 1)) - waypointIndex;
    const wp1 = waypoints[waypointIndex];
    const wp2 = waypoints[waypointIndex + 1];
    
    const ballX = wp1.x + (wp2.x - wp1.x) * localT;
    const ballY = wp1.y + (wp2.y - wp1.y) * localT;
    
    // Generate player positions
    const players = generatePlayersForFrame(t, ballX, ballY, team, analysis);
    
    frames.push({
      timestamp: i / fps,
      ball: { x: ballX, y: ballY },
      players,
    });
  }
  
  return frames;
}

function generatePlayersForFrame(t: number, ballX: number, ballY: number, scoringTeam: 'home' | 'away', analysis: any) {
  const players: any[] = [];
  const isHome = scoringTeam === 'home';
  
  // Home team base formation (4-3-3)
  const homeBase = [
    { id: 'h1', number: 1, x: 5, y: 34, role: 'gk' },
    { id: 'h2', number: 2, x: 25, y: 12 },
    { id: 'h3', number: 3, x: 22, y: 28 },
    { id: 'h4', number: 4, x: 22, y: 40 },
    { id: 'h5', number: 6, x: 25, y: 56 },
    { id: 'h6', number: 5, x: 42, y: 34 },
    { id: 'h7', number: 8, x: 52, y: 22 },
    { id: 'h8', number: 10, x: 58, y: 34, isScorer: isHome },
    { id: 'h9', number: 7, x: 70, y: 15 },
    { id: 'h10', number: 11, x: 70, y: 53 },
    { id: 'h11', number: 9, x: 78, y: 34 },
  ];
  
  // Away team base formation
  const awayBase = [
    { id: 'a1', number: 1, x: 100, y: 34, role: 'gk' },
    { id: 'a2', number: 2, x: 82, y: 12 },
    { id: 'a3', number: 3, x: 85, y: 28 },
    { id: 'a4', number: 4, x: 85, y: 40 },
    { id: 'a5', number: 5, x: 82, y: 56 },
    { id: 'a6', number: 6, x: 68, y: 34 },
    { id: 'a7', number: 8, x: 58, y: 45 },
    { id: 'a8', number: 10, x: 52, y: 34, isScorer: !isHome },
    { id: 'a9', number: 7, x: 40, y: 18 },
    { id: 'a10', number: 11, x: 40, y: 50 },
    { id: 'a11', number: 9, x: 32, y: 34 },
  ];
  
  // Animate home team
  homeBase.forEach((p, idx) => {
    let x = p.x;
    let y = p.y;
    
    if (isHome) {
      // Attacking
      if (p.isScorer) {
        // Scorer follows ball
        x = ballX - 1.5;
        y = ballY + Math.sin(t * Math.PI) * 2;
      } else if (idx >= 8) {
        // Forwards push
        x = p.x + t * 25;
        y = p.y + (34 - p.y) * t * 0.3;
      } else if (idx >= 5) {
        // Midfield supports
        x = p.x + t * 15;
      } else if (idx > 0) {
        // Defense pushes up
        x = p.x + t * 8;
      }
    } else {
      // Defending
      x = p.x - t * 12;
    }
    
    players.push({
      id: p.id,
      team: 'home',
      number: p.number,
      x: Math.max(2, Math.min(103, x + Math.sin(t * 4 + idx) * 1.5)),
      y: Math.max(5, Math.min(63, y + Math.cos(t * 3 + idx) * 2)),
    });
  });
  
  // Animate away team
  awayBase.forEach((p, idx) => {
    let x = p.x;
    let y = p.y;
    
    if (!isHome) {
      // Attacking
      if (p.isScorer) {
        x = ballX + 1.5;
        y = ballY + Math.sin(t * Math.PI) * 2;
      } else if (idx >= 8) {
        x = p.x - t * 25;
        y = p.y + (34 - p.y) * t * 0.3;
      } else if (idx >= 5) {
        x = p.x - t * 15;
      } else if (idx > 0) {
        x = p.x - t * 8;
      }
    } else {
      // Defending
      x = p.x + t * 12;
    }
    
    players.push({
      id: p.id,
      team: 'away',
      number: p.number,
      x: Math.max(2, Math.min(103, x + Math.sin(t * 4 + idx) * 1.5)),
      y: Math.max(5, Math.min(63, y + Math.cos(t * 3 + idx) * 2)),
    });
  });
  
  return players;
}
