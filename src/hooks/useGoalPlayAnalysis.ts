import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PlayFrame {
  timestamp: number;
  players: {
    id: string;
    x: number;
    y: number;
    team: 'home' | 'away';
    number?: number;
  }[];
  ball: { x: number; y: number };
}

interface GoalPlayAnalysis {
  playType: string;
  scorer: { name: string; number: number; team: 'home' | 'away' };
  assister?: { name: string; number: number };
  playSequence: string[];
  keyMoments: { phase: number; description: string }[];
  estimatedDuration: number;
}

interface UseGoalPlayAnalysisResult {
  analyzeGoal: (
    goalDescription: string,
    homeTeamName?: string,
    awayTeamName?: string,
    minute?: number,
    contextNarration?: string
  ) => Promise<{ analysis: GoalPlayAnalysis; frames: PlayFrame[] } | null>;
  isAnalyzing: boolean;
  analysis: GoalPlayAnalysis | null;
  frames: PlayFrame[];
  error: string | null;
}

export function useGoalPlayAnalysis(): UseGoalPlayAnalysisResult {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<GoalPlayAnalysis | null>(null);
  const [frames, setFrames] = useState<PlayFrame[]>([]);
  const [error, setError] = useState<string | null>(null);

  const analyzeGoal = useCallback(async (
    goalDescription: string,
    homeTeamName?: string,
    awayTeamName?: string,
    minute?: number,
    contextNarration?: string
  ) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-goal-play', {
        body: {
          goalDescription,
          homeTeamName,
          awayTeamName,
          minute,
          contextNarration,
        },
      });

      if (fnError) throw fnError;

      if (data?.analysis) {
        setAnalysis(data.analysis);
      }
      
      if (data?.frames) {
        setFrames(data.frames);
      }

      return data;
    } catch (err: any) {
      console.error('Error analyzing goal play:', err);
      setError(err.message || 'Erro ao analisar jogada');
      
      // Fallback to local generation
      const fallbackFrames = generateFallbackFrames(goalDescription);
      setFrames(fallbackFrames);
      return { analysis: null, frames: fallbackFrames };
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  return {
    analyzeGoal,
    isAnalyzing,
    analysis,
    frames,
    error,
  };
}

// Local fallback frame generation
function generateFallbackFrames(description: string): PlayFrame[] {
  const frames: PlayFrame[] = [];
  const desc = description.toLowerCase();
  
  // Determine play characteristics
  let playType = 'tap_in';
  if (desc.includes('fora da área') || desc.includes('golaço') || desc.includes('bomba')) {
    playType = 'long_shot';
  } else if (desc.includes('contra') || desc.includes('velocidade')) {
    playType = 'counter';
  } else if (desc.includes('cabeça') || desc.includes('cabeceio')) {
    playType = 'header';
  } else if (desc.includes('cruzamento') || desc.includes('cruza')) {
    playType = 'cross';
  } else if (desc.includes('pênalti') || desc.includes('penalty')) {
    playType = 'penalty';
  } else if (desc.includes('assistência') || desc.includes('passe')) {
    playType = 'team_play';
  }

  const totalFrames = 60;
  const isHome = true; // Default to home scoring
  const goalX = 103;
  const goalY = 34;

  // Generate ball path based on play type
  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    let ballX: number, ballY: number;

    switch (playType) {
      case 'long_shot':
        ballX = 60 + t * 43;
        ballY = 30 + Math.sin(t * Math.PI * 0.8) * 10;
        break;
      case 'counter':
        ballX = 25 + t * 78;
        ballY = 34 + Math.sin(t * Math.PI * 3) * 18;
        break;
      case 'header':
        if (t < 0.6) {
          ballX = 70 + t * 35;
          ballY = 55 - t * 25;
        } else {
          ballX = 91 + (t - 0.6) * 30;
          ballY = 40 - (t - 0.6) * 15;
        }
        break;
      case 'cross':
        if (t < 0.4) {
          ballX = 70 + t * 35;
          ballY = 58 - t * 15;
        } else {
          ballX = 84 + (t - 0.4) * 32;
          ballY = 52 - (t - 0.4) * 30;
        }
        break;
      case 'penalty':
        ballX = 94 + t * 9;
        ballY = 34 + (t > 0.5 ? (t - 0.5) * 8 : 0);
        break;
      case 'team_play':
        ballX = 40 + t * 63;
        ballY = 34 + Math.sin(t * Math.PI * 4) * 12;
        break;
      default:
        ballX = 75 + t * 28;
        ballY = 36 + Math.sin(t * Math.PI * 2) * 6;
    }

    // Ensure ball ends at goal
    if (i === totalFrames - 1) {
      ballX = goalX;
      ballY = goalY;
    }

    // Generate player positions
    const players = generatePlayersForFrame(t, ballX, ballY, isHome);

    frames.push({
      timestamp: i * 0.1,
      players,
      ball: { x: ballX, y: ballY },
    });
  }

  return frames;
}

function generatePlayersForFrame(
  t: number,
  ballX: number,
  ballY: number,
  isHomeScoring: boolean
): { id: string; x: number; y: number; team: 'home' | 'away'; number: number }[] {
  const players: { id: string; x: number; y: number; team: 'home' | 'away'; number: number }[] = [];

  // Home team
  const homePositions = [
    { id: 'h1', num: 1, baseX: 5, baseY: 34 },
    { id: 'h2', num: 2, baseX: 22, baseY: 12 },
    { id: 'h3', num: 3, baseX: 20, baseY: 28 },
    { id: 'h4', num: 4, baseX: 20, baseY: 40 },
    { id: 'h5', num: 6, baseX: 22, baseY: 56 },
    { id: 'h6', num: 5, baseX: 40, baseY: 34 },
    { id: 'h7', num: 8, baseX: 50, baseY: 24 },
    { id: 'h8', num: 10, baseX: 55, baseY: 34, isScorer: true },
    { id: 'h9', num: 7, baseX: 68, baseY: 16 },
    { id: 'h10', num: 11, baseX: 68, baseY: 52 },
    { id: 'h11', num: 9, baseX: 75, baseY: 34 },
  ];

  homePositions.forEach((p, idx) => {
    let x = p.baseX;
    let y = p.baseY;

    if (isHomeScoring) {
      if (p.isScorer) {
        x = ballX - 2;
        y = ballY + Math.sin(t * 5) * 2;
      } else if (idx >= 8) {
        x = p.baseX + t * 28;
        y = p.baseY + (34 - p.baseY) * t * 0.4;
      } else if (idx >= 5) {
        x = p.baseX + t * 18;
      } else if (idx > 0) {
        x = p.baseX + t * 10;
      }
    }

    players.push({
      id: p.id,
      x: Math.max(2, Math.min(103, x + Math.sin(t * 6 + idx) * 1.2)),
      y: Math.max(5, Math.min(63, y + Math.cos(t * 4 + idx) * 1.8)),
      team: 'home',
      number: p.num,
    });
  });

  // Away team (defending)
  const awayPositions = [
    { id: 'a1', num: 1, baseX: 100, baseY: 34 },
    { id: 'a2', num: 2, baseX: 83, baseY: 12 },
    { id: 'a3', num: 3, baseX: 86, baseY: 28 },
    { id: 'a4', num: 4, baseX: 86, baseY: 40 },
    { id: 'a5', num: 5, baseX: 83, baseY: 56 },
    { id: 'a6', num: 6, baseX: 70, baseY: 34 },
    { id: 'a7', num: 8, baseX: 60, baseY: 42 },
    { id: 'a8', num: 10, baseX: 55, baseY: 28 },
    { id: 'a9', num: 7, baseX: 42, baseY: 20 },
    { id: 'a10', num: 11, baseX: 42, baseY: 48 },
    { id: 'a11', num: 9, baseX: 35, baseY: 34 },
  ];

  awayPositions.forEach((p, idx) => {
    let x = p.baseX + t * 10; // Retreat slightly
    let y = p.baseY;

    // Goalkeeper reacts to ball
    if (idx === 0 && t > 0.7) {
      y = ballY + (Math.random() - 0.5) * 4;
    }

    players.push({
      id: p.id,
      x: Math.max(2, Math.min(103, x + Math.sin(t * 5 + idx) * 1)),
      y: Math.max(5, Math.min(63, y + Math.cos(t * 3 + idx) * 1.5)),
      team: 'away',
      number: p.num,
    });
  });

  return players;
}
