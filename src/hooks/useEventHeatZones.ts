import { useMemo } from 'react';

interface MatchEvent {
  id: string;
  event_type: string;
  position_x?: number | null;
  position_y?: number | null;
  metadata?: unknown;
}

interface HeatZone {
  x: number;
  y: number;
  intensity: number;
  team: 'home' | 'away';
}

interface Player {
  x: number;
  y: number;
  number: number;
  team: 'home' | 'away';
  intensity?: number;
}

interface EventHeatData {
  heatZones: HeatZone[];
  homePlayers: Player[];
  awayPlayers: Player[];
}

// Event type weights for intensity calculation
const EVENT_WEIGHTS: Record<string, number> = {
  'goal': 1.0,
  'shot_on_target': 0.9,
  'shot': 0.8,
  'penalty': 0.95,
  'corner': 0.6,
  'cross': 0.7,
  'free_kick': 0.65,
  'foul': 0.5,
  'save': 0.7,
  'high_press': 0.6,
  'transition': 0.55,
  'ball_recovery': 0.5,
  'pass': 0.3,
  'offside': 0.4,
  'yellow_card': 0.45,
  'red_card': 0.5,
};

/**
 * Hook that generates heat zones based ONLY on real match events.
 * 
 * IMPORTANT: This hook no longer generates fictitious player positions.
 * Players are NOT rendered because we don't have real tracking data (YOLO/etc).
 * Only heat zones derived from actual events are returned.
 */
export function useEventHeatZones(
  events: MatchEvent[] | undefined,
  homeTeamName?: string,
  awayTeamName?: string
): EventHeatData {
  return useMemo(() => {
    const homeName = homeTeamName?.toLowerCase() || '';
    const awayName = awayTeamName?.toLowerCase() || '';
    
    // Group events by position with zone aggregation
    const zones: { x: number; y: number; intensity: number; team: 'home' | 'away'; count: number }[] = [];
    
    if (events && events.length > 0) {
      events.forEach(event => {
        let x = event.position_x;
        let y = event.position_y;
        
        const metadata = event.metadata as { team?: string; teamName?: string; fieldPosition?: string } | null;
        const teamName = metadata?.team || metadata?.teamName || '';
        const isHomeTeam = teamName.toLowerCase().includes(homeName) || 
                          homeName.includes(teamName.toLowerCase());
        
        // Infer position from event type if not provided
        if (x === null || x === undefined || y === null || y === undefined) {
          const eventType = event.event_type;
          if (['goal', 'shot', 'shot_on_target', 'penalty'].includes(eventType)) {
            x = isHomeTeam ? 85 + Math.random() * 10 : 5 + Math.random() * 10;
            y = 35 + Math.random() * 30;
          } else if (['corner', 'cross'].includes(eventType)) {
            x = isHomeTeam ? 90 + Math.random() * 5 : 5 + Math.random() * 5;
            y = Math.random() > 0.5 ? 10 + Math.random() * 15 : 75 + Math.random() * 15;
          } else if (['save'].includes(eventType)) {
            x = isHomeTeam ? 5 + Math.random() * 5 : 90 + Math.random() * 5;
            y = 40 + Math.random() * 20;
          } else if (['foul', 'free_kick'].includes(eventType)) {
            x = 30 + Math.random() * 40;
            y = 20 + Math.random() * 60;
          } else if (['high_press', 'ball_recovery'].includes(eventType)) {
            x = isHomeTeam ? 60 + Math.random() * 25 : 15 + Math.random() * 25;
            y = 20 + Math.random() * 60;
          } else {
            x = 30 + Math.random() * 40;
            y = 25 + Math.random() * 50;
          }
        }
        
        const weight = EVENT_WEIGHTS[event.event_type] || 0.4;
        
        const existingZone = zones.find(z => 
          Math.abs(z.x - (x as number)) < 10 && 
          Math.abs(z.y - (y as number)) < 10 && 
          z.team === (isHomeTeam ? 'home' : 'away')
        );
        
        if (existingZone) {
          existingZone.count++;
          existingZone.intensity = Math.min(1, existingZone.intensity + weight * 0.2);
          existingZone.x = (existingZone.x * (existingZone.count - 1) + (x as number)) / existingZone.count;
          existingZone.y = (existingZone.y * (existingZone.count - 1) + (y as number)) / existingZone.count;
        } else {
          zones.push({
            x: x as number,
            y: y as number,
            intensity: Math.min(1, weight + 0.2),
            team: isHomeTeam ? 'home' : 'away',
            count: 1
          });
        }
      });
    }
    
    // Normalize heat zones with minimum base intensity for visibility
    const heatZones = zones
      .map(z => ({
        x: z.x,
        y: z.y,
        intensity: Math.min(1, z.intensity * (1 + Math.log10(z.count + 1) * 0.3) + 0.25),
        team: z.team
      }))
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 20);
    
    // NO FICTITIOUS PLAYERS - return empty arrays
    // Players would only be returned if we had real tracking data from YOLO/etc
    const homePlayers: Player[] = [];
    const awayPlayers: Player[] = [];
    
    return { heatZones, homePlayers, awayPlayers };
  }, [events, homeTeamName, awayTeamName]);
}
