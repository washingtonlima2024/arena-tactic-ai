import { useMemo } from 'react';
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
 * Returns minimal smart defaults for a new match (only date/time).
 * Full metadata comes from AI analysis via Smart Import.
 */
export function useMatchDefaults() {
  const data = useMemo((): MatchDefaults => {
    const now = new Date();
    const todayDate = format(now, 'yyyy-MM-dd');
    const roundedHour = now.getMinutes() >= 30 ? now.getHours() + 1 : now.getHours();
    const todayTime = `${String(roundedHour % 24).padStart(2, '0')}:00`;

    return {
      homeTeamId: '',
      awayTeamId: '',
      competition: '',
      matchDate: todayDate,
      matchTime: todayTime,
      venue: '',
    };
  }, []);

  return { data, isLoading: false };
}
