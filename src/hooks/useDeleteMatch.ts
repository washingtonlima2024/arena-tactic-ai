import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { apiClient, isLocalServerAvailable } from '@/lib/apiClient';

export function useDeleteMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (matchId: string) => {
      console.log('[useDeleteMatch] Iniciando deleção:', matchId);
      
      // Verificar se servidor local está disponível
      const serverUp = await isLocalServerAvailable();
      console.log('[useDeleteMatch] Servidor local disponível:', serverUp);
      
      if (!serverUp) {
        throw new Error('Servidor local não está disponível. Inicie o servidor Python.');
      }
      
      const result = await apiClient.deleteMatch(matchId);
      console.log('[useDeleteMatch] Resultado:', result);
      return matchId;
    },
    onSuccess: (matchId) => {
      console.log('[useDeleteMatch] Sucesso ao deletar:', matchId);
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast({
        title: 'Partida deletada',
        description: 'A partida e todos os dados relacionados foram removidos.',
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
