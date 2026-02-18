import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { autoFetchTeamLogo } from '@/lib/autoTeamLogo';
import { apiClient } from '@/lib/apiClient';

interface TeamInfo {
  id: string;
  name: string;
  logo_url: string | null;
}

// Module-level Set to avoid duplicate fetches across hook instances in the same session
const fetchedTeamIds = new Set<string>();

/**
 * Auto-fetches missing logos for teams in background.
 * Uses a session-level Set to prevent duplicate searches.
 */
export function useAutoTeamLogos(teams: (TeamInfo | null | undefined)[]) {
  const queryClient = useQueryClient();
  const isFetching = useRef(false);

  useEffect(() => {
    const teamsWithoutLogo = teams.filter(
      (t): t is TeamInfo => !!t && !t.logo_url && !!t.name && !fetchedTeamIds.has(t.id)
    );

    if (teamsWithoutLogo.length === 0 || isFetching.current) return;

    isFetching.current = true;

    Promise.all(
      teamsWithoutLogo.map(async (team) => {
        fetchedTeamIds.add(team.id); // Mark immediately to prevent parallel duplicates
        try {
          console.log(`[AutoLogo] Buscando logo para "${team.name}"...`);
          const result = await autoFetchTeamLogo(team.name);
          if (result) {
            await apiClient.updateTeam(team.id, { logo_url: result.logoUrl });
            console.log(`[AutoLogo] ✅ Logo atualizada para "${team.name}"`);
          }
        } catch (err) {
          console.warn(`[AutoLogo] Falha ao buscar logo para ${team.name}:`, err);
        }
      })
    ).then(() => {
      // Invalidate queries to reflect changes
      queryClient.invalidateQueries({ queryKey: ['match-details'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['completed-matches'] });
      isFetching.current = false;
    });
  }, [teams.map(t => t?.id).join(',')]);
}
