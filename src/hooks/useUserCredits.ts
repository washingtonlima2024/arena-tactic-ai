import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface UserCredits {
  balance: number;
  monthlyQuota: number;
}

export function useUserCredits() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: credits, isLoading } = useQuery({
    queryKey: ['user-credits', user?.id],
    queryFn: async (): Promise<UserCredits> => {
      if (!user?.id) {
        return { balance: 0, monthlyQuota: 0 };
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('credits_balance, credits_monthly_quota')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Erro ao buscar créditos:', error);
        return { balance: 0, monthlyQuota: 0 };
      }

      return {
        balance: data?.credits_balance || 0,
        monthlyQuota: data?.credits_monthly_quota || 0,
      };
    },
    enabled: !!user?.id,
    staleTime: 30000, // Cache por 30 segundos
  });

  const consumeCredits = useMutation({
    mutationFn: async (amount: number) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const currentBalance = credits?.balance || 0;
      
      if (currentBalance < amount) {
        throw new Error('Créditos insuficientes');
      }

      const newBalance = currentBalance - amount;

      const { error } = await supabase
        .from('profiles')
        .update({ credits_balance: newBalance })
        .eq('user_id', user.id);

      if (error) throw error;

      return newBalance;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-credits', user?.id] });
    },
    onError: (error: Error) => {
      if (error.message === 'Créditos insuficientes') {
        toast.error('Créditos insuficientes', {
          description: 'Você não tem créditos suficientes para esta operação.',
          action: {
            label: 'Comprar créditos',
            onClick: () => navigate('/payment'),
          },
        });
      }
    },
  });

  const addCredits = useMutation({
    mutationFn: async (amount: number) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const currentBalance = credits?.balance || 0;
      const newBalance = currentBalance + amount;

      const { error } = await supabase
        .from('profiles')
        .update({ credits_balance: newBalance })
        .eq('user_id', user.id);

      if (error) throw error;

      return newBalance;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-credits', user?.id] });
    },
  });

  const checkCredits = (requiredAmount: number): boolean => {
    const balance = credits?.balance || 0;
    
    if (balance < requiredAmount) {
      toast.error('Créditos insuficientes', {
        description: `Você precisa de ${requiredAmount} crédito(s) mas tem apenas ${balance}.`,
        action: {
          label: 'Comprar créditos',
          onClick: () => navigate('/payment'),
        },
      });
      return false;
    }
    
    return true;
  };

  const requireCredits = (requiredAmount: number): boolean => {
    const balance = credits?.balance || 0;
    
    if (balance < requiredAmount) {
      navigate('/payment', { 
        state: { 
          requiredCredits: requiredAmount,
          returnTo: window.location.pathname 
        } 
      });
      return false;
    }
    
    return true;
  };

  return {
    balance: credits?.balance || 0,
    monthlyQuota: credits?.monthlyQuota || 0,
    isLoading,
    hasCredits: (credits?.balance || 0) > 0,
    consumeCredits: consumeCredits.mutateAsync,
    addCredits: addCredits.mutateAsync,
    checkCredits,
    requireCredits,
  };
}
