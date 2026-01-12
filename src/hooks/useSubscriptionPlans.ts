import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly: number | null;
  credits_per_month: number;
  max_users: number;
  max_matches_per_month: number | null;
  storage_limit_bytes: number;
  features: any;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export function useSubscriptionPlans() {
  const queryClient = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (plan: Partial<SubscriptionPlan>) => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .insert({
          name: plan.name!,
          slug: plan.slug!,
          price_monthly: plan.price_monthly || 0,
          price_yearly: plan.price_yearly || null,
          credits_per_month: plan.credits_per_month || 50,
          max_users: plan.max_users || 1,
          max_matches_per_month: plan.max_matches_per_month || null,
          storage_limit_bytes: plan.storage_limit_bytes || 5368709120,
          features: plan.features || '[]',
          is_active: plan.is_active !== false,
          sort_order: plans.length + 1,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SubscriptionPlan> & { id: string }) => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
    },
  });

  return {
    plans,
    isLoading,
    createPlan: createMutation.mutateAsync,
    updatePlan: (id: string, data: Partial<SubscriptionPlan>) => updateMutation.mutateAsync({ id, ...data }),
  };
}
