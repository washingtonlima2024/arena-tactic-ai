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
    onMutate: async ({ key, value }) => {
      // Cancel outgoing refetches to prevent race condition
      await queryClient.cancelQueries({ queryKey: ['api_settings'] });
      
      // Snapshot previous value
      const previousSettings = queryClient.getQueryData<ApiSetting[]>(['api_settings']);
      
      // Optimistically update the cache
      if (previousSettings) {
        const existingIndex = previousSettings.findIndex(s => s.setting_key === key);
        const newSettings = [...previousSettings];
        
        if (existingIndex >= 0) {
          newSettings[existingIndex] = {
            ...newSettings[existingIndex],
            setting_value: value,
            updated_at: new Date().toISOString(),
          };
        } else {
          // Add new setting
          newSettings.push({
            id: crypto.randomUUID(),
            setting_key: key,
            setting_value: value,
            is_encrypted: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        
        queryClient.setQueryData(['api_settings'], newSettings);
      }
      
      return { previousSettings };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousSettings) {
        queryClient.setQueryData(['api_settings'], context.previousSettings);
      }
    },
    onSettled: () => {
      // Always refetch after mutation settles (with delay to avoid race)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['api_settings'] });
      }, 1000);
    },
  });
}
