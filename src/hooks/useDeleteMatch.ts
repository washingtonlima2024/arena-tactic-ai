import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export function useDeleteMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (matchId: string) => {
      // Delete in order: events, audio, videos, analysis_jobs, thumbnails, chatbot_conversations, then match
      
      // Delete match events
      const { error: eventsError } = await supabase
        .from('match_events')
        .delete()
        .eq('match_id', matchId);
      if (eventsError) throw new Error(`Erro ao deletar eventos: ${eventsError.message}`);

      // Delete generated audio
      const { error: audioError } = await supabase
        .from('generated_audio')
        .delete()
        .eq('match_id', matchId);
      if (audioError) throw new Error(`Erro ao deletar áudios: ${audioError.message}`);

      // Delete videos
      const { error: videosError } = await supabase
        .from('videos')
        .delete()
        .eq('match_id', matchId);
      if (videosError) throw new Error(`Erro ao deletar vídeos: ${videosError.message}`);

      // Delete analysis jobs
      const { error: analysisError } = await supabase
        .from('analysis_jobs')
        .delete()
        .eq('match_id', matchId);
      if (analysisError) throw new Error(`Erro ao deletar análises: ${analysisError.message}`);

      // Delete thumbnails
      const { error: thumbnailsError } = await supabase
        .from('thumbnails')
        .delete()
        .eq('match_id', matchId);
      if (thumbnailsError) throw new Error(`Erro ao deletar thumbnails: ${thumbnailsError.message}`);

      // Delete chatbot conversations
      const { error: chatbotError } = await supabase
        .from('chatbot_conversations')
        .delete()
        .eq('match_id', matchId);
      if (chatbotError) throw new Error(`Erro ao deletar conversas: ${chatbotError.message}`);

      // Finally delete the match
      const { error: matchError } = await supabase
        .from('matches')
        .delete()
        .eq('id', matchId);
      if (matchError) throw new Error(`Erro ao deletar partida: ${matchError.message}`);

      return matchId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast({
        title: 'Partida deletada',
        description: 'A partida e todos os dados relacionados foram removidos.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao deletar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
