/**
 * useAuth - Autenticação 100% Local (JWT + SQLite)
 * Sistema de roles: superadmin, org_admin, manager, uploader, viewer
 * Sem dependência do Supabase para autenticação
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

export type AppRole = 'superadmin' | 'org_admin' | 'manager' | 'uploader' | 'viewer' | 'admin' | 'user';

interface LocalUser {
  id: string;
  email: string;
  display_name?: string;
  is_active: boolean;
  is_approved: boolean;
  role: AppRole;
  profile?: {
    phone?: string;
    cpf_cnpj?: string;
    address_cep?: string;
    address_street?: string;
    address_number?: string;
    address_complement?: string;
    address_neighborhood?: string;
    address_city?: string;
    address_state?: string;
    credits_balance?: number;
    organization_id?: string;
  };
}

interface AuthState {
  user: LocalUser | null;
  token: string | null;
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

const TOKEN_KEY = 'arena_auth_token';
const USER_KEY = 'arena_auth_user';

function getPermissionsFromRole(role: AppRole | null): Omit<AuthState, 'user' | 'token' | 'isLoading' | 'role'> {
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
  const [authState, setAuthState] = useState<AuthState>(() => {
    // Inicializar do localStorage se disponível
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    
    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser) as LocalUser;
        return {
          user,
          token: storedToken,
          isLoading: true, // Will verify token
          role: user.role,
          ...getPermissionsFromRole(user.role),
        };
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    
    return {
      user: null,
      token: null,
      isLoading: true,
      role: null,
      ...getPermissionsFromRole(null),
    };
  });

  // Verificar token ao inicializar
  useEffect(() => {
    const verifyAuth = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      
      if (!token) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return;
      }
      
      try {
        // Verificar se o token ainda é válido chamando /api/auth/me
        const response = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          const user = data.user as LocalUser;
          
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          
          setAuthState({
            user,
            token,
            isLoading: false,
            role: user.role,
            ...getPermissionsFromRole(user.role),
          });
        } else {
          // Token inválido, limpar storage
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          
          setAuthState({
            user: null,
            token: null,
            isLoading: false,
            role: null,
            ...getPermissionsFromRole(null),
          });
        }
      } catch (error) {
        console.error('[Auth] Error verifying token:', error);
        // Manter usuário do localStorage se offline, mas marcar como loading false
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    };
    
    verifyAuth();
  }, []);

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
  ): Promise<{ data: any; error: { message: string } | null }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          display_name: displayName,
          ...profileData,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return { data: null, error: { message: data.error || 'Erro no cadastro' } };
      }
      
      // Se usuário foi aprovado automaticamente (primeiro usuário), fazer login
      if (data.user?.is_approved) {
        const loginResult = await signIn(email, password);
        return loginResult;
      }
      
      return { data, error: null };
    } catch (error: any) {
      console.error('[Auth] Signup error:', error);
      return { data: null, error: { message: error.message || 'Erro de conexão' } };
    }
  }, []);

  const signIn = useCallback(async (
    email: string, 
    password: string
  ): Promise<{ data: any; error: { message: string } | null }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return { data: null, error: { message: data.error || 'Email ou senha incorretos' } };
      }
      
      const user = data.user as LocalUser;
      const token = data.token;
      
      // Salvar no localStorage
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      
      // Atualizar estado
      setAuthState({
        user,
        token,
        isLoading: false,
        role: user.role,
        ...getPermissionsFromRole(user.role),
      });
      
      return { data, error: null };
    } catch (error: any) {
      console.error('[Auth] Login error:', error);
      return { data: null, error: { message: error.message || 'Erro de conexão' } };
    }
  }, []);

  const signOut = useCallback(async (): Promise<{ error: { message: string } | null }> => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      
      if (token) {
        // Tentar invalidar sessão no servidor
        await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        }).catch(() => {}); // Ignorar erros de logout
      }
    } finally {
      // Sempre limpar localStorage
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      
      // Atualizar estado
      setAuthState({
        user: null,
        token: null,
        isLoading: false,
        role: null,
        ...getPermissionsFromRole(null),
      });
    }
    
    return { error: null };
  }, []);

  // Funções não implementadas no backend local (placeholder para compatibilidade)
  const resetPassword = useCallback(async (_email: string): Promise<{ error: { message: string } | null }> => {
    return { error: { message: 'Recuperação de senha não disponível no modo local. Contate o administrador.' } };
  }, []);

  const updatePassword = useCallback(async (_newPassword: string): Promise<{ error: { message: string } | null }> => {
    return { error: { message: 'Alteração de senha não disponível. Contate o administrador.' } };
  }, []);

  return {
    ...authState,
    // Compatibility with old interface
    session: authState.token ? { access_token: authState.token } : null,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
  };
}

// Helper to get API base URL
function getApiBaseUrl(): string {
  // Import dinamicamente para evitar dependência circular
  const stored = localStorage.getItem('arenaApiUrl');
  if (stored) return stored;
  
  // Check for production env variable
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl;
  
  // Default para desenvolvimento local
  return 'http://localhost:5000';
}
