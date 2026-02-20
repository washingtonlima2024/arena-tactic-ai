import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/apiClient';

interface DeleteResult {
  success: boolean;
  deleted?: {
    events: number;
    videos: number;
    audio: number;
    thumbnails: number;
    analysis_jobs: number;
    conversations: number;
    stream_configs: number;
    storage_deleted: boolean;
  };
  message?: string;
}

export function useDeleteMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (matchId: string) => {
      console.log('[useDeleteMatch] Iniciando deleção completa:', matchId);

      try {
        const result = await apiClient.deleteMatch(matchId) as DeleteResult;
        console.log('[useDeleteMatch] Resultado servidor local:', result);
        return { matchId, result };
      } catch (err) {
        console.error('[useDeleteMatch] Erro ao deletar:', err);
        throw new Error('Servidor local indisponível. Verifique se o servidor Python está em execução.');
      }
    },
    onSuccess: ({ matchId, result }) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['match-events', matchId] });
      queryClient.invalidateQueries({ queryKey: ['videos', matchId] });

      toast({
        title: 'Partida deletada',
        description: result.message || 'A partida e todos os dados relacionados foram removidos.',
      });
    },
    onError: (error: Error) => {
      console.error('[useDeleteMatch] Erro:', error);
      toast({
        title: 'Erro ao deletar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
