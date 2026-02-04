import { supabase } from '@/integrations/supabase/client';
import { apiClient } from '@/lib/apiClient';

interface ScoreSyncResult {
  home: number;
  away: number;
  wasLocked: boolean;
  updated: boolean;
}

interface GoalEvent {
  metadata?: any;
  description?: string | null;
}

/**
 * Synchronizes match score from goal events.
 * Respects score_locked flag unless force is true.
 * Fetches events from local server first, then fallback to Supabase.
 * 
 * @param matchId - The match ID to sync
 * @param force - If true, updates even if score is locked
 * @returns Score result or null if locked and not forced
 */
export async function syncMatchScoreFromEvents(
  matchId: string,
  force = false
): Promise<ScoreSyncResult | null> {
  try {
    // 1. Check if score is locked
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('score_locked, home_score, away_score, home_team_id, away_team_id')
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      console.error('Error fetching match for score sync:', matchError);
      return null;
    }

    // If locked and not forced, skip sync
    if (match.score_locked && !force) {
      console.log('Score is locked, skipping auto-sync for match:', matchId);
      return {
        home: match.home_score || 0,
        away: match.away_score || 0,
        wasLocked: true,
        updated: false
      };
    }

    // 2. Fetch goal events - try local server first, then Supabase
    let goalEvents: GoalEvent[] = [];
    
    try {
      const localEvents = await apiClient.getMatchEvents(matchId);
      goalEvents = (localEvents || []).filter((e: any) => e.event_type === 'goal');
      console.log(`[ScoreSync] Found ${goalEvents.length} goals from local server`);
    } catch (localError) {
      console.log('[ScoreSync] Local server unavailable, trying Supabase...');
      const { data: supabaseEvents, error: eventsError } = await supabase
        .from('match_events')
        .select('metadata, description')
        .eq('match_id', matchId)
        .eq('event_type', 'goal');

      if (eventsError) {
        console.error('Error fetching goal events:', eventsError);
        return null;
      }
      goalEvents = supabaseEvents || [];
    }

    // 3. Get team names to help identify teams
    let homeTeamName = '';
    let awayTeamName = '';
    
    if (match.home_team_id) {
      const { data: homeTeam } = await supabase
        .from('teams')
        .select('name')
        .eq('id', match.home_team_id)
        .single();
      homeTeamName = homeTeam?.name || '';
    }
    
    if (match.away_team_id) {
      const { data: awayTeam } = await supabase
        .from('teams')
        .select('name')
        .eq('id', match.away_team_id)
        .single();
      awayTeamName = awayTeam?.name || '';
    }

    // 4. Calculate score from events
    let homeGoals = 0;
    let awayGoals = 0;

    goalEvents?.forEach(goal => {
      const metadata = goal.metadata as Record<string, any> | null;
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
      
      // Determine which team scored
      let team = metadata?.team || metadata?.scoring_team || '';
      
      // Try to match by team name if team is a name, not 'home'/'away'
      if (team && team !== 'home' && team !== 'away') {
        if (homeTeamName && team.toLowerCase().includes(homeTeamName.toLowerCase().slice(0, 5))) {
          team = 'home';
        } else if (awayTeamName && team.toLowerCase().includes(awayTeamName.toLowerCase().slice(0, 5))) {
          team = 'away';
        } else if (homeTeamName && homeTeamName.toLowerCase().includes(team.toLowerCase().slice(0, 5))) {
          team = 'home';
        } else if (awayTeamName && awayTeamName.toLowerCase().includes(team.toLowerCase().slice(0, 5))) {
          team = 'away';
        }
      }
      
      // Apply own goal logic
      if (isOwnGoal) {
        // Own goal: opposite team gets the point
        if (team === 'home' || team === homeTeamName) {
          awayGoals++;
        } else if (team === 'away' || team === awayTeamName) {
          homeGoals++;
        } else {
          // Can't determine team, default to home conceding
          awayGoals++;
        }
      } else {
        // Normal goal
        if (team === 'home' || team === homeTeamName) {
          homeGoals++;
        } else if (team === 'away' || team === awayTeamName) {
          awayGoals++;
        } else {
          // Try to infer from description
          if (homeTeamName && description.includes(homeTeamName.toLowerCase())) {
            homeGoals++;
          } else if (awayTeamName && description.includes(awayTeamName.toLowerCase())) {
            awayGoals++;
          }
          // If still can't determine, don't count (safer than guessing)
        }
      }
    });

    // 5. Update match score in database
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        home_score: homeGoals,
        away_score: awayGoals,
        score_locked: false, // Unlock since it was auto-synced
      })
      .eq('id', matchId);

    if (updateError) {
      console.error('Error updating match score:', updateError);
      return null;
    }

    // Also try to update via apiClient for local server sync
    try {
      await apiClient.updateMatch(matchId, {
        home_score: homeGoals,
        away_score: awayGoals,
      });
    } catch {
      // Local server might be offline, that's okay
    }

    console.log(`Score synced for match ${matchId}: ${homeGoals} x ${awayGoals}`);

    return {
      home: homeGoals,
      away: awayGoals,
      wasLocked: false,
      updated: true
    };
  } catch (error) {
    console.error('Error in syncMatchScoreFromEvents:', error);
    return null;
  }
}

/**
 * Locks/unlocks the match score to prevent/allow auto-sync
 */
export async function setMatchScoreLock(matchId: string, locked: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('matches')
      .update({ score_locked: locked })
      .eq('id', matchId);

    if (error) {
      console.error('Error setting score lock:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in setMatchScoreLock:', error);
    return false;
  }
}
