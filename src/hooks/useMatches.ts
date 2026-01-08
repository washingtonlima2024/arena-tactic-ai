import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { apiClient } from '@/lib/apiClient';
import { getApiMode } from '@/lib/apiMode';

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
      const mode = getApiMode();
      
      if (mode === 'local') {
        try {
          return await apiClient.getMatches() as Match[];
        } catch (error) {
          console.warn('Local API failed, falling back to Supabase:', error);
        }
      }
      
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*)
        `);
      if (error) throw error;
      return data as Match[];
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
      const mode = getApiMode();
      const payload = { ...matchData, status: 'analyzing' };
      
      if (mode === 'local') {
        try {
          return await apiClient.createMatch(payload);
        } catch (error) {
          console.warn('Local API failed, falling back to Supabase:', error);
        }
      }
      
      const { data, error } = await supabase.from('matches').insert(payload).select().single();
      if (error) throw error;
      return data;
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
