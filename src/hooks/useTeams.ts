import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { apiClient } from '@/lib/apiClient';
import { getApiMode } from '@/lib/apiMode';

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
      const mode = getApiMode();
      
      if (mode === 'local') {
        try {
          return await apiClient.getTeams() as Team[];
        } catch (error) {
          console.warn('Local API failed, falling back to Supabase:', error);
        }
      }
      
      const { data, error } = await supabase.from('teams').select('*');
      if (error) throw error;
      return data as Team[];
    },
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (team: TeamInsert) => {
      const mode = getApiMode();
      
      if (mode === 'local') {
        try {
          return await apiClient.createTeam(team);
        } catch (error) {
          console.warn('Local API failed, falling back to Supabase:', error);
        }
      }
      
      const { data, error } = await supabase.from('teams').insert(team).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...team }: TeamUpdate & { id: string }) => {
      const mode = getApiMode();
      
      if (mode === 'local') {
        try {
          return await apiClient.updateTeam(id, team);
        } catch (error) {
          console.warn('Local API failed, falling back to Supabase:', error);
        }
      }
      
      const { data, error } = await supabase.from('teams').update(team).eq('id', id).select().single();
      if (error) throw error;
      return data;
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
      const mode = getApiMode();
      
      if (mode === 'local') {
        try {
          await apiClient.deleteTeam(id);
          return;
        } catch (error) {
          console.warn('Local API failed, falling back to Supabase:', error);
        }
      }
      
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}
