import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AdminUser {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  organization_id: string | null;
  role: string;
  created_at: string;
}

export function useAdminUsers() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<AdminUser[]> => {
      // Get profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Get user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Combine data
      return (profiles || []).map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.user_id);
        return {
          id: profile.id,
          user_id: profile.user_id,
          email: profile.email,
          display_name: profile.display_name,
          organization_id: profile.organization_id,
          role: userRole?.role || 'user',
          created_at: profile.created_at,
        };
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      // Update or insert user role
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('user_roles')
          .update({ role: role as 'admin' | 'user' })
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: role as 'admin' | 'user' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: async ({ userId, organizationId }: { userId: string; organizationId: string | null }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ organization_id: organizationId })
        .eq('user_id', userId);

      if (error) throw error;
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
  };
}
