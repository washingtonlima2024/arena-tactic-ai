// Types for Arena Play Platform

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  date: string;
  competition: string;
  venue: string;
  status: 'scheduled' | 'live' | 'completed' | 'analyzing';
  score: {
    home: number;
    away: number;
  };
  videoUrl?: string;
  analysisProgress?: number;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface Player {
  id: string;
  name: string;
  number: number;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  teamId: string;
  photo?: string;
}

export interface MatchEvent {
  id: string;
  matchId: string;
  type: EventType;
  minute: number;
  second?: number;
  playerId?: string;
  teamId: string;
  position?: { x: number; y: number };
  details?: Record<string, any>;
  videoTimestamp?: number;
}

export type EventType = 
  | 'goal'
  | 'assist'
  | 'shot'
  | 'shot_on_target'
  | 'save'
  | 'foul'
  | 'yellow_card'
  | 'red_card'
  | 'offside'
  | 'corner'
  | 'free_kick'
  | 'penalty'
  | 'substitution'
  | 'pass'
  | 'cross'
  | 'tackle'
  | 'interception'
  | 'clearance'
  | 'duel_won'
  | 'duel_lost'
  | 'ball_recovery'
  | 'ball_loss'
  | 'high_press'
  | 'transition'
  | 'buildup';

export interface PlayerStats {
  playerId: string;
  matchId: string;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passAccuracy: number;
  tackles: number;
  interceptions: number;
  duelsWon: number;
  duelsLost: number;
  distanceCovered: number;
  maxSpeed: number;
  avgSpeed: number;
  heatmap: HeatmapData;
  touches: TouchData[];
}

export interface HeatmapData {
  zones: {
    x: number;
    y: number;
    intensity: number;
  }[];
}

export interface TouchData {
  x: number;
  y: number;
  minute: number;
  action: string;
}

export interface TeamStats {
  teamId: string;
  matchId: string;
  possession: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  offsides: number;
  passes: number;
  passAccuracy: number;
  tackles: number;
  interceptions: number;
  expectedGoals: number;
  pressureEvents: number;
  recoveries: number;
  buildupPlays: number;
}

export interface TacticalAnalysis {
  id: string;
  matchId: string;
  formation: {
    home: string;
    away: string;
  };
  patterns: TacticalPattern[];
  predictions: TacticalPrediction[];
  insights: TacticalInsight[];
}

export interface TacticalPattern {
  id: string;
  type: 'set_piece' | 'buildup' | 'pressing' | 'transition' | 'defensive_block';
  description: string;
  occurrences: number;
  effectiveness: number;
  visualizations: string[];
}

export interface TacticalPrediction {
  id: string;
  scenario: string;
  probability: number;
  recommendation: string;
  impact: 'low' | 'medium' | 'high';
}

export interface TacticalInsight {
  id: string;
  title: string;
  description: string;
  category: 'offensive' | 'defensive' | 'transition' | 'set_piece';
  importance: number;
  dataPoints: string[];
}

export interface VideoClip {
  id: string;
  matchId: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  events: string[];
  thumbnail?: string;
  url?: string;
  type: 'highlight' | 'tactical' | 'player' | 'custom';
}

export interface MediaContent {
  id: string;
  matchId: string;
  type: 'narration' | 'podcast' | 'summary' | 'social_post';
  title: string;
  content: string;
  audioUrl?: string;
  language: string;
  duration?: number;
  createdAt: string;
}

export interface AnalysisJob {
  id: string;
  matchId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  steps: {
    name: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
  }[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
