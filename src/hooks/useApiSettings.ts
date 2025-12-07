import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type ApiSetting = Tables<'api_settings'>;

export function useApiSettings() {
  return useQuery({
    queryKey: ['api_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_settings')
        .select('*');
      
      if (error) throw error;
      return data as ApiSetting[];
    },
  });
}

export function useUpsertApiSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data, error } = await supabase
        .from('api_settings')
        .upsert({ 
          setting_key: key, 
          setting_value: value,
          is_encrypted: false
        }, { 
          onConflict: 'setting_key' 
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api_settings'] });
    },
  });
}
