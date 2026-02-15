/**
 * Match phase grouping utilities
 * Divides events into: 1º Tempo (0-45'), Acréscimos 1T (45+'), Intervalo,
 * 2º Tempo (45-90'), Acréscimos 2T (90+'), Prorrogação
 */

export interface PhaseGroup<T> {
  phase: string;
  events: T[];
  homeGoals: number;
  awayGoals: number;
}

export type PhaseLabel =
  | '1º Tempo'
  | 'Acréscimos 1T'
  | 'Intervalo'
  | '2º Tempo'
  | 'Acréscimos 2T'
  | 'Prorrogação';

const PHASE_ORDER: PhaseLabel[] = [
  '1º Tempo',
  'Acréscimos 1T',
  'Intervalo',
  '2º Tempo',
  'Acréscimos 2T',
  'Prorrogação',
];

export function getEventPhase(event: {
  minute?: number | null;
  metadata?: any;
  match_half?: string | null;
}): PhaseLabel {
  const min = event.minute || 0;
  const half =
    event.match_half ||
    (event.metadata as any)?.half ||
    (event.metadata as any)?.match_half;

  if (half === 'first_half' || half === 'first') {
    return min > 45 ? 'Acréscimos 1T' : '1º Tempo';
  }
  if (half === 'second_half' || half === 'second') {
    if (min > 120) return 'Prorrogação';
    return min > 90 ? 'Acréscimos 2T' : '2º Tempo';
  }

  // Fallback by minute
  if (min <= 45) return '1º Tempo';
  if (min <= 50) return 'Acréscimos 1T';
  if (min <= 90) return '2º Tempo';
  if (min <= 95) return 'Acréscimos 2T';
  return 'Prorrogação';
}

/**
 * Group events by match phase with cumulative goal counting.
 * Goals are accumulated across phases (1T goals carry into 2T display).
 */
export function groupEventsByPhase<
  T extends {
    minute?: number | null;
    metadata?: any;
    match_half?: string | null;
    event_type?: string;
    type?: string;
  }
>(
  events: T[],
  getTeamType?: (event: T) => 'home' | 'away' | null
): PhaseGroup<T>[] {
  const phaseMap = new Map<PhaseLabel, T[]>();

  // Sort events by minute
  const sorted = [...events].sort(
    (a, b) => (a.minute || 0) - (b.minute || 0)
  );

  sorted.forEach((event) => {
    const phase = getEventPhase(event);
    if (!phaseMap.has(phase)) phaseMap.set(phase, []);
    phaseMap.get(phase)!.push(event);
  });

  // Build groups in order with cumulative goals
  let cumulativeHome = 0;
  let cumulativeAway = 0;
  const groups: PhaseGroup<T>[] = [];

  for (const phase of PHASE_ORDER) {
    const phaseEvents = phaseMap.get(phase);
    if (!phaseEvents || phaseEvents.length === 0) continue;

    // Count goals in this phase
    let phaseHomeGoals = 0;
    let phaseAwayGoals = 0;

    phaseEvents.forEach((event) => {
      const eventType = event.event_type || event.type || '';
      if (eventType === 'goal') {
        const team = getTeamType?.(event);
        if (team === 'home') phaseHomeGoals++;
        else if (team === 'away') phaseAwayGoals++;
        else phaseHomeGoals++; // fallback to home
      }
    });

    cumulativeHome += phaseHomeGoals;
    cumulativeAway += phaseAwayGoals;

    groups.push({
      phase,
      events: phaseEvents,
      homeGoals: cumulativeHome,
      awayGoals: cumulativeAway,
    });
  }

  return groups;
}

export { PHASE_ORDER };
