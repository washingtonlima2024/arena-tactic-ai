/**
 * Match phase grouping utilities
 * Divides events into: 1º Tempo, Acréscimos 1T, Prorrogação 1T,
 * Intervalo, 2º Tempo, Acréscimos 2T, Prorrogação 2T
 */

export interface PhaseGroup<T> {
  phase: PhaseLabel;
  events: T[];
  homeGoals: number;
  awayGoals: number;
}

export type PhaseLabel =
  | '1º Tempo'
  | 'Acréscimos 1T'
  | 'Prorrogação 1T'
  | 'Intervalo'
  | '2º Tempo'
  | 'Acréscimos 2T'
  | 'Prorrogação 2T';

const PHASE_ORDER: PhaseLabel[] = [
  '1º Tempo',
  'Acréscimos 1T',
  'Prorrogação 1T',
  'Intervalo',
  '2º Tempo',
  'Acréscimos 2T',
  'Prorrogação 2T',
];

const FIRST_HALF_PHASES: PhaseLabel[] = ['1º Tempo', 'Acréscimos 1T', 'Prorrogação 1T'];
const SECOND_HALF_PHASES: PhaseLabel[] = ['2º Tempo', 'Acréscimos 2T', 'Prorrogação 2T'];

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
  const isExtraTime = (event.metadata as any)?.extra_time === true;

  if (half === 'first_half' || half === 'first') {
    if (isExtraTime || min > 50) return 'Prorrogação 1T';
    return min > 45 ? 'Acréscimos 1T' : '1º Tempo';
  }
  if (half === 'second_half' || half === 'second') {
    if (min > 120) return 'Prorrogação 2T';
    return min > 90 ? 'Acréscimos 2T' : '2º Tempo';
  }

  // Fallback by minute
  if (min <= 45) return '1º Tempo';
  if (min <= 50) return 'Acréscimos 1T';
  if (min <= 55) return 'Prorrogação 1T';
  if (min <= 90) return '2º Tempo';
  if (min <= 95) return 'Acréscimos 2T';
  return 'Prorrogação 2T';
}

/**
 * Group events by match phase with cumulative goal counting.
 * Always inserts an "Intervalo" group between 1T and 2T phases.
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

  const sorted = [...events].sort(
    (a, b) => (a.minute || 0) - (b.minute || 0)
  );

  sorted.forEach((event) => {
    const phase = getEventPhase(event);
    if (!phaseMap.has(phase)) phaseMap.set(phase, []);
    phaseMap.get(phase)!.push(event);
  });

  // Determine if we have any 1T or 2T events to decide whether to show Intervalo
  const has1T = FIRST_HALF_PHASES.some((p) => phaseMap.has(p));
  const has2T = SECOND_HALF_PHASES.some((p) => phaseMap.has(p));

  let cumulativeHome = 0;
  let cumulativeAway = 0;
  const groups: PhaseGroup<T>[] = [];

  for (const phase of PHASE_ORDER) {
    // Insert Intervalo if we have both halves
    if (phase === 'Intervalo') {
      if (has1T && has2T) {
        groups.push({
          phase: 'Intervalo',
          events: [],
          homeGoals: cumulativeHome,
          awayGoals: cumulativeAway,
        });
      }
      continue;
    }

    const phaseEvents = phaseMap.get(phase);
    if (!phaseEvents || phaseEvents.length === 0) continue;

    let phaseHomeGoals = 0;
    let phaseAwayGoals = 0;

    phaseEvents.forEach((event) => {
      const eventType = event.event_type || event.type || '';
      if (eventType === 'goal') {
        const team = getTeamType?.(event);
        if (team === 'home') phaseHomeGoals++;
        else if (team === 'away') phaseAwayGoals++;
        else phaseHomeGoals++;
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
