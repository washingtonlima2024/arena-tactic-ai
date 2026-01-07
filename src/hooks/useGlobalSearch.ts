import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

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
      const data = await apiClient.getMatches();
      return data || [];
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['search-teams'],
    queryFn: async () => {
      const data = await apiClient.getTeams();
      return data || [];
    },
  });

  const { data: players = [] } = useQuery({
    queryKey: ['search-players'],
    queryFn: async () => {
      const data = await apiClient.getPlayers();
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

    return results.slice(0, 10);
  }, [query, matches, teams, players]);

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
