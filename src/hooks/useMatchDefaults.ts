import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface MatchDefaults {
  homeTeamId: string;
  awayTeamId: string;
  competition: string;
  matchDate: string;
  matchTime: string;
  venue: string;
}

/**
 * Fetches smart defaults for a new match based on the most recent match.
 * Auto-fills: date (today), time (now rounded), competition, venue, and teams from the last match.
 */
export function useMatchDefaults() {
  return useQuery({
    queryKey: ['match-defaults'],
    queryFn: async (): Promise<MatchDefaults> => {
      const now = new Date();
      const todayDate = format(now, 'yyyy-MM-dd');
      // Round to nearest hour
      const roundedHour = now.getMinutes() >= 30 ? now.getHours() + 1 : now.getHours();
      const todayTime = `${String(roundedHour % 24).padStart(2, '0')}:00`;

      // Fetch the most recent match with teams
      const { data: lastMatch } = await supabase
        .from('matches')
        .select('home_team_id, away_team_id, competition, venue')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        homeTeamId: lastMatch?.home_team_id || '',
        awayTeamId: lastMatch?.away_team_id || '',
        competition: lastMatch?.competition || '',
        matchDate: todayDate,
        matchTime: todayTime,
        venue: lastMatch?.venue || '',
      };
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}
