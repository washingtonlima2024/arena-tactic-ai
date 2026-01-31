/**
 * useAuth - Autenticação com Supabase real
 * Sistema de roles: superadmin, org_admin, manager, uploader, viewer
 */
import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'superadmin' | 'org_admin' | 'manager' | 'uploader' | 'viewer' | 'admin' | 'user';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  role: AppRole | null;
  // Hierarquia de permissões
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  isManager: boolean;
  isUploader: boolean;
  isViewer: boolean;
  // Atalhos de permissão
  isAdmin: boolean; // org_admin ou superadmin
  canUpload: boolean; // uploader, manager, org_admin, superadmin
  canManage: boolean; // manager, org_admin, superadmin
  // Permissões granulares
  canImport: boolean; // uploader+ - pode importar jogos e fazer upload
  canEdit: boolean; // manager+ - pode editar partidas e times
  canViewCredits: boolean; // org_admin+ - pode ver saldos de créditos
}

const ROLE_HIERARCHY: Record<AppRole, number> = {
  superadmin: 100,
  org_admin: 80,
  admin: 80, // legacy
  manager: 60,
  uploader: 40,
  viewer: 20,
  user: 20, // legacy
};

function getPermissionsFromRole(role: AppRole | null): Omit<AuthState, 'user' | 'session' | 'isLoading' | 'role'> {
  const roleLevel = role ? ROLE_HIERARCHY[role] || 0 : 0;
  
  return {
    isSuperAdmin: role === 'superadmin',
    isOrgAdmin: roleLevel >= ROLE_HIERARCHY.org_admin,
    isManager: roleLevel >= ROLE_HIERARCHY.manager,
    isUploader: roleLevel >= ROLE_HIERARCHY.uploader,
    isViewer: roleLevel >= ROLE_HIERARCHY.viewer,
    isAdmin: roleLevel >= ROLE_HIERARCHY.org_admin,
    canUpload: roleLevel >= ROLE_HIERARCHY.uploader,
    canManage: roleLevel >= ROLE_HIERARCHY.manager,
    // Permissões granulares
    canImport: roleLevel >= ROLE_HIERARCHY.uploader,
    canEdit: roleLevel >= ROLE_HIERARCHY.manager,
    canViewCredits: roleLevel >= ROLE_HIERARCHY.org_admin,
  };
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    role: null,
    ...getPermissionsFromRole(null),
  });

  const fetchUserRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Erro ao buscar role do usuário:', error);
        return 'viewer' as AppRole;
      }

      return (data?.role as AppRole) || 'viewer';
    } catch (err) {
      console.error('Exceção ao buscar role:', err);
      return 'viewer' as AppRole;
    }
  }, []);

  useEffect(() => {
    // 1. Configurar listener de mudanças de auth PRIMEIRO
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Update session state synchronously
        setAuthState(prev => ({
          ...prev,
          user: session?.user ?? null,
          session: session,
          isLoading: false,
        }));

        // Fetch role asynchronously with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(async () => {
            const role = await fetchUserRole(session.user.id);
            setAuthState(prev => ({
              ...prev,
              role,
              ...getPermissionsFromRole(role),
            }));
          }, 0);
        } else {
          setAuthState(prev => ({
            ...prev,
            role: null,
            ...getPermissionsFromRole(null),
          }));
        }
      }
    );

    // 2. DEPOIS verificar sessão existente
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const role = await fetchUserRole(session.user.id);
        setAuthState({
          user: session.user,
          session: session,
          isLoading: false,
          role,
          ...getPermissionsFromRole(role),
        });
      } else {
        setAuthState({
          user: null,
          session: null,
          isLoading: false,
          role: null,
          ...getPermissionsFromRole(null),
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserRole]);

  const signUp = useCallback(async (
    email: string, 
    password: string, 
    displayName?: string,
    profileData?: {
      phone?: string;
      cpf_cnpj?: string;
      address_cep?: string;
      address_street?: string;
      address_number?: string;
      address_complement?: string;
      address_neighborhood?: string;
      address_city?: string;
      address_state?: string;
    }
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { 
          display_name: displayName || email.split('@')[0],
          ...profileData
        }
      }
    });
    return { data, error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=reset`,
    });
    return { error };
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  }, []);

  return {
    ...authState,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
  };
}
