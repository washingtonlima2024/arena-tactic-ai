import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
  });

  const addCreditsMutation = useMutation({
    mutationFn: async (tx: {
      organization_id: string;
      amount: number;
      transaction_type: string;
      description?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get current balance
      const { data: org } = await supabase
        .from('organizations')
        .select('credits_balance')
        .eq('id', tx.organization_id)
        .single();

      const currentBalance = org?.credits_balance || 0;
      const newBalance = currentBalance + tx.amount;

      // Insert transaction
      const { error: txError } = await supabase
        .from('credit_transactions')
        .insert({
          organization_id: tx.organization_id,
          amount: tx.amount,
          balance_after: newBalance,
          transaction_type: tx.transaction_type,
          description: tx.description || null,
          created_by: user?.id || null,
        });

      if (txError) throw txError;

      // Update organization balance
      const { error: orgError } = await supabase
        .from('organizations')
        .update({ credits_balance: newBalance })
        .eq('id', tx.organization_id);

      if (orgError) throw orgError;
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
