import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/apiClient';
import { supabase } from '@/integrations/supabase/client';

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

async function deleteMatchViaSupabase(matchId: string) {
  console.log('[useDeleteMatch] Fallback Supabase para:', matchId);

  // Delete related data in order (no FK cascades)
  const tables = [
    { name: 'match_events', col: 'match_id' },
    { name: 'videos', col: 'match_id' },
    { name: 'generated_audio', col: 'match_id' },
    { name: 'thumbnails', col: 'match_id' },
    { name: 'analysis_jobs', col: 'match_id' },
    { name: 'chatbot_conversations', col: 'match_id' },
    { name: 'stream_configurations', col: 'match_id' },
  ] as const;

  for (const t of tables) {
    const { error } = await supabase.from(t.name).delete().eq(t.col, matchId);
    if (error) console.warn(`[useDeleteMatch] Erro ao deletar ${t.name}:`, error.message);
  }

  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  if (error) throw new Error(`Erro ao deletar partida: ${error.message}`);

  return { success: true, message: 'Deletado via Cloud' } as DeleteResult;
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
        console.warn('[useDeleteMatch] Servidor local indisponível, usando Cloud:', err);
        const result = await deleteMatchViaSupabase(matchId);
        return { matchId, result };
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
