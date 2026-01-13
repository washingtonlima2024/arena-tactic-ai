import { useQuery } from '@tanstack/react-query';
import { apiClient, isLocalServerAvailable } from '@/lib/apiClient';
import { getEventHalf } from '@/lib/eventHelpers';
import { supabase } from '@/integrations/supabase/client';

export interface MatchWithDetails {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  competition: string | null;
  match_date: string | null;
  venue: string | null;
  status: string;
  home_team: {
    id: string;
    name: string;
    short_name: string;
    primary_color: string;
    secondary_color: string;
    logo_url: string | null;
  } | null;
  away_team: {
    id: string;
    name: string;
    short_name: string;
    primary_color: string;
    secondary_color: string;
    logo_url: string | null;
  } | null;
}

export interface MatchEvent {
  id: string;
  match_id: string;
  event_type: string;
  minute: number | null;
  second: number | null;
  description: string | null;
  player_id: string | null;
  position_x: number | null;
  position_y: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
  clip_url: string | null;
  is_highlight: boolean | null;
  approval_status: string | null;
  approved_by: string | null;
  approved_at: string | null;
  match_half?: string | null;
  computed_half?: 'first' | 'second';
}

export interface TacticalAnalysis {
  formation: {
    home: string;
    away: string;
  };
  possession: {
    home: number;
    away: number;
  };
  insights: string[];
  patterns: {
    type: string;
    description: string;
    effectiveness: number;
  }[];
}

export interface AnalysisResult {
  eventsGenerated: boolean;
  tacticalAnalysis: TacticalAnalysis;
  steps: {
    name: string;
    status: string;
    progress: number;
  }[];
}

// Helper function to fetch events with fallback to Supabase Cloud
async function fetchEventsWithFallback(matchId: string): Promise<any[]> {
  let events: any[] = [];

  // 1. Try local server first
  const serverUp = await isLocalServerAvailable();
  if (serverUp) {
    try {
      const localEvents = await apiClient.getMatchEvents(matchId);
      if (localEvents && localEvents.length > 0) {
        console.log(`[fetchEvents] ✓ ${localEvents.length} eventos do servidor local`);
        return localEvents;
      }
    } catch (err) {
      console.warn('[fetchEvents] Erro no servidor local:', err);
    }
  }

  // 2. Fallback to Supabase Cloud
  console.log('[fetchEvents] Tentando fallback para Cloud...');
  try {
    const { data: cloudEvents, error } = await supabase
      .from('match_events')
      .select('*')
      .eq('match_id', matchId)
      .order('minute', { ascending: true });
    
    if (!error && cloudEvents && cloudEvents.length > 0) {
      console.log(`[fetchEvents] ✓ ${cloudEvents.length} eventos do Cloud`);
      return cloudEvents;
    }
  } catch (cloudError) {
    console.error('[fetchEvents] Erro no Cloud fallback:', cloudError);
  }

  return events;
}

// Helper function to calculate scores from goal events
function calculateScoresFromGoals(
  goalEvents: any[], 
  homeTeamName?: string | null, 
  awayTeamName?: string | null
): { homeGoals: number; awayGoals: number } {
  let homeGoals = 0;
  let awayGoals = 0;

  goalEvents.forEach((goal: any) => {
    const metadata = goal.metadata as Record<string, any> | null;
    const team = metadata?.team || metadata?.scoring_team;
    const isOwnGoal = metadata?.isOwnGoal === true;

    if (isOwnGoal) {
      // Own goal: opposite team scores
      if (team === 'home') awayGoals++;
      else if (team === 'away') homeGoals++;
    } else {
      // Normal goal
      if (team === 'home' || team === homeTeamName) homeGoals++;
      else if (team === 'away' || team === awayTeamName) awayGoals++;
    }
  });

  return { homeGoals, awayGoals };
}

export function useMatchDetails(matchId: string | null) {
  return useQuery({
    queryKey: ['match-details', matchId],
    queryFn: async () => {
      if (!matchId) return null;
      const data = await apiClient.getMatch(matchId);
      const match = data as MatchWithDetails;
      
      const dbHomeScore = match.home_score ?? 0;
      const dbAwayScore = match.away_score ?? 0;
      
      // ALWAYS calculate scores from goal events (with Cloud fallback)
      try {
        const events = await fetchEventsWithFallback(matchId);
        const goalEvents = events.filter((e: any) => e.event_type === 'goal');
        
        if (goalEvents.length > 0) {
          const { homeGoals, awayGoals } = calculateScoresFromGoals(
            goalEvents,
            match.home_team?.name,
            match.away_team?.name
          );
          
          console.log(`[Score] Match ${matchId}: ${homeGoals}-${awayGoals} (${goalEvents.length} gols, DB era ${dbHomeScore}-${dbAwayScore})`);
          return { ...match, home_score: homeGoals, away_score: awayGoals };
        }
      } catch {
        // Fallback to DB values on error
      }
      
      return match;
    },
    enabled: !!matchId,
  });
}

export function useMatchEvents(matchId: string | null) {
  return useQuery({
    queryKey: ['match-events', matchId],
    queryFn: async () => {
      if (!matchId) return [];

      console.log('[useMatchEvents] Buscando eventos para matchId:', matchId);

      let events: MatchEvent[] = [];

      // 1. Tentar buscar do servidor local primeiro
      const serverUp = await isLocalServerAvailable();
      console.log('[useMatchEvents] Servidor local disponível:', serverUp);

      if (serverUp) {
        try {
          const localEvents = await apiClient.getMatchEvents(matchId);
          console.log('[useMatchEvents] Eventos do servidor local:', localEvents.length);
          events = localEvents as MatchEvent[];
        } catch (localError) {
          console.error('[useMatchEvents] Erro no servidor local:', localError);
        }
      }

      // 2. FALLBACK: Se não há eventos locais, buscar do Supabase Cloud
      if (events.length === 0) {
        console.log('[useMatchEvents] Sem eventos locais, tentando Cloud fallback...');
        try {
          const { data: cloudEvents, error } = await supabase
            .from('match_events')
            .select('*')
            .eq('match_id', matchId)
            .order('minute', { ascending: true });
          
          if (!error && cloudEvents && cloudEvents.length > 0) {
            console.log('[useMatchEvents] ✓ Eventos do Cloud:', cloudEvents.length);
            events = cloudEvents as MatchEvent[];
          } else if (error) {
            console.error('[useMatchEvents] Erro no Cloud fallback:', error);
          } else {
            console.log('[useMatchEvents] Nenhum evento encontrado no Cloud');
          }
        } catch (cloudError) {
          console.error('[useMatchEvents] Erro no Cloud fallback:', cloudError);
        }
      }

      console.log(`[useMatchEvents] Total: ${events.length} eventos`);

      // Get videos for time range filtering
      let validVideos: any[] = [];
      try {
        const videos = await apiClient.getVideos(matchId);
        validVideos = videos.filter((v: any) => v.start_minute != null && v.end_minute != null);
      } catch {
        // Ignore video fetch errors
      }

      // Normalize match_half for 'full' type videos (infer from minute)
      const normalizedEvents = events.map(event => ({
        ...event,
        computed_half: getEventHalf({ 
          minute: event.minute, 
          metadata: event.metadata, 
          match_half: event.match_half 
        })
      }));

      // Filter events to only those within video time range if videos exist
      if (validVideos.length > 0) {
        const videoRanges = validVideos.map((v: any) => ({
          start: v.start_minute ?? 0,
          end: v.end_minute ?? 90
        }));

        return normalizedEvents.filter(event => {
          if (event.minute === null) return true;
          return videoRanges.some((range: any) => 
            event.minute! >= range.start && event.minute! <= range.end
          );
        });
      }

      return normalizedEvents;
    },
    enabled: !!matchId,
  });
}

export interface ExtendedTacticalAnalysis extends TacticalAnalysis {
  matchSummary?: string;
  tacticalOverview?: string;
  standoutPlayers?: string[];
  keyMoments?: {
    timestamp: string;
    type: string;
    player: string;
    description: string;
  }[];
}

export function useMatchAnalysis(matchId: string | null) {
  return useQuery({
    queryKey: ['match-analysis', matchId],
    queryFn: async () => {
      if (!matchId) return null;

      const jobs = await apiClient.getAnalysisJobs(matchId);
      const completedJob = jobs.find((j: any) => j.status === 'completed');
      
      if (!completedJob) return null;
      
      const result = completedJob.result as {
        technicalAnalysis?: {
          matchSummary?: string;
          tacticalOverview?: string;
          formations?: { home: string; away: string };
          possessionEstimate?: { home: number; away: number };
          standoutPlayers?: string[];
          keyMoments?: { timestamp: string; type: string; player: string; description: string }[];
        };
        tacticalAnalysis?: TacticalAnalysis;
      } | null;
      
      const techAnalysis = result?.technicalAnalysis;
      const existingTactical = result?.tacticalAnalysis;
      
      const tacticalAnalysis: ExtendedTacticalAnalysis | null = techAnalysis ? {
        formation: techAnalysis.formations || existingTactical?.formation || { home: '4-3-3', away: '4-4-2' },
        possession: techAnalysis.possessionEstimate || existingTactical?.possession || { home: 50, away: 50 },
        insights: techAnalysis.keyMoments?.map(m => m.description) || existingTactical?.insights || [],
        patterns: existingTactical?.patterns || [],
        matchSummary: techAnalysis.matchSummary,
        tacticalOverview: techAnalysis.tacticalOverview,
        standoutPlayers: techAnalysis.standoutPlayers || [],
        keyMoments: techAnalysis.keyMoments || []
      } : existingTactical ? {
        ...existingTactical,
        matchSummary: undefined,
        tacticalOverview: undefined,
        standoutPlayers: [],
        keyMoments: []
      } : null;
      
      return {
        ...completedJob,
        tacticalAnalysis,
        rawResult: result
      };
    },
    enabled: !!matchId,
  });
}

export function useAllCompletedMatches() {
  return useQuery({
    queryKey: ['completed-matches'],
    queryFn: async () => {
      const matches = await apiClient.getMatches();
      
      // Filter for completed/live/analyzed/analyzing matches
      const filteredMatches = matches.filter((m: any) => 
        ['completed', 'live', 'analyzed', 'analyzing'].includes(m.status)
      );
      
      // Calculate scores from goals with Cloud fallback
      const matchesWithScores = await Promise.all(
        filteredMatches.map(async (match: any) => {
          const dbHomeScore = match.home_score ?? 0;
          const dbAwayScore = match.away_score ?? 0;
          
          try {
            // Use the helper with Cloud fallback
            const events = await fetchEventsWithFallback(match.id);
            const goalEvents = events.filter((e: any) => e.event_type === 'goal');
            
            if (goalEvents.length > 0) {
              const { homeGoals, awayGoals } = calculateScoresFromGoals(
                goalEvents,
                match.home_team?.name,
                match.away_team?.name
              );
              
              console.log(`[Score] Match ${match.id}: ${homeGoals}-${awayGoals} (${goalEvents.length} gols, DB era ${dbHomeScore}-${dbAwayScore})`);
              return { ...match, home_score: homeGoals, away_score: awayGoals, _calculated: true };
            }
          } catch {
            // Fallback to DB values on error
          }
          
          return { ...match, home_score: dbHomeScore, away_score: dbAwayScore };
        })
      );

      return matchesWithScores as MatchWithDetails[];
    },
  });
}
