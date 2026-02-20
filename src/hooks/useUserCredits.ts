import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
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

      try {
        const data = await apiClient.get(`/api/users/${user.id}/credits`);
        return {
          balance: data?.credits_balance || 0,
          monthlyQuota: data?.credits_monthly_quota || 0,
        };
      } catch (error) {
        console.error('Erro ao buscar créditos:', error);
        return { balance: 0, monthlyQuota: 0 };
      }
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const consumeCredits = useMutation({
    mutationFn: async (amount: number) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      const currentBalance = credits?.balance || 0;
      
      if (currentBalance < amount) {
        throw new Error('Créditos insuficientes');
      }

      await apiClient.post(`/api/users/${user.id}/credits/consume`, { amount });
      return currentBalance - amount;
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
      await apiClient.post(`/api/users/${user.id}/credits/add`, { amount });
      return (credits?.balance || 0) + amount;
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
