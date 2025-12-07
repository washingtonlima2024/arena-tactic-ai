import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

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
  home_team?: { id: string; name: string; short_name: string | null; primary_color: string | null; secondary_color: string | null };
  away_team?: { id: string; name: string; short_name: string | null; primary_color: string | null; secondary_color: string | null };
}

export function useMatches() {
  return useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(id, name, short_name, primary_color, secondary_color),
          away_team:teams!matches_away_team_id_fkey(id, name, short_name, primary_color, secondary_color)
        `)
        .order('match_date', { ascending: false });

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
      const { data, error } = await supabase
        .from('matches')
        .insert({
          ...matchData,
          status: 'analyzing',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar partida',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useMatchEvents(matchId: string) {
  return useQuery({
    queryKey: ['match-events', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .order('minute', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
  });
}
