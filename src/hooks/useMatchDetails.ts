import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getEventHalf } from '@/lib/eventHelpers';

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
  computed_half?: 'first' | 'second'; // Inferred from minute when match_half is 'full'
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

export function useMatchDetails(matchId: string | null) {
  return useQuery({
    queryKey: ['match-details', matchId],
    queryFn: async () => {
      if (!matchId) return null;

      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*)
        `)
        .eq('id', matchId)
        .single();

      if (error) throw error;
      return data as MatchWithDetails;
    },
    enabled: !!matchId,
  });
}

export function useMatchEvents(matchId: string | null) {
  return useQuery({
    queryKey: ['match-events', matchId],
    queryFn: async () => {
      if (!matchId) return [];

      // First get the video time range for this match
      const { data: videos } = await supabase
        .from('videos')
        .select('start_minute, end_minute')
        .eq('match_id', matchId)
        .not('start_minute', 'is', null)
        .not('end_minute', 'is', null);

      // Get all events for this match
      let query = supabase
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .order('minute', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      // Normalize match_half for 'full' type videos (infer from minute)
      const normalizedEvents = (data as MatchEvent[]).map(event => ({
        ...event,
        // Add computed_half to help with filtering if match_half is 'full'
        computed_half: getEventHalf({ 
          minute: event.minute, 
          metadata: event.metadata, 
          match_half: (event as any).match_half 
        })
      }));

      // Filter events to only those within video time range if videos exist
      if (videos && videos.length > 0) {
        const videoRanges = videos.map(v => ({
          start: v.start_minute ?? 0,
          end: v.end_minute ?? 90
        }));

        // Keep events that fall within any video segment
        return normalizedEvents.filter(event => {
          if (event.minute === null) return true; // Keep events without minute
          return videoRanges.some(range => 
            event.minute! >= range.start && event.minute! <= range.end
          );
        });
      }

      return normalizedEvents;
    },
    enabled: !!matchId,
  });
}

// Extended tactical analysis interface with all fields from technicalAnalysis
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

      const { data, error } = await supabase
        .from('analysis_jobs')
        .select('*')
        .eq('match_id', matchId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      
      // Parse the result JSON - check both technicalAnalysis and tacticalAnalysis
      const result = data.result as unknown as {
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
      
      // Map technicalAnalysis to the format expected by frontend
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
        ...data,
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
      // Fetch matches with teams
      const { data: matches, error: matchError } = await supabase
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*)
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (matchError) throw matchError;
      
      // Fetch all events to calculate goals if scores are 0
      const { data: allEvents } = await supabase
        .from('match_events')
        .select('match_id, event_type, metadata');
      
      // Calculate scores from goals ONLY if database scores are both 0 and there are goals
      const matchesWithCalculatedScores = matches?.map(match => {
        // Se já tem score no banco, usar diretamente (não recalcular)
        const dbHomeScore = match.home_score ?? 0;
        const dbAwayScore = match.away_score ?? 0;
        
        // Só recalcular se AMBOS forem 0 E houver eventos de gol
        if (dbHomeScore === 0 && dbAwayScore === 0) {
          const matchEvents = allEvents?.filter(e => e.match_id === match.id) || [];
          const goalEvents = matchEvents.filter(e => e.event_type === 'goal');
          
          if (goalEvents.length > 0) {
            let homeGoals = 0;
            let awayGoals = 0;
            
            goalEvents.forEach(goal => {
              const metadata = goal.metadata as Record<string, any> | null;
              const team = metadata?.team || metadata?.scoring_team;
              const isOwnGoal = metadata?.isOwnGoal === true;
              
              // Para gols contra, inverter o beneficiário
              if (isOwnGoal) {
                if (team === 'home') {
                  awayGoals++;
                } else if (team === 'away') {
                  homeGoals++;
                }
              } else {
                if (team === 'home' || team === match.home_team?.name) {
                  homeGoals++;
                } else if (team === 'away' || team === match.away_team?.name) {
                  awayGoals++;
                }
              }
            });
            
            return {
              ...match,
              home_score: homeGoals,
              away_score: awayGoals,
              _calculated: true
            };
          }
        }
        
        // Usar scores do banco de dados diretamente
        return {
          ...match,
          home_score: dbHomeScore,
          away_score: dbAwayScore
        };
      }) || [];

      return matchesWithCalculatedScores as MatchWithDetails[];
    },
  });
}
