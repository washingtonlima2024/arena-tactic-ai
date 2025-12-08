import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SearchResult {
  id: string;
  type: 'match' | 'team' | 'event' | 'player';
  title: string;
  subtitle?: string;
  path: string;
}

export function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Fetch all searchable data
  const { data: matches = [] } = useQuery({
    queryKey: ['search-matches'],
    queryFn: async () => {
      const { data } = await supabase
        .from('matches')
        .select(`
          id,
          match_date,
          competition,
          venue,
          home_team:teams!matches_home_team_id_fkey(id, name, short_name),
          away_team:teams!matches_away_team_id_fkey(id, name, short_name)
        `)
        .order('match_date', { ascending: false });
      return data || [];
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['search-teams'],
    queryFn: async () => {
      const { data } = await supabase
        .from('teams')
        .select('id, name, short_name')
        .order('name');
      return data || [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ['search-events'],
    queryFn: async () => {
      const { data } = await supabase
        .from('match_events')
        .select(`
          id,
          event_type,
          description,
          minute,
          match_id
        `)
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const { data: players = [] } = useQuery({
    queryKey: ['search-players'],
    queryFn: async () => {
      const { data } = await supabase
        .from('players')
        .select('id, name, number, position, team_id')
        .order('name');
      return data || [];
    },
  });

  // Filter results based on query
  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim() || query.length < 2) return [];

    const searchTerm = query.toLowerCase();
    const results: SearchResult[] = [];

    // Search matches
    matches.forEach((match: any) => {
      const homeTeam = match.home_team?.name || '';
      const awayTeam = match.away_team?.name || '';
      const matchText = `${homeTeam} ${awayTeam} ${match.competition || ''} ${match.venue || ''}`.toLowerCase();
      
      if (matchText.includes(searchTerm)) {
        results.push({
          id: match.id,
          type: 'match',
          title: `${homeTeam} vs ${awayTeam}`,
          subtitle: match.competition || match.venue,
          path: `/matches`,
        });
      }
    });

    // Search teams
    teams.forEach((team: any) => {
      const teamText = `${team.name} ${team.short_name || ''}`.toLowerCase();
      
      if (teamText.includes(searchTerm)) {
        results.push({
          id: team.id,
          type: 'team',
          title: team.name,
          subtitle: team.short_name,
          path: `/settings`,
        });
      }
    });

    // Search events
    events.forEach((event: any) => {
      const eventText = `${event.event_type} ${event.description || ''}`.toLowerCase();
      
      if (eventText.includes(searchTerm)) {
        results.push({
          id: event.id,
          type: 'event',
          title: event.event_type.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          subtitle: event.description || `Minuto ${event.minute}'`,
          path: `/events`,
        });
      }
    });

    // Search players
    players.forEach((player: any) => {
      const playerText = `${player.name} ${player.position || ''} ${player.number || ''}`.toLowerCase();
      
      if (playerText.includes(searchTerm)) {
        results.push({
          id: player.id,
          type: 'player',
          title: player.name,
          subtitle: `#${player.number} - ${player.position || 'Jogador'}`,
          path: `/settings`,
        });
      }
    });

    return results.slice(0, 10); // Limit to 10 results
  }, [query, matches, teams, events, players]);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setIsOpen(value.length >= 2);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setIsOpen(false);
  }, []);

  return {
    query,
    results,
    isOpen,
    setIsOpen,
    handleSearch,
    clearSearch,
  };
}
