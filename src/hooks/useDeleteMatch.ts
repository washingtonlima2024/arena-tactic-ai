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
      
      // Local server only - no Cloud fallback
      const result = await apiClient.deleteMatch(matchId) as DeleteResult;
      console.log('[useDeleteMatch] Resultado servidor local:', result);
      return { matchId, result };
    },
    onSuccess: ({ matchId, result }) => {
      console.log('[useDeleteMatch] Sucesso ao deletar:', matchId);
      
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['match-events', matchId] });
      queryClient.invalidateQueries({ queryKey: ['videos', matchId] });
      
      const deletedInfo = result.deleted 
        ? `(${result.deleted.events} eventos, ${result.deleted.videos} vídeos, storage: ${result.deleted.storage_deleted ? '✓' : '✗'})`
        : '';
      
      toast({
        title: 'Partida deletada',
        description: `A partida e todos os dados relacionados foram removidos. ${deletedInfo}`,
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
