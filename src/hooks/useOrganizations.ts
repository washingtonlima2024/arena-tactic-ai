import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  owner_id: string | null;
  plan_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  credits_balance: number;
  credits_monthly_quota: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  is_active: boolean;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useOrganizations() {
  const queryClient = useQueryClient();

  const { data: organizations = [], isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: async (): Promise<Organization[]> => {
      try {
        const data = await apiClient.admin.getOrganizations();
        return data || [];
      } catch (error) {
        console.error('[useOrganizations] Error fetching organizations:', error);
        return [];
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async (org: Partial<Organization>) => {
      return await apiClient.admin.createOrganization({
        name: org.name!,
        slug: org.slug!,
        plan_id: org.plan_id || null,
        credits_balance: org.credits_balance || 0,
        owner_id: org.owner_id || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Organization> & { id: string }) => {
      return await apiClient.admin.updateOrganization(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiClient.admin.deleteOrganization(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  return {
    organizations,
    isLoading,
    createOrganization: createMutation.mutateAsync,
    updateOrganization: (id: string, data: Partial<Organization>) => updateMutation.mutateAsync({ id, ...data }),
    deleteOrganization: deleteMutation.mutateAsync,
  };
}
