import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

interface AdminUser {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  cpf_cnpj: string | null;
  address_cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  credits_balance: number | null;
  credits_monthly_quota: number | null;
  organization_id: string | null;
  role: string;
  created_at: string;
}

export function useAdminUsers() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<AdminUser[]> => {
      try {
        const data = await apiClient.admin.getUsers();
        return data || [];
      } catch (error) {
        console.error('[useAdminUsers] Error fetching users:', error);
        return [];
      }
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return await apiClient.admin.updateUserRole(userId, role);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: async ({ userId, organizationId }: { userId: string; organizationId: string | null }) => {
      return await apiClient.admin.updateUserOrganization(userId, organizationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<AdminUser> }) => {
      return await apiClient.admin.updateUserProfile(userId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  return {
    users,
    isLoading,
    updateUserRole: (userId: string, role: string) => updateRoleMutation.mutateAsync({ userId, role }),
    updateUserOrganization: (userId: string, organizationId: string | null) => 
      updateOrganizationMutation.mutateAsync({ userId, organizationId }),
    updateUserProfile: (userId: string, data: Partial<AdminUser>) =>
      updateProfileMutation.mutateAsync({ userId, data }),
  };
}
