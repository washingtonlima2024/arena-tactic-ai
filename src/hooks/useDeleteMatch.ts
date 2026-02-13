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

const STORAGE_BUCKETS = ['match-videos', 'generated-audio', 'thumbnails', 'event-clips'];

async function cleanupSupabaseStorage(matchId: string) {
  console.log('[useDeleteMatch] Limpando buckets Supabase Storage para:', matchId);

  for (const bucket of STORAGE_BUCKETS) {
    try {
      const { data: files, error: listError } = await supabase.storage
        .from(bucket)
        .list(matchId);

      if (listError) {
        console.warn(`[useDeleteMatch] Erro ao listar ${bucket}/${matchId}:`, listError.message);
        continue;
      }

      if (files && files.length > 0) {
        const paths = files.map(f => `${matchId}/${f.name}`);
        const { error: removeError } = await supabase.storage
          .from(bucket)
          .remove(paths);

        if (removeError) {
          console.warn(`[useDeleteMatch] Erro ao remover ${bucket}:`, removeError.message);
        } else {
          console.log(`[useDeleteMatch] ✅ ${bucket}: ${paths.length} arquivos removidos`);
        }
      }
    } catch (err) {
      console.warn(`[useDeleteMatch] Erro no bucket ${bucket}:`, err);
    }
  }
}

async function tryDeleteLocalStorage(matchId: string) {
  try {
    await apiClient.deleteMatchStorage(matchId);
    console.log('[useDeleteMatch] ✅ Storage local deletado');
  } catch (err) {
    console.warn('[useDeleteMatch] Storage local indisponível (ignorado):', err);
  }
}

async function deleteMatchViaSupabase(matchId: string) {
  console.log('[useDeleteMatch] Fallback Supabase para:', matchId);

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

      let result: DeleteResult;
      let usedLocal = false;

      try {
        result = await apiClient.deleteMatch(matchId) as DeleteResult;
        usedLocal = true;
        console.log('[useDeleteMatch] Resultado servidor local:', result);
      } catch (err) {
        console.warn('[useDeleteMatch] Servidor local indisponível, usando Cloud:', err);
        result = await deleteMatchViaSupabase(matchId);
      }

      // Always cleanup both storages
      await cleanupSupabaseStorage(matchId);
      if (!usedLocal) {
        await tryDeleteLocalStorage(matchId);
      }

      return { matchId, result };
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
