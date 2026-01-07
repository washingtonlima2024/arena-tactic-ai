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

// Default 4-4-2 formation positions (percentage of field)
const DEFAULT_HOME_FORMATION: { x: number; y: number; number: number }[] = [
  { x: 5, y: 50, number: 1 },   // GK
  { x: 20, y: 15, number: 2 },  // RB
  { x: 18, y: 38, number: 4 },  // CB
  { x: 18, y: 62, number: 5 },  // CB
  { x: 20, y: 85, number: 3 },  // LB
  { x: 40, y: 20, number: 7 },  // RM
  { x: 35, y: 40, number: 8 },  // CM
  { x: 35, y: 60, number: 6 },  // CM
  { x: 40, y: 80, number: 11 }, // LM
  { x: 55, y: 35, number: 9 },  // ST
  { x: 55, y: 65, number: 10 }, // ST
];

const DEFAULT_AWAY_FORMATION: { x: number; y: number; number: number }[] = [
  { x: 95, y: 50, number: 1 },  // GK
  { x: 80, y: 85, number: 2 },  // RB
  { x: 82, y: 62, number: 4 },  // CB
  { x: 82, y: 38, number: 5 },  // CB
  { x: 80, y: 15, number: 3 },  // LB
  { x: 60, y: 80, number: 7 },  // RM
  { x: 65, y: 60, number: 8 },  // CM
  { x: 65, y: 40, number: 6 },  // CM
  { x: 60, y: 20, number: 11 }, // LM
  { x: 45, y: 65, number: 9 },  // ST
  { x: 45, y: 35, number: 10 }, // ST
];

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
    
    // Track activity per zone for player intensity calculation
    const homeZoneActivity = new Map<string, number>();
    const awayZoneActivity = new Map<string, number>();
    
    if (events && events.length > 0) {
      events.forEach(event => {
        let x = event.position_x;
        let y = event.position_y;
        
        const metadata = event.metadata as { team?: string; teamName?: string; fieldPosition?: string } | null;
        const teamName = metadata?.team || metadata?.teamName || '';
        const isHomeTeam = teamName.toLowerCase().includes(homeName) || 
                          homeName.includes(teamName.toLowerCase());
        
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
        const zoneKey = `${Math.round((x as number) / 20)}-${Math.round((y as number) / 20)}`;
        
        if (isHomeTeam) {
          homeZoneActivity.set(zoneKey, (homeZoneActivity.get(zoneKey) || 0) + weight);
        } else {
          awayZoneActivity.set(zoneKey, (awayZoneActivity.get(zoneKey) || 0) + weight);
        }
        
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
    
    // Normalize heat zones
    const heatZones = zones
      .map(z => ({
        x: z.x,
        y: z.y,
        intensity: Math.min(1, z.intensity * (1 + Math.log10(z.count + 1) * 0.3)),
        team: z.team
      }))
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 15);
    
    // Generate players with intensities based on events
    const calculatePlayerIntensity = (
      playerX: number, 
      playerY: number, 
      team: 'home' | 'away'
    ): number => {
      const zoneActivity = team === 'home' ? homeZoneActivity : awayZoneActivity;
      const zoneKey = `${Math.round(playerX / 20)}-${Math.round(playerY / 20)}`;
      const activity = zoneActivity.get(zoneKey) || 0;
      
      // Also check nearby zones
      let nearbyActivity = 0;
      const nearbyZones = heatZones.filter(z => 
        z.team === team &&
        Math.abs(z.x - playerX) < 25 && 
        Math.abs(z.y - playerY) < 25
      );
      nearbyActivity = nearbyZones.reduce((acc, z) => acc + z.intensity, 0) / Math.max(nearbyZones.length, 1);
      
      // Base intensity + activity bonus
      const baseIntensity = 0.4;
      const activityBonus = Math.min(0.5, activity * 0.15);
      const proximityBonus = nearbyActivity * 0.3;
      
      return Math.min(1, baseIntensity + activityBonus + proximityBonus);
    };
    
    // Generate home players with slight random offset for natural look
    const homePlayers: Player[] = DEFAULT_HOME_FORMATION.map(pos => {
      const offsetX = (Math.random() - 0.5) * 4;
      const offsetY = (Math.random() - 0.5) * 4;
      const x = Math.max(2, Math.min(98, pos.x + offsetX));
      const y = Math.max(2, Math.min(98, pos.y + offsetY));
      
      return {
        x,
        y,
        number: pos.number,
        team: 'home' as const,
        intensity: calculatePlayerIntensity(x, y, 'home')
      };
    });
    
    // Generate away players
    const awayPlayers: Player[] = DEFAULT_AWAY_FORMATION.map(pos => {
      const offsetX = (Math.random() - 0.5) * 4;
      const offsetY = (Math.random() - 0.5) * 4;
      const x = Math.max(2, Math.min(98, pos.x + offsetX));
      const y = Math.max(2, Math.min(98, pos.y + offsetY));
      
      return {
        x,
        y,
        number: pos.number,
        team: 'away' as const,
        intensity: calculatePlayerIntensity(x, y, 'away')
      };
    });
    
    return { heatZones, homePlayers, awayPlayers };
  }, [events, homeTeamName, awayTeamName]);
}
