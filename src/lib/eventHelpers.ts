/**
 * Helper functions for event handling consistency
 */

interface TeamInfo {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
}

interface EventMetadata {
  team?: 'home' | 'away';
  teamName?: string;
  isOwnGoal?: boolean;
  half?: 'first' | 'second' | 'full';
  [key: string]: any;
}

/**
 * Determines which team an event belongs to
 * Priority: metadata.team > metadata.teamName > fallback
 */
export function getEventTeam(
  event: { metadata?: EventMetadata | null; event_type?: string },
  homeTeam?: TeamInfo | null,
  awayTeam?: TeamInfo | null
): { team: TeamInfo | null; teamType: 'home' | 'away' | null } {
  const metadata = event.metadata;
  const isOwnGoal = metadata?.isOwnGoal === true;
  
  // Primary: use metadata.team ('home' or 'away')
  if (metadata?.team === 'home') {
    // For own goals, the beneficiary is the opposite team
    if (event.event_type === 'goal' && isOwnGoal) {
      return { team: awayTeam || null, teamType: 'away' };
    }
    return { team: homeTeam || null, teamType: 'home' };
  }
  
  if (metadata?.team === 'away') {
    if (event.event_type === 'goal' && isOwnGoal) {
      return { team: homeTeam || null, teamType: 'home' };
    }
    return { team: awayTeam || null, teamType: 'away' };
  }
  
  // Secondary: fallback to teamName matching
  if (metadata?.teamName && homeTeam?.name === metadata.teamName) {
    if (event.event_type === 'goal' && isOwnGoal) {
      return { team: awayTeam || null, teamType: 'away' };
    }
    return { team: homeTeam, teamType: 'home' };
  }
  
  if (metadata?.teamName && awayTeam?.name === metadata.teamName) {
    if (event.event_type === 'goal' && isOwnGoal) {
      return { team: homeTeam || null, teamType: 'home' };
    }
    return { team: awayTeam, teamType: 'away' };
  }
  
  return { team: null, teamType: null };
}

/**
 * Determines which half an event belongs to based on minute
 * Handles match_half: 'full' by inferring from minute
 */
export function getEventHalf(
  event: { minute?: number | null; metadata?: EventMetadata | null; match_half?: string | null }
): 'first' | 'second' {
  const matchHalf = event.match_half;
  
  // If explicitly set and not 'full', use it
  if (matchHalf === 'first') return 'first';
  if (matchHalf === 'second') return 'second';
  
  // For 'full' or undefined, infer from minute
  const minute = event.minute ?? 0;
  
  // Standard: 1st half = minutes 0-45, 2nd half = minutes 46+
  // Allow some buffer for injury time (up to 50 for 1st half)
  return minute <= 50 ? 'first' : 'second';
}

/**
 * Get event time in milliseconds for video playback
 */
export function getEventTimeMs(
  event: { minute?: number | null; second?: number | null; metadata?: { eventMs?: number; videoSecond?: number } | null }
): number {
  const metadata = event.metadata;
  
  // Priority: eventMs (ms) > videoSecond (s) > minute+second
  if (metadata?.eventMs !== undefined) {
    return metadata.eventMs;
  }
  if (metadata?.videoSecond !== undefined) {
    return metadata.videoSecond * 1000;
  }
  return ((event.minute || 0) * 60 + (event.second || 0)) * 1000;
}

/**
 * Format milliseconds to MM:SS display
 */
export function formatEventTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Count goals for each team from events
 */
export function countGoalsFromEvents(
  events: Array<{ event_type: string; metadata?: EventMetadata | null }>,
  homeTeamName?: string,
  awayTeamName?: string
): { home: number; away: number } {
  let home = 0;
  let away = 0;
  
  events
    .filter(e => e.event_type === 'goal')
    .forEach(goal => {
      const { teamType } = getEventTeam(
        goal,
        homeTeamName ? { id: '', name: homeTeamName } : null,
        awayTeamName ? { id: '', name: awayTeamName } : null
      );
      
      if (teamType === 'home') home++;
      else if (teamType === 'away') away++;
    });
  
  return { home, away };
}
