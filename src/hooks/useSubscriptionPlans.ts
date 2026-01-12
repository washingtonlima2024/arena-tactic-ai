import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

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
      try {
        const data = await apiClient.admin.getSubscriptionPlans();
        return data || [];
      } catch (error) {
        console.error('[useSubscriptionPlans] Error fetching plans:', error);
        return [];
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async (plan: Partial<SubscriptionPlan>) => {
      return await apiClient.admin.createSubscriptionPlan({
        name: plan.name!,
        slug: plan.slug!,
        price_monthly: plan.price_monthly || 0,
        price_yearly: plan.price_yearly || null,
        credits_per_month: plan.credits_per_month || 50,
        max_users: plan.max_users || 1,
        max_matches_per_month: plan.max_matches_per_month || null,
        storage_limit_bytes: plan.storage_limit_bytes || 5368709120,
        features: plan.features || [],
        is_active: plan.is_active !== false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SubscriptionPlan> & { id: string }) => {
      return await apiClient.admin.updateSubscriptionPlan(id, updates);
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
