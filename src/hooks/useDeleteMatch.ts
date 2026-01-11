import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { apiClient, isLocalServerAvailable } from '@/lib/apiClient';
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

export function useDeleteMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (matchId: string) => {
      console.log('[useDeleteMatch] Iniciando deleção completa:', matchId);
      
      // First try local server (handles both DB and storage deletion)
      const serverUp = await isLocalServerAvailable();
      console.log('[useDeleteMatch] Servidor local disponível:', serverUp);
      
      if (serverUp) {
        const result = await apiClient.deleteMatch(matchId) as DeleteResult;
        console.log('[useDeleteMatch] Resultado servidor local:', result);
        return { matchId, result, source: 'local' };
      }
      
      // Fallback to Supabase if local server is not available
      console.log('[useDeleteMatch] Usando Supabase para deleção');
      
      // Delete related records first (order matters for foreign keys)
      const deletions = await Promise.allSettled([
        supabase.from('match_events').delete().eq('match_id', matchId),
        supabase.from('videos').delete().eq('match_id', matchId),
        supabase.from('generated_audio').delete().eq('match_id', matchId),
        supabase.from('thumbnails').delete().eq('match_id', matchId),
        supabase.from('analysis_jobs').delete().eq('match_id', matchId),
        supabase.from('chatbot_conversations').delete().eq('match_id', matchId),
        supabase.from('stream_configurations').delete().eq('match_id', matchId),
      ]);
      
      // Log any errors from related deletions
      deletions.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(`[useDeleteMatch] Deletion ${index} failed:`, result.reason);
        }
      });
      
      // Delete the match itself
      const { error } = await supabase.from('matches').delete().eq('id', matchId);
      if (error) {
        console.error('[useDeleteMatch] Erro ao deletar match:', error);
        throw new Error(error.message);
      }
      
      // Delete storage buckets content (Supabase Storage)
      const buckets = ['match-videos', 'generated-audio', 'thumbnails', 'event-clips'];
      for (const bucket of buckets) {
        try {
          const { data: files } = await supabase.storage.from(bucket).list(matchId);
          if (files && files.length > 0) {
            const filePaths = files.map(f => `${matchId}/${f.name}`);
            await supabase.storage.from(bucket).remove(filePaths);
            console.log(`[useDeleteMatch] Deleted ${files.length} files from ${bucket}`);
          }
        } catch (e) {
          console.warn(`[useDeleteMatch] Error cleaning bucket ${bucket}:`, e);
        }
      }
      
      return { matchId, result: { success: true }, source: 'supabase' };
    },
    onSuccess: ({ matchId, result, source }) => {
      console.log('[useDeleteMatch] Sucesso ao deletar:', matchId, 'via', source);
      
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
