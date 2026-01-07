import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export interface ApiSetting {
  id: string;
  setting_key: string;
  setting_value: string | null;
  is_encrypted: boolean | null;
  created_at: string;
  updated_at: string;
}

export function useApiSettings() {
  return useQuery({
    queryKey: ['api_settings'],
    queryFn: async () => {
      const data = await apiClient.getSettings();
      return data as ApiSetting[];
    },
  });
}

export function useUpsertApiSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const data = await apiClient.upsertSetting({ 
        setting_key: key, 
        setting_value: value 
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api_settings'] });
    },
  });
}
