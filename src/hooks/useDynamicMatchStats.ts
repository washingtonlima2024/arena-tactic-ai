import { useMemo } from 'react';

interface MatchEvent {
  id: string;
  event_type: string;
  description?: string | null;
  metadata?: Record<string, any> | null;
  minute?: number | null;
}

interface DynamicStats {
  score: { home: number; away: number };
  goals: { home: number; away: number; total: number };
  fouls: { home: number; away: number; total: number };
  cards: { home: number; away: number; total: number };
  yellowCards: { home: number; away: number; total: number };
  redCards: { home: number; away: number; total: number };
  corners: { home: number; away: number; total: number };
  offsides: { home: number; away: number; total: number };
  substitutions: { home: number; away: number; total: number };
  shots: { home: number; away: number; total: number };
  shotsOnTarget: { home: number; away: number; total: number };
  saves: { home: number; away: number; total: number };
  tactical: { home: number; away: number; total: number };
  pending: number;
  approved: number;
  total: number;
}

/**
 * Hook to calculate all match statistics dynamically from events.
 * This ensures all indicators are always up-to-date with the actual events.
 */
export function useDynamicMatchStats(
  events: MatchEvent[],
  homeTeamName: string = '',
  awayTeamName: string = ''
): DynamicStats {
  return useMemo(() => {
    // Helper to determine which team an event belongs to
    const getTeamType = (event: MatchEvent): 'home' | 'away' | 'unknown' => {
      const metadata = event.metadata;
      const description = (event.description || '').toLowerCase();
      const team = (metadata?.team || metadata?.scoring_team || '').toLowerCase();
      
      // Direct match
      if (team === 'home' || team === 'casa') return 'home';
      if (team === 'away' || team === 'visitante' || team === 'fora') return 'away';
      
      // Match by team name
      const homeNameLower = homeTeamName.toLowerCase();
      const awayNameLower = awayTeamName.toLowerCase();
      
      if (homeNameLower && team) {
        if (team.includes(homeNameLower.slice(0, 4)) || homeNameLower.includes(team.slice(0, 4))) {
          return 'home';
        }
      }
      if (awayNameLower && team) {
        if (team.includes(awayNameLower.slice(0, 4)) || awayNameLower.includes(team.slice(0, 4))) {
          return 'away';
        }
      }
      
      // Try description
      if (homeNameLower && description.includes(homeNameLower.slice(0, 4))) return 'home';
      if (awayNameLower && description.includes(awayNameLower.slice(0, 4))) return 'away';
      
      return 'unknown';
    };

    // Count events by type and team
    const countByTeam = (filteredEvents: MatchEvent[]) => {
      let home = 0, away = 0;
      filteredEvents.forEach(e => {
        const teamType = getTeamType(e);
        if (teamType === 'home') home++;
        else if (teamType === 'away') away++;
        else {
          // Unknown team - distribute based on minute (first half = home bias, second = away)
          // This is a fallback heuristic
          const minute = e.minute || 0;
          if (minute < 45) home++;
          else away++;
        }
      });
      return { home, away, total: home + away };
    };

    // Calculate score with own goal logic
    const calculateScore = () => {
      let homeGoals = 0;
      let awayGoals = 0;
      
      events.filter(e => e.event_type === 'goal').forEach(goal => {
        const metadata = goal.metadata;
        const description = (goal.description || '').toLowerCase();
        
        // Keywords alinhadas com backend (ai_services.py linha 4602)
        const ownGoalKeywords = [
          'gol contra', 
          'próprio gol', 
          'mandou contra', 
          'own goal', 
          'autogol',
          'contra o próprio',
          'próprio patrimônio'
        ];
        
        const isOwnGoal = 
          metadata?.isOwnGoal === true ||
          ownGoalKeywords.some(kw => description.includes(kw));
        
        const teamType = getTeamType(goal);
        
        if (isOwnGoal) {
          // Own goal: opposite team gets the point
          if (teamType === 'home') awayGoals++;
          else if (teamType === 'away') homeGoals++;
          else awayGoals++; // Default: home team concedes
        } else {
          // Normal goal
          if (teamType === 'home') homeGoals++;
          else if (teamType === 'away') awayGoals++;
          else {
            // Fallback: gol sem time identificado assume home (maioria das narrações foca no mandante)
            homeGoals++;
          }
        }
      });
      
      return { home: homeGoals, away: awayGoals };
    };

    // Filter events by type
    const goals = events.filter(e => e.event_type === 'goal');
    const fouls = events.filter(e => e.event_type === 'foul' || e.event_type === 'fault');
    const yellowCards = events.filter(e => e.event_type === 'yellow_card');
    const redCards = events.filter(e => e.event_type === 'red_card');
    const cards = events.filter(e => e.event_type.includes('card'));
    const corners = events.filter(e => e.event_type === 'corner');
    const offsides = events.filter(e => e.event_type === 'offside');
    const substitutions = events.filter(e => e.event_type === 'substitution');
    const shots = events.filter(e => 
      e.event_type === 'shot' || 
      e.event_type === 'shot_on_target' || 
      e.event_type === 'chance'
    );
    const shotsOnTarget = events.filter(e => e.event_type === 'shot_on_target');
    const saves = events.filter(e => e.event_type === 'save');
    const tactical = events.filter(e => 
      ['high_press', 'transition', 'ball_recovery', 'buildup'].includes(e.event_type)
    );

    const score = calculateScore();

    return {
      score,
      goals: countByTeam(goals),
      fouls: countByTeam(fouls),
      cards: countByTeam(cards),
      yellowCards: countByTeam(yellowCards),
      redCards: countByTeam(redCards),
      corners: countByTeam(corners),
      offsides: countByTeam(offsides),
      substitutions: countByTeam(substitutions),
      shots: countByTeam(shots),
      shotsOnTarget: countByTeam(shotsOnTarget),
      saves: countByTeam(saves),
      tactical: countByTeam(tactical),
      pending: events.filter(e => !e.metadata?.approval_status || e.metadata?.approval_status === 'pending').length,
      approved: events.filter(e => e.metadata?.approval_status === 'approved').length,
      total: events.length,
    };
  }, [events, homeTeamName, awayTeamName]);
}

/**
 * Simple helper to get score from events without the full hook
 */
export function calculateScoreFromEvents(
  events: MatchEvent[],
  homeTeamName: string = '',
  awayTeamName: string = ''
): { home: number; away: number } {
  let homeGoals = 0;
  let awayGoals = 0;
  
  const homeNameLower = homeTeamName.toLowerCase();
  const awayNameLower = awayTeamName.toLowerCase();
  
  events.filter(e => e.event_type === 'goal').forEach(goal => {
    const metadata = goal.metadata;
    const description = (goal.description || '').toLowerCase();
    const team = (metadata?.team || metadata?.scoring_team || '').toLowerCase();
    
    // Keywords alinhadas com backend (ai_services.py linha 4602)
    const ownGoalKeywords = [
      'gol contra', 
      'próprio gol', 
      'mandou contra', 
      'own goal', 
      'autogol',
      'contra o próprio',
      'próprio patrimônio'
    ];
    
    const isOwnGoal = 
      metadata?.isOwnGoal === true ||
      ownGoalKeywords.some(kw => description.includes(kw));
    
    // Determine team
    let teamType: 'home' | 'away' | 'unknown' = 'unknown';
    
    if (team === 'home' || team === 'casa') teamType = 'home';
    else if (team === 'away' || team === 'visitante' || team === 'fora') teamType = 'away';
    else if (homeNameLower && (team.includes(homeNameLower.slice(0, 4)) || homeNameLower.includes(team.slice(0, 4)))) {
      teamType = 'home';
    } else if (awayNameLower && (team.includes(awayNameLower.slice(0, 4)) || awayNameLower.includes(team.slice(0, 4)))) {
      teamType = 'away';
    } else if (homeNameLower && description.includes(homeNameLower.slice(0, 4))) {
      teamType = 'home';
    } else if (awayNameLower && description.includes(awayNameLower.slice(0, 4))) {
      teamType = 'away';
    } else {
      // Fallback: se não identificou time, assume home (maioria das narrações foca no mandante)
      teamType = 'home';
    }
    
    if (isOwnGoal) {
      if (teamType === 'home') awayGoals++;
      else if (teamType === 'away') homeGoals++;
      else awayGoals++;
    } else {
      if (teamType === 'home') homeGoals++;
      else if (teamType === 'away') awayGoals++;
      else homeGoals++; // Default to home
    }
  });
  
  return { home: homeGoals, away: awayGoals };
}
