import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { apiClient, isLocalServerAvailable } from '@/lib/apiClient';
import { supabase } from '@/integrations/supabase/client';

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
      // Try local server first, fallback to Supabase
      const serverAvailable = await isLocalServerAvailable();
      
      if (serverAvailable) {
        try {
          return await apiClient.getMatches() as Match[];
        } catch (error) {
          console.warn('[useMatches] Servidor local falhou, usando Supabase:', error);
        }
      }
      
      // Fallback to Supabase
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(id, name, short_name, primary_color, secondary_color, logo_url),
          away_team:teams!matches_away_team_id_fkey(id, name, short_name, primary_color, secondary_color, logo_url)
        `)
        .order('created_at', { ascending: false });
      
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
      const payload = { ...matchData, status: 'analyzing' };
      
      // Try local server first
      const serverAvailable = await isLocalServerAvailable();
      
      if (serverAvailable) {
        try {
          const result = await apiClient.createMatch(payload);
          return result;
        } catch (error) {
          console.warn('[useCreateMatch] Servidor local falhou, usando Supabase:', error);
        }
      }
      
      // Fallback to Supabase
      console.log('[useCreateMatch] Criando partida diretamente no Supabase');
      const { data, error } = await supabase
        .from('matches')
        .insert(payload)
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(id, name, short_name, primary_color, secondary_color, logo_url),
          away_team:teams!matches_away_team_id_fkey(id, name, short_name, primary_color, secondary_color, logo_url)
        `)
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast({
        title: 'Partida criada',
        description: 'A partida foi criada com sucesso.',
      });
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
