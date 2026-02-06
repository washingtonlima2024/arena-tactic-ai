import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AiPrompt {
  id: string;
  prompt_key: string;
  prompt_name: string;
  prompt_value: string;
  description: string | null;
  category: string;
  ai_model: string;
  is_default: boolean;
  default_value: string;
  default_model: string;
  updated_at: string;
  updated_by: string | null;
  parent_prompt_id: string | null;
  event_type_filter: string | null;
}

export function useAiPrompts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['ai-prompts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;
      return data as AiPrompt[];
    },
  });

  const updatePrompt = useMutation({
    mutationFn: async ({ id, prompt_value, ai_model }: { id: string; prompt_value: string; ai_model: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('ai_prompts')
        .update({
          prompt_value,
          ai_model,
          is_default: false,
          updated_by: user?.id || null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompts'] });
      toast({ title: 'Prompt atualizado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar prompt', description: error.message, variant: 'destructive' });
    },
  });

  const restoreDefault = useMutation({
    mutationFn: async (id: string) => {
      const prompt = prompts?.find(p => p.id === id);
      if (!prompt) throw new Error('Prompt não encontrado');

      const { error } = await supabase
        .from('ai_prompts')
        .update({
          prompt_value: prompt.default_value,
          ai_model: prompt.default_model,
          is_default: true,
          updated_by: null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompts'] });
      toast({ title: 'Prompt restaurado ao padrão' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao restaurar prompt', description: error.message, variant: 'destructive' });
    },
  });

  const createSubPrompt = useMutation({
    mutationFn: async (params: {
      parent_prompt_id: string;
      prompt_key: string;
      prompt_name: string;
      prompt_value: string;
      event_type_filter: string;
      description: string;
      category: string;
      ai_model: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('ai_prompts')
        .insert({
          prompt_key: params.prompt_key,
          prompt_name: params.prompt_name,
          prompt_value: params.prompt_value,
          default_value: params.prompt_value,
          description: params.description,
          category: params.category,
          ai_model: params.ai_model,
          default_model: params.ai_model,
          is_default: true,
          parent_prompt_id: params.parent_prompt_id,
          event_type_filter: params.event_type_filter,
          updated_by: user?.id || null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompts'] });
      toast({ title: 'Sub-prompt criado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar sub-prompt', description: error.message, variant: 'destructive' });
    },
  });

  const deletePrompt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_prompts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompts'] });
      toast({ title: 'Sub-prompt removido' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao remover sub-prompt', description: error.message, variant: 'destructive' });
    },
  });

  return {
    prompts: prompts || [],
    isLoading,
    updatePrompt,
    restoreDefault,
    createSubPrompt,
    deletePrompt,
  };
}
