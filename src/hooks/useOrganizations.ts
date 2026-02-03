import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, isLocalServerAvailable } from '@/lib/apiClient';
import { supabase } from '@/integrations/supabase/client';

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

// Fetch organizations from Supabase directly
async function fetchOrganizationsFromSupabase(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[useOrganizations] Supabase error:', error);
    throw error;
  }
  
  return (data || []).map(org => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    logo_url: org.logo_url,
    owner_id: org.owner_id,
    plan_id: org.plan_id,
    stripe_customer_id: org.stripe_customer_id,
    stripe_subscription_id: org.stripe_subscription_id,
    credits_balance: org.credits_balance || 0,
    credits_monthly_quota: org.credits_monthly_quota || 0,
    storage_used_bytes: org.storage_used_bytes || 0,
    storage_limit_bytes: org.storage_limit_bytes || 0,
    is_active: org.is_active ?? true,
    trial_ends_at: org.trial_ends_at,
    created_at: org.created_at || '',
    updated_at: org.updated_at || '',
  }));
}

export function useOrganizations() {
  const queryClient = useQueryClient();

  const { data: organizations = [], isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: async (): Promise<Organization[]> => {
      // Primeiro tenta Supabase (fonte primária para dados de organizações)
      try {
        return await fetchOrganizationsFromSupabase();
      } catch (supabaseError) {
        console.error('[useOrganizations] Supabase failed, trying local server:', supabaseError);
        
        // Fallback para servidor local
        try {
          const serverAvailable = await isLocalServerAvailable();
          if (serverAvailable) {
            const data = await apiClient.admin.getOrganizations();
            return data || [];
          }
        } catch (localError) {
          console.error('[useOrganizations] Local server fallback failed:', localError);
        }
        
        return [];
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async (org: Partial<Organization>) => {
      // Tentar Supabase primeiro
      try {
        const { data, error } = await supabase
          .from('organizations')
          .insert({
            name: org.name!,
            slug: org.slug!,
            plan_id: org.plan_id || null,
            credits_balance: org.credits_balance || 0,
            owner_id: org.owner_id || null,
          })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } catch (supabaseError) {
        // Fallback para servidor local
        return await apiClient.admin.createOrganization({
          name: org.name!,
          slug: org.slug!,
          plan_id: org.plan_id || null,
          credits_balance: org.credits_balance || 0,
          owner_id: org.owner_id || null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Organization> & { id: string }) => {
      try {
        const { error } = await supabase
          .from('organizations')
          .update(updates)
          .eq('id', id);
        
        if (error) throw error;
        return { success: true };
      } catch (supabaseError) {
        return await apiClient.admin.updateOrganization(id, updates);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error } = await supabase
          .from('organizations')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        return { success: true };
      } catch (supabaseError) {
        return await apiClient.admin.deleteOrganization(id);
      }
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
