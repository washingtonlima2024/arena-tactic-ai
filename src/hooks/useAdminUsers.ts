import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, isLocalServerAvailable } from '@/lib/apiClient';
import { supabase } from '@/integrations/supabase/client';

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

interface InviteUserData {
  email: string;
  display_name: string;
  role: string;
  organization_id?: string | null;
}

// Fetch users from Supabase directly (fallback when local server unavailable)
async function fetchUsersFromSupabase(): Promise<AdminUser[]> {
  console.log('[useAdminUsers] Fetching users from Supabase...');
  
  // Get profiles with user roles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (profilesError) {
    console.error('[useAdminUsers] Error fetching profiles:', profilesError);
    throw profilesError;
  }

  // Get all user roles
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id, role');
  
  if (rolesError) {
    console.error('[useAdminUsers] Error fetching roles:', rolesError);
    throw rolesError;
  }

  // Create a map of user_id -> role
  const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

  // Combine profiles with roles
  const users: AdminUser[] = (profiles || []).map(profile => ({
    id: profile.id,
    user_id: profile.user_id,
    email: profile.email,
    display_name: profile.display_name,
    phone: profile.phone,
    cpf_cnpj: null, // These fields may not exist in profiles table
    address_cep: null,
    address_street: null,
    address_number: null,
    address_complement: null,
    address_neighborhood: null,
    address_city: null,
    address_state: null,
    credits_balance: profile.credits_balance,
    credits_monthly_quota: profile.credits_monthly_quota,
    organization_id: profile.organization_id,
    role: roleMap.get(profile.user_id) || 'viewer',
    created_at: profile.created_at,
  }));

  console.log(`[useAdminUsers] Fetched ${users.length} users from Supabase`);
  return users;
}

export function useAdminUsers() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<AdminUser[]> => {
      // SEMPRE usar Supabase para dados de usuários
      // Usuários são gerenciados pelo Supabase Auth, não pelo servidor Python
      try {
        return await fetchUsersFromSupabase();
      } catch (error) {
        console.error('[useAdminUsers] Error fetching users from Supabase:', error);
        
        // Fallback para servidor local apenas se Supabase falhar
        try {
          const serverAvailable = await isLocalServerAvailable();
          if (serverAvailable) {
            const data = await apiClient.admin.getUsers();
            return data || [];
          }
        } catch (localError) {
          console.error('[useAdminUsers] Local server fallback also failed:', localError);
        }
        
        return [];
      }
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const serverAvailable = await isLocalServerAvailable();
      
      if (serverAvailable) {
        return await apiClient.admin.updateUserRole(userId, role);
      } else {
        // Update directly in Supabase
        const { error } = await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', userId);
        
        if (error) throw error;
        return { success: true };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: async ({ userId, organizationId }: { userId: string; organizationId: string | null }) => {
      const serverAvailable = await isLocalServerAvailable();
      
      if (serverAvailable) {
        return await apiClient.admin.updateUserOrganization(userId, organizationId);
      } else {
        // Update directly in Supabase
        const { error } = await supabase
          .from('profiles')
          .update({ organization_id: organizationId })
          .eq('user_id', userId);
        
        if (error) throw error;
        return { success: true };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<AdminUser> }) => {
      const serverAvailable = await isLocalServerAvailable();
      
      if (serverAvailable) {
        return await apiClient.admin.updateUserProfile(userId, data);
      } else {
        // Update directly in Supabase - only update fields that exist in profiles table
        const profileData: Record<string, any> = {};
        if (data.display_name !== undefined) profileData.display_name = data.display_name;
        if (data.phone !== undefined) profileData.phone = data.phone;
        if (data.credits_balance !== undefined) profileData.credits_balance = data.credits_balance;
        if (data.credits_monthly_quota !== undefined) profileData.credits_monthly_quota = data.credits_monthly_quota;
        if (data.organization_id !== undefined) profileData.organization_id = data.organization_id;
        
        const { error } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('user_id', userId);
        
        if (error) throw error;
        return { success: true };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data: InviteUserData) => {
      console.log('[useAdminUsers] Inviting user:', data.email);
      
      const { data: result, error } = await supabase.functions.invoke('admin-invite-user', {
        body: data,
      });
      
      if (error) {
        console.error('[useAdminUsers] Error inviting user:', error);
        throw new Error(error.message || 'Erro ao convidar usuário');
      }
      
      if (result?.error) {
        throw new Error(result.error);
      }
      
      return result;
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
    inviteUser: (data: InviteUserData) => inviteUserMutation.mutateAsync(data),
    isInviting: inviteUserMutation.isPending,
  };
}
