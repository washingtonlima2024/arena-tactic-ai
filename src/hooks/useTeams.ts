import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { autoFetchTeamLogo } from '@/lib/autoTeamLogo';

export interface Team {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamInsert {
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

export interface TeamUpdate {
  id?: string;
  name?: string;
  short_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      return await apiClient.getTeams() as Team[];
    },
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (team: TeamInsert) => {
      return await apiClient.createTeam(team);
    },
    onSuccess: (newTeam: any) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      
      // Auto-buscar logo em background se o time não tem logo
      if (newTeam?.name && !newTeam?.logo_url) {
        autoFetchTeamLogo(newTeam.name).then(async (result) => {
          if (result && newTeam.id) {
            try {
              await apiClient.updateTeam(newTeam.id, {
                logo_url: result.logoUrl,
                ...(result.shortName && !newTeam.short_name ? { short_name: result.shortName } : {}),
              });
              queryClient.invalidateQueries({ queryKey: ['teams'] });
              console.log(`[useCreateTeam] Logo auto-atribuída para "${newTeam.name}"`);
            } catch (err) {
              console.warn(`[useCreateTeam] Falha ao atualizar logo:`, err);
            }
          }
        }).catch((err) => {
          console.warn(`[useCreateTeam] Auto-fetch logo falhou para "${newTeam.name}":`, err);
        });
      }
    },
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...team }: TeamUpdate & { id: string }) => {
      return await apiClient.updateTeam(id, team);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.deleteTeam(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}
