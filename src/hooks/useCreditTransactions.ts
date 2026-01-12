import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

interface CreditTransaction {
  id: string;
  organization_id: string;
  amount: number;
  balance_after: number;
  transaction_type: string;
  description: string | null;
  match_id: string | null;
  stripe_payment_id: string | null;
  created_by: string | null;
  created_at: string;
}

export function useCreditTransactions() {
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['credit-transactions'],
    queryFn: async (): Promise<CreditTransaction[]> => {
      try {
        const data = await apiClient.admin.getCreditTransactions(100);
        return data || [];
      } catch (error) {
        console.error('[useCreditTransactions] Error fetching transactions:', error);
        return [];
      }
    },
  });

  const addCreditsMutation = useMutation({
    mutationFn: async (tx: {
      organization_id: string;
      amount: number;
      transaction_type: string;
      description?: string;
    }) => {
      return await apiClient.admin.addCredits({
        organization_id: tx.organization_id,
        amount: tx.amount,
        transaction_type: tx.transaction_type,
        description: tx.description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  return {
    transactions,
    isLoading,
    addCredits: addCreditsMutation.mutateAsync,
  };
}
