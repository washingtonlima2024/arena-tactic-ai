import { useMemo } from 'react';

interface MatchEvent {
  id: string;
  event_type: string;
  minute: number | null;
  second: number | null;
  description: string | null;
  match_half?: string | null;
  is_highlight?: boolean | null;
  metadata?: Record<string, any> | null;
}

interface Team {
  name: string;
  short_name?: string | null;
}

interface EventAnalysis {
  // Scores
  homeScore: number;
  awayScore: number;
  
  // Statistics by team
  homeStats: TeamStats;
  awayStats: TeamStats;
  
  // Generated content
  insights: string[];
  patterns: TacticalPattern[];
  keyMoments: KeyMoment[];
  matchSummary: string;
  tacticalOverview: string;
  standoutPlayers: string[];
  
  // Possession estimate
  possession: { home: number; away: number };
}

interface TeamStats {
  goals: number;
  shots: number;
  fouls: number;
  cards: number;
  corners: number;
  saves: number;
  recoveries: number;
  offsides: number;
}

interface TacticalPattern {
  type: string;
  description: string;
  effectiveness: number;
}

interface KeyMoment {
  timestamp: string;
  type: string;
  description: string;
  player?: string;
}

export function useEventBasedAnalysis(
  events: MatchEvent[],
  homeTeam?: Team | null,
  awayTeam?: Team | null
): EventAnalysis {
  return useMemo(() => {
    const homeName = homeTeam?.name || 'Time Casa';
    const awayName = awayTeam?.name || 'Time Visitante';
    
    // Initialize stats
    const homeStats: TeamStats = { goals: 0, shots: 0, fouls: 0, cards: 0, corners: 0, saves: 0, recoveries: 0, offsides: 0 };
    const awayStats: TeamStats = { goals: 0, shots: 0, fouls: 0, cards: 0, corners: 0, saves: 0, recoveries: 0, offsides: 0 };
    
    // Extract team from event (check metadata or description)
    const getEventTeam = (event: MatchEvent): 'home' | 'away' | null => {
      const meta = event.metadata as { team?: string } | null;
      if (meta?.team === 'home') return 'home';
      if (meta?.team === 'away') return 'away';
      
      // Check description for team names
      const desc = event.description?.toLowerCase() || '';
      if (desc.includes(homeName.toLowerCase()) || desc.includes(homeTeam?.short_name?.toLowerCase() || '')) return 'home';
      if (desc.includes(awayName.toLowerCase()) || desc.includes(awayTeam?.short_name?.toLowerCase() || '')) return 'away';
      
      return null;
    };
    
    // Process events
    const keyMoments: KeyMoment[] = [];
    const players: string[] = [];
    
    events.forEach(event => {
      const team = getEventTeam(event);
      const stats = team === 'home' ? homeStats : team === 'away' ? awayStats : null;
      const minute = event.minute || 0;
      const second = event.second || 0;
      const timestamp = `${minute}'${second > 0 ? `${second}"` : ''}`;
      
      // Extract player from description
      const playerMatch = event.description?.match(/(?:de|do|da|por)\s+([A-Z][a-záéíóú]+(?:\s+[A-Z][a-záéíóú]+)?)/i);
      const player = playerMatch ? playerMatch[1] : undefined;
      if (player && !players.includes(player)) players.push(player);
      
      switch (event.event_type) {
        case 'goal':
          if (stats) stats.goals++;
          keyMoments.push({
            timestamp,
            type: 'goal',
            description: event.description || `Gol aos ${minute}'`,
            player
          });
          break;
        case 'shot':
        case 'shot_on_target':
          if (stats) stats.shots++;
          if (event.is_highlight) {
            keyMoments.push({
              timestamp,
              type: 'shot',
              description: event.description || `Finalização aos ${minute}'`,
              player
            });
          }
          break;
        case 'save':
          if (stats) stats.saves++;
          keyMoments.push({
            timestamp,
            type: 'save',
            description: event.description || `Defesa aos ${minute}'`,
            player
          });
          break;
        case 'foul':
          if (stats) stats.fouls++;
          break;
        case 'yellow_card':
          if (stats) { stats.cards++; stats.fouls++; }
          keyMoments.push({
            timestamp,
            type: 'yellowCard',
            description: event.description || `Cartão amarelo aos ${minute}'`,
            player
          });
          break;
        case 'red_card':
          if (stats) { stats.cards += 2; stats.fouls++; }
          keyMoments.push({
            timestamp,
            type: 'redCard',
            description: event.description || `Cartão vermelho aos ${minute}'`,
            player
          });
          break;
        case 'corner':
          if (stats) stats.corners++;
          break;
        case 'offside':
          if (stats) stats.offsides++;
          break;
        case 'ball_recovery':
        case 'interception':
          if (stats) stats.recoveries++;
          break;
        case 'penalty':
          keyMoments.push({
            timestamp,
            type: 'penalty',
            description: event.description || `Pênalti aos ${minute}'`,
            player
          });
          break;
        case 'transition':
        case 'high_press':
          keyMoments.push({
            timestamp,
            type: 'transition',
            description: event.description || `Jogada tática aos ${minute}'`,
            player
          });
          break;
      }
    });
    
    // Calculate scores
    const homeScore = homeStats.goals;
    const awayScore = awayStats.goals;
    
    // Estimate possession based on events distribution
    const homeEvents = events.filter(e => getEventTeam(e) === 'home').length;
    const awayEvents = events.filter(e => getEventTeam(e) === 'away').length;
    const totalEvents = homeEvents + awayEvents || 1;
    const homePossession = Math.round((homeEvents / totalEvents) * 100);
    const awayPossession = 100 - homePossession;
    
    // Generate insights based on events
    const insights: string[] = [];
    
    if (homeStats.goals > awayStats.goals) {
      insights.push(`${homeName} dominou o placar com ${homeStats.goals} gol(s) contra ${awayStats.goals}.`);
    } else if (awayStats.goals > homeStats.goals) {
      insights.push(`${awayName} levou a melhor com ${awayStats.goals} gol(s) contra ${homeStats.goals}.`);
    } else if (homeStats.goals > 0) {
      insights.push(`Partida equilibrada com ${homeStats.goals} gol(s) para cada lado.`);
    }
    
    if (homeStats.shots + awayStats.shots > 0) {
      const totalShots = homeStats.shots + awayStats.shots;
      insights.push(`Total de ${totalShots} finalização(ões) na partida.`);
    }
    
    if (homeStats.saves + awayStats.saves > 0) {
      insights.push(`Os goleiros fizeram ${homeStats.saves + awayStats.saves} defesa(s) importantes.`);
    }
    
    if (homeStats.cards + awayStats.cards > 0) {
      insights.push(`Partida com ${homeStats.cards + awayStats.cards} cartão(ões) mostrado(s).`);
    }
    
    if (homeStats.corners + awayStats.corners > 0) {
      insights.push(`${homeStats.corners + awayStats.corners} escanteio(s) cobrado(s) durante o jogo.`);
    }
    
    // Generate tactical patterns
    const patterns: TacticalPattern[] = [];
    
    if (homeStats.recoveries > 3 || awayStats.recoveries > 3) {
      patterns.push({
        type: 'pressing',
        description: `Pressão alta efetiva com ${homeStats.recoveries + awayStats.recoveries} recuperações de bola.`,
        effectiveness: Math.min(0.9, (homeStats.recoveries + awayStats.recoveries) / 10)
      });
    }
    
    if (homeStats.corners + awayStats.corners > 3) {
      patterns.push({
        type: 'attacking_scheme',
        description: `Jogo ofensivo com ${homeStats.corners + awayStats.corners} escanteios conquistados.`,
        effectiveness: Math.min(0.85, (homeStats.corners + awayStats.corners) / 8)
      });
    }
    
    if (homeStats.saves + awayStats.saves > 3) {
      patterns.push({
        type: 'defensive_scheme',
        description: `Goleiros decisivos com ${homeStats.saves + awayStats.saves} defesas importantes.`,
        effectiveness: Math.min(0.95, (homeStats.saves + awayStats.saves) / 6)
      });
    }
    
    const totalTransitions = events.filter(e => e.event_type === 'transition').length;
    if (totalTransitions > 2) {
      patterns.push({
        type: 'transition',
        description: `${totalTransitions} transições rápidas identificadas, mostrando jogo dinâmico.`,
        effectiveness: Math.min(0.88, totalTransitions / 5)
      });
    }
    
    // Generate match summary
    let matchSummary = '';
    if (homeScore > awayScore) {
      matchSummary = `${homeName} venceu por ${homeScore} a ${awayScore}. `;
    } else if (awayScore > homeScore) {
      matchSummary = `${awayName} venceu por ${awayScore} a ${homeScore}. `;
    } else {
      matchSummary = `Empate em ${homeScore} a ${awayScore}. `;
    }
    
    matchSummary += `A partida teve ${events.length} evento(s) registrado(s)`;
    if (keyMoments.filter(k => k.type === 'goal').length > 0) {
      matchSummary += `, incluindo ${keyMoments.filter(k => k.type === 'goal').length} gol(s)`;
    }
    matchSummary += `. `;
    
    if (homeStats.shots + awayStats.shots > 0) {
      matchSummary += `Foram ${homeStats.shots + awayStats.shots} finalização(ões) ao gol. `;
    }
    
    // Generate tactical overview
    let tacticalOverview = '';
    if (homePossession > 55) {
      tacticalOverview = `${homeName} dominou a posse de bola estimada em ${homePossession}%. `;
    } else if (awayPossession > 55) {
      tacticalOverview = `${awayName} controlou o jogo com ${awayPossession}% de posse estimada. `;
    } else {
      tacticalOverview = `Partida equilibrada com posse dividida entre as equipes. `;
    }
    
    if (patterns.length > 0) {
      tacticalOverview += `Padrões táticos identificados: ${patterns.map(p => p.type.replace(/_/g, ' ')).join(', ')}. `;
    }
    
    // Sort key moments by time
    keyMoments.sort((a, b) => {
      const getMinutes = (ts: string) => parseInt(ts.replace("'", '').split('"')[0]) || 0;
      return getMinutes(a.timestamp) - getMinutes(b.timestamp);
    });
    
    // Get standout players (first 5)
    const standoutPlayers = players.slice(0, 5);
    
    return {
      homeScore,
      awayScore,
      homeStats,
      awayStats,
      insights,
      patterns,
      keyMoments,
      matchSummary,
      tacticalOverview,
      standoutPlayers,
      possession: { home: homePossession || 50, away: awayPossession || 50 }
    };
  }, [events, homeTeam, awayTeam]);
}
