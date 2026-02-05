/**
 * useAdminUsers - Gerenciamento de usuários 100% local
 * Sem dependência do Supabase - usa apenas API Python local
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export interface AdminUser {
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
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
}

interface InviteUserData {
  email: string;
  display_name: string;
  role: string;
  organization_id?: string | null;
}

export function useAdminUsers() {
  const queryClient = useQueryClient();

  // Buscar todos os usuários
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

  // Buscar usuários pendentes de aprovação
  const { data: pendingUsers = [], isLoading: isPendingLoading } = useQuery({
    queryKey: ['admin-users-pending'],
    queryFn: async (): Promise<AdminUser[]> => {
      try {
        const response = await apiClient.get<AdminUser[]>('/api/admin/users/pending');
        return response || [];
      } catch (error) {
        console.error('[useAdminUsers] Error fetching pending users:', error);
        return [];
      }
    },
  });

  // Atualizar role do usuário
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return await apiClient.admin.updateUserRole(userId, role);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-pending'] });
    },
  });

  // Atualizar organização do usuário
  const updateOrganizationMutation = useMutation({
    mutationFn: async ({ userId, organizationId }: { userId: string; organizationId: string | null }) => {
      return await apiClient.admin.updateUserOrganization(userId, organizationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  // Atualizar perfil do usuário
  const updateProfileMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<AdminUser> }) => {
      return await apiClient.admin.updateUserProfile(userId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  // Aprovar usuário
  const approveMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiClient.post(`/api/admin/users/${userId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-pending'] });
    },
  });

  // Rejeitar usuário
  const rejectMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiClient.post(`/api/admin/users/${userId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-pending'] });
    },
  });

  // Convidar usuário (criar via admin - para compatibilidade futura)
  const inviteUserMutation = useMutation({
    mutationFn: async (data: InviteUserData) => {
      // Por enquanto, redirecionar para o fluxo de cadastro normal
      // Em uma versão futura, pode enviar email de convite
      console.log('[useAdminUsers] Invite user:', data);
      throw new Error('Convite por email não disponível. Peça ao usuário para se cadastrar diretamente.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  // Separar usuários aprovados dos pendentes
  const approvedUsers = users.filter(u => u.is_approved !== false);

  return {
    users: approvedUsers,
    pendingUsers,
    allUsers: users,
    isLoading,
    isPendingLoading,
    
    // Funções de gerenciamento
    updateUserRole: (userId: string, role: string) => 
      updateRoleMutation.mutateAsync({ userId, role }),
    updateUserOrganization: (userId: string, organizationId: string | null) => 
      updateOrganizationMutation.mutateAsync({ userId, organizationId }),
    updateUserProfile: (userId: string, data: Partial<AdminUser>) =>
      updateProfileMutation.mutateAsync({ userId, data }),
    
    // Funções de aprovação
    approveUser: (userId: string) => approveMutation.mutateAsync(userId),
    rejectUser: (userId: string) => rejectMutation.mutateAsync(userId),
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
    
    // Legacy - convite não disponível no modo local
    inviteUser: (data: InviteUserData) => inviteUserMutation.mutateAsync(data),
    isInviting: inviteUserMutation.isPending,
  };
}
