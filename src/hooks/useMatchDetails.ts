import { useQuery } from '@tanstack/react-query';
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
  } | null;
  away_team: {
    id: string;
    name: string;
    short_name: string;
    primary_color: string;
    secondary_color: string;
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

      const { data, error } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .order('minute', { ascending: true });

      if (error) throw error;
      return data as MatchEvent[];
    },
    enabled: !!matchId,
  });
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
      
      // Parse the result JSON - use unknown first for safe casting
      const result = data.result as unknown as AnalysisResult | null;
      return {
        ...data,
        tacticalAnalysis: result?.tacticalAnalysis || null,
      };
    },
    enabled: !!matchId,
  });
}

export function useAllCompletedMatches() {
  return useQuery({
    queryKey: ['completed-matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*)
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as MatchWithDetails[];
    },
  });
}
