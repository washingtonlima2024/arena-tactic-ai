import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/apiClient';

export interface Match {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  match_date: string | null;
  competition: string | null;
  venue: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  home_team?: { id: string; name: string; short_name: string | null; primary_color: string | null; secondary_color: string | null; logo_url: string | null };
  away_team?: { id: string; name: string; short_name: string | null; primary_color: string | null; secondary_color: string | null; logo_url: string | null };
}

export function useMatches() {
  return useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      return await apiClient.getMatches() as Match[];
    },
  });
}

export function useCreateMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (matchData: {
      home_team_id: string;
      away_team_id: string;
      competition?: string;
      match_date?: string;
      venue?: string;
    }) => {
      const payload = { ...matchData, status: 'analyzing' };
      return await apiClient.createMatch(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar partida',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// useMatchEvents foi movido para useMatchDetails.ts para evitar duplicação
// Use: import { useMatchEvents } from '@/hooks/useMatchDetails';
