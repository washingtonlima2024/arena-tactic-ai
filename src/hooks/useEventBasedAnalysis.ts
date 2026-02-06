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

export interface BestPlayer {
  name: string;
  team: 'home' | 'away';
  goals: number;
  assists: number;
  saves: number;
  recoveries: number;
  totalActions: number;
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
  
  // Best player
  bestPlayer: BestPlayer | null;
  
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
    
    // Player action tracking for best player calculation
    const playerActions: Record<string, { 
      team: 'home' | 'away'; 
      goals: number; 
      assists: number; 
      saves: number; 
      recoveries: number; 
      totalActions: number;
    }> = {};
    
    // Extract team from event
    const getEventTeam = (event: MatchEvent): 'home' | 'away' | null => {
      const meta = event.metadata as { team?: string } | null;
      if (meta?.team === 'home') return 'home';
      if (meta?.team === 'away') return 'away';
      
      const desc = event.description?.toLowerCase() || '';
      if (desc.includes(homeName.toLowerCase()) || desc.includes(homeTeam?.short_name?.toLowerCase() || '')) return 'home';
      if (desc.includes(awayName.toLowerCase()) || desc.includes(awayTeam?.short_name?.toLowerCase() || '')) return 'away';
      
      return null;
    };
    
    // Track player action
    const trackPlayer = (name: string, team: 'home' | 'away', action: 'goal' | 'assist' | 'save' | 'recovery' | 'other') => {
      if (!playerActions[name]) {
        playerActions[name] = { team, goals: 0, assists: 0, saves: 0, recoveries: 0, totalActions: 0 };
      }
      playerActions[name].totalActions++;
      if (action === 'goal') playerActions[name].goals++;
      else if (action === 'assist') playerActions[name].assists++;
      else if (action === 'save') playerActions[name].saves++;
      else if (action === 'recovery') playerActions[name].recoveries++;
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
        case 'goal': {
          const isOwnGoal = (event.metadata as { isOwnGoal?: boolean })?.isOwnGoal === true;
          if (isOwnGoal) {
            const opposingStats = team === 'home' ? awayStats : team === 'away' ? homeStats : null;
            if (opposingStats) opposingStats.goals++;
            keyMoments.push({ timestamp, type: 'ownGoal', description: event.description || `Gol contra aos ${minute}'`, player });
          } else {
            if (stats) stats.goals++;
            keyMoments.push({ timestamp, type: 'goal', description: event.description || `Gol aos ${minute}'`, player });
            if (player && team) trackPlayer(player, team, 'goal');
          }
          break;
        }
        case 'shot':
        case 'shot_on_target':
          if (stats) stats.shots++;
          if (event.is_highlight) {
            keyMoments.push({ timestamp, type: 'shot', description: event.description || `Finalizacao aos ${minute}'`, player });
          }
          if (player && team) trackPlayer(player, team, 'other');
          break;
        case 'save':
          if (stats) stats.saves++;
          keyMoments.push({ timestamp, type: 'save', description: event.description || `Defesa aos ${minute}'`, player });
          if (player && team) trackPlayer(player, team, 'save');
          break;
        case 'foul':
          if (stats) stats.fouls++;
          break;
        case 'yellow_card':
          if (stats) { stats.cards++; stats.fouls++; }
          keyMoments.push({ timestamp, type: 'yellowCard', description: event.description || `Cartao amarelo aos ${minute}'`, player });
          break;
        case 'red_card':
          if (stats) { stats.cards += 2; stats.fouls++; }
          keyMoments.push({ timestamp, type: 'redCard', description: event.description || `Cartao vermelho aos ${minute}'`, player });
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
          if (player && team) trackPlayer(player, team, 'recovery');
          break;
        case 'penalty':
          keyMoments.push({ timestamp, type: 'penalty', description: event.description || `Penalti aos ${minute}'`, player });
          break;
        case 'transition':
        case 'high_press':
          keyMoments.push({ timestamp, type: 'transition', description: event.description || `Jogada tatica aos ${minute}'`, player });
          break;
        case 'assist':
          if (player && team) trackPlayer(player, team, 'assist');
          break;
      }
    });
    
    // Calculate scores
    const homeScore = homeStats.goals;
    const awayScore = awayStats.goals;
    
    // Estimate possession
    const homeEvents = events.filter(e => getEventTeam(e) === 'home').length;
    const awayEvents = events.filter(e => getEventTeam(e) === 'away').length;
    const totalEvents = homeEvents + awayEvents;
    const homePossession = totalEvents < 10 ? 50 : Math.round((homeEvents / totalEvents) * 100);
    const awayPossession = 100 - homePossession;
    
    // Determine best player
    let bestPlayer: BestPlayer | null = null;
    const playerEntries = Object.entries(playerActions);
    if (playerEntries.length > 0) {
      const scored = playerEntries
        .map(([name, data]) => ({
          name,
          ...data,
          score: data.goals * 5 + data.assists * 3 + data.saves * 2 + data.recoveries * 1 + data.totalActions * 0.5,
        }))
        .sort((a, b) => b.score - a.score);
      
      if (scored[0] && scored[0].totalActions >= 2) {
        const { name, team, goals, assists, saves, recoveries, totalActions } = scored[0];
        bestPlayer = { name, team, goals, assists, saves, recoveries, totalActions };
      }
    }
    
    // Generate insights
    const insights: string[] = [];
    
    if (homeStats.goals > awayStats.goals) {
      insights.push(`${homeName} dominou o placar com ${homeStats.goals} gol(s) contra ${awayStats.goals}.`);
    } else if (awayStats.goals > homeStats.goals) {
      insights.push(`${awayName} levou a melhor com ${awayStats.goals} gol(s) contra ${homeStats.goals}.`);
    } else if (homeStats.goals > 0) {
      insights.push(`Partida equilibrada com ${homeStats.goals} gol(s) para cada lado.`);
    }
    
    if (homeStats.shots + awayStats.shots > 0) {
      insights.push(`Total de ${homeStats.shots + awayStats.shots} finalizacao(oes) na partida.`);
    }
    
    if (homeStats.saves + awayStats.saves > 0) {
      insights.push(`Os goleiros fizeram ${homeStats.saves + awayStats.saves} defesa(s) importantes.`);
    }
    
    if (homeStats.cards + awayStats.cards > 0) {
      insights.push(`Partida com ${homeStats.cards + awayStats.cards} cartao(oes) mostrado(s).`);
    }
    
    if (homeStats.corners + awayStats.corners > 0) {
      insights.push(`${homeStats.corners + awayStats.corners} escanteio(s) cobrado(s) durante o jogo.`);
    }
    
    // Generate tactical patterns
    const patterns: TacticalPattern[] = [];
    
    if (homeStats.recoveries > 3 || awayStats.recoveries > 3) {
      patterns.push({
        type: 'pressing',
        description: `Pressao alta efetiva com ${homeStats.recoveries + awayStats.recoveries} recuperacoes de bola.`,
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
        description: `${totalTransitions} transicoes rapidas identificadas, mostrando jogo dinamico.`,
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
    const goalCount = keyMoments.filter(k => k.type === 'goal' || k.type === 'ownGoal').length;
    if (goalCount > 0) {
      matchSummary += `, incluindo ${goalCount} gol(s)`;
    }
    matchSummary += `. `;
    
    if (homeStats.shots + awayStats.shots > 0) {
      matchSummary += `Foram ${homeStats.shots + awayStats.shots} finalizacao(oes) ao gol. `;
    }
    
    if (bestPlayer) {
      matchSummary += `Destaque para ${bestPlayer.name} com ${bestPlayer.totalActions} acoes decisivas. `;
    }
    
    // Generate tactical overview
    let tacticalOverview = '';
    if (totalEvents >= 10) {
      if (homePossession > 55) {
        tacticalOverview = `${homeName} dominou a posse de bola estimada em ${homePossession}%. `;
      } else if (awayPossession > 55) {
        tacticalOverview = `${awayName} controlou o jogo com ${awayPossession}% de posse estimada. `;
      } else {
        tacticalOverview = `Partida equilibrada com posse dividida entre as equipes. `;
      }
    } else {
      tacticalOverview = `Analise baseada em ${events.length} evento(s) detectado(s). `;
    }
    
    if (patterns.length > 0) {
      tacticalOverview += `Padroes taticos identificados: ${patterns.map(p => p.type.replace(/_/g, ' ')).join(', ')}. `;
    }
    
    // Sort key moments
    keyMoments.sort((a, b) => {
      const getMinutes = (ts: string) => parseInt(ts.replace("'", '').split('"')[0]) || 0;
      return getMinutes(a.timestamp) - getMinutes(b.timestamp);
    });
    
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
      bestPlayer,
      possession: { home: homePossession || 50, away: awayPossession || 50 }
    };
  }, [events, homeTeam, awayTeam]);
}