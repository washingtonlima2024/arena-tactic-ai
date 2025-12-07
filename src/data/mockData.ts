import { Match, Team, Player, MatchEvent, PlayerStats, TeamStats, TacticalAnalysis, VideoClip, AnalysisJob } from '@/types/arena';

// Mock Teams
export const mockTeams: Team[] = [
  {
    id: 'team-1',
    name: 'FC Barcelona',
    shortName: 'BAR',
    primaryColor: '#A50044',
    secondaryColor: '#004D98',
  },
  {
    id: 'team-2',
    name: 'Real Madrid',
    shortName: 'RMA',
    primaryColor: '#FFFFFF',
    secondaryColor: '#00529F',
  },
  {
    id: 'team-3',
    name: 'Manchester City',
    shortName: 'MCI',
    primaryColor: '#6CABDD',
    secondaryColor: '#1C2C5B',
  },
  {
    id: 'team-4',
    name: 'Liverpool FC',
    shortName: 'LIV',
    primaryColor: '#C8102E',
    secondaryColor: '#00B2A9',
  },
];

// Mock Players
export const mockPlayers: Player[] = [
  { id: 'p1', name: 'Marc-André ter Stegen', number: 1, position: 'GK', teamId: 'team-1' },
  { id: 'p2', name: 'Ronald Araújo', number: 4, position: 'DEF', teamId: 'team-1' },
  { id: 'p3', name: 'Pedri', number: 8, position: 'MID', teamId: 'team-1' },
  { id: 'p4', name: 'Robert Lewandowski', number: 9, position: 'FWD', teamId: 'team-1' },
  { id: 'p5', name: 'Lamine Yamal', number: 19, position: 'FWD', teamId: 'team-1' },
  { id: 'p6', name: 'Thibaut Courtois', number: 1, position: 'GK', teamId: 'team-2' },
  { id: 'p7', name: 'Antonio Rüdiger', number: 22, position: 'DEF', teamId: 'team-2' },
  { id: 'p8', name: 'Jude Bellingham', number: 5, position: 'MID', teamId: 'team-2' },
  { id: 'p9', name: 'Vinícius Júnior', number: 7, position: 'FWD', teamId: 'team-2' },
  { id: 'p10', name: 'Kylian Mbappé', number: 9, position: 'FWD', teamId: 'team-2' },
];

// Mock Matches
export const mockMatches: Match[] = [
  {
    id: 'match-1',
    homeTeam: mockTeams[0],
    awayTeam: mockTeams[1],
    date: '2024-12-07T20:00:00Z',
    competition: 'La Liga',
    venue: 'Camp Nou',
    status: 'completed',
    score: { home: 2, away: 1 },
    analysisProgress: 100,
  },
  {
    id: 'match-2',
    homeTeam: mockTeams[2],
    awayTeam: mockTeams[3],
    date: '2024-12-06T17:30:00Z',
    competition: 'Premier League',
    venue: 'Etihad Stadium',
    status: 'analyzing',
    score: { home: 3, away: 2 },
    analysisProgress: 67,
  },
  {
    id: 'match-3',
    homeTeam: mockTeams[1],
    awayTeam: mockTeams[2],
    date: '2024-12-10T21:00:00Z',
    competition: 'Champions League',
    venue: 'Santiago Bernabéu',
    status: 'scheduled',
    score: { home: 0, away: 0 },
  },
];

// Mock Events for match-1
export const mockEvents: MatchEvent[] = [
  { id: 'e1', matchId: 'match-1', type: 'goal', minute: 23, playerId: 'p4', teamId: 'team-1', position: { x: 88, y: 45 } },
  { id: 'e2', matchId: 'match-1', type: 'assist', minute: 23, playerId: 'p5', teamId: 'team-1', position: { x: 75, y: 30 } },
  { id: 'e3', matchId: 'match-1', type: 'yellow_card', minute: 34, playerId: 'p7', teamId: 'team-2', position: { x: 45, y: 50 } },
  { id: 'e4', matchId: 'match-1', type: 'shot_on_target', minute: 41, playerId: 'p9', teamId: 'team-2', position: { x: 82, y: 48 } },
  { id: 'e5', matchId: 'match-1', type: 'save', minute: 41, playerId: 'p1', teamId: 'team-1', position: { x: 5, y: 50 } },
  { id: 'e6', matchId: 'match-1', type: 'goal', minute: 56, playerId: 'p8', teamId: 'team-2', position: { x: 90, y: 52 } },
  { id: 'e7', matchId: 'match-1', type: 'corner', minute: 67, teamId: 'team-1', position: { x: 100, y: 0 } },
  { id: 'e8', matchId: 'match-1', type: 'goal', minute: 78, playerId: 'p3', teamId: 'team-1', position: { x: 85, y: 40 } },
  { id: 'e9', matchId: 'match-1', type: 'foul', minute: 82, playerId: 'p10', teamId: 'team-2', position: { x: 35, y: 60 } },
  { id: 'e10', matchId: 'match-1', type: 'high_press', minute: 88, teamId: 'team-1', position: { x: 70, y: 50 } },
];

// Mock Player Stats
export const mockPlayerStats: PlayerStats[] = [
  {
    playerId: 'p4',
    matchId: 'match-1',
    minutesPlayed: 90,
    goals: 1,
    assists: 0,
    shots: 4,
    shotsOnTarget: 2,
    passes: 28,
    passAccuracy: 82,
    tackles: 1,
    interceptions: 0,
    duelsWon: 6,
    duelsLost: 4,
    distanceCovered: 9.8,
    maxSpeed: 28.5,
    avgSpeed: 6.2,
    heatmap: {
      zones: [
        { x: 75, y: 40, intensity: 0.9 },
        { x: 80, y: 50, intensity: 0.8 },
        { x: 85, y: 45, intensity: 0.95 },
        { x: 70, y: 55, intensity: 0.6 },
        { x: 90, y: 48, intensity: 0.7 },
      ],
    },
    touches: [
      { x: 75, y: 40, minute: 10, action: 'pass' },
      { x: 88, y: 45, minute: 23, action: 'goal' },
      { x: 80, y: 50, minute: 45, action: 'shot' },
    ],
  },
];

// Mock Team Stats
export const mockTeamStats: TeamStats[] = [
  {
    teamId: 'team-1',
    matchId: 'match-1',
    possession: 58,
    shots: 14,
    shotsOnTarget: 6,
    corners: 7,
    fouls: 11,
    offsides: 2,
    passes: 542,
    passAccuracy: 89,
    tackles: 18,
    interceptions: 12,
    expectedGoals: 2.34,
    pressureEvents: 45,
    recoveries: 38,
    buildupPlays: 23,
  },
  {
    teamId: 'team-2',
    matchId: 'match-1',
    possession: 42,
    shots: 10,
    shotsOnTarget: 4,
    corners: 4,
    fouls: 14,
    offsides: 3,
    passes: 398,
    passAccuracy: 84,
    tackles: 22,
    interceptions: 15,
    expectedGoals: 1.56,
    pressureEvents: 32,
    recoveries: 28,
    buildupPlays: 15,
  },
];

// Mock Tactical Analysis
export const mockTacticalAnalysis: TacticalAnalysis = {
  id: 'ta-1',
  matchId: 'match-1',
  formation: {
    home: '4-3-3',
    away: '4-4-2',
  },
  patterns: [
    {
      id: 'pat-1',
      type: 'buildup',
      description: 'Construção ofensiva pelo lado esquerdo com triangulações',
      occurrences: 12,
      effectiveness: 0.75,
      visualizations: [],
    },
    {
      id: 'pat-2',
      type: 'pressing',
      description: 'Pressão alta após perda de bola nos 10 segundos iniciais',
      occurrences: 8,
      effectiveness: 0.62,
      visualizations: [],
    },
    {
      id: 'pat-3',
      type: 'set_piece',
      description: 'Escanteios curtos com movimentação para a entrada da área',
      occurrences: 5,
      effectiveness: 0.40,
      visualizations: [],
    },
  ],
  predictions: [
    {
      id: 'pred-1',
      scenario: 'Probabilidade de finalização em escanteio ofensivo',
      probability: 0.42,
      recommendation: 'Ajustar posicionamento do zagueiro central para marcação individual',
      impact: 'high',
    },
    {
      id: 'pred-2',
      scenario: 'Chance de contra-ataque após recuperação no meio-campo',
      probability: 0.68,
      recommendation: 'Manter linha de quatro compacta e transições rápidas',
      impact: 'medium',
    },
  ],
  insights: [
    {
      id: 'ins-1',
      title: 'Domínio Territorial',
      description: 'O time da casa manteve superioridade posicional durante 72% do jogo, especialmente no terço final.',
      category: 'offensive',
      importance: 9,
      dataPoints: ['58% posse', '14 finalizações', '7 escanteios'],
    },
    {
      id: 'ins-2',
      title: 'Vulnerabilidade em Transições',
      description: 'A equipe visitante criou perigo em contra-ataques rápidos, explorando espaços deixados pela linha alta.',
      category: 'transition',
      importance: 8,
      dataPoints: ['3 contra-ataques perigosos', '1 gol em transição'],
    },
    {
      id: 'ins-3',
      title: 'Eficiência em Bolas Paradas',
      description: 'Os escanteios curtos resultaram em 2 finalizações perigosas e 1 gol.',
      category: 'set_piece',
      importance: 7,
      dataPoints: ['5 escanteios curtos', '40% efetividade'],
    },
  ],
};

// Mock Video Clips
export const mockVideoClips: VideoClip[] = [
  {
    id: 'clip-1',
    matchId: 'match-1',
    title: 'Gol de Lewandowski - 23\'',
    description: 'Finalização precisa após jogada trabalhada pela esquerda',
    startTime: 1380,
    endTime: 1410,
    events: ['e1', 'e2'],
    type: 'highlight',
  },
  {
    id: 'clip-2',
    matchId: 'match-1',
    title: 'Defesa espetacular de Ter Stegen - 41\'',
    description: 'Defesa reflexa em chute de Vinícius Jr.',
    startTime: 2460,
    endTime: 2480,
    events: ['e4', 'e5'],
    type: 'highlight',
  },
  {
    id: 'clip-3',
    matchId: 'match-1',
    title: 'Gol da virada - Pedri 78\'',
    description: 'Chute de fora da área no ângulo',
    startTime: 4680,
    endTime: 4710,
    events: ['e8'],
    type: 'highlight',
  },
];

// Mock Analysis Job
export const mockAnalysisJob: AnalysisJob = {
  id: 'job-1',
  matchId: 'match-2',
  status: 'processing',
  progress: 67,
  currentStep: 'Gerando métricas de rastreamento',
  steps: [
    { name: 'Upload do vídeo', status: 'completed', progress: 100 },
    { name: 'Detecção de jogadores', status: 'completed', progress: 100 },
    { name: 'Rastreamento de movimento', status: 'completed', progress: 100 },
    { name: 'Identificação de eventos', status: 'processing', progress: 45 },
    { name: 'Análise tática', status: 'pending', progress: 0 },
    { name: 'Geração de insights', status: 'pending', progress: 0 },
    { name: 'Criação de cortes', status: 'pending', progress: 0 },
  ],
  startedAt: '2024-12-07T14:30:00Z',
};

// Dashboard stats
export const mockDashboardStats = {
  totalMatches: 47,
  analyzedMatches: 42,
  totalEvents: 8934,
  totalInsights: 312,
  avgAnalysisTime: '12:34',
  accuracyRate: 94.7,
};
