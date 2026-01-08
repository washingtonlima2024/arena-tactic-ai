/**
 * useAuth - Autenticação simplificada para modo local
 * Simula um usuário admin logado para desenvolvimento local
 */
import { useState, useEffect, useCallback } from 'react';

export type AppRole = 'admin' | 'user';

// Simulated user for local development
const LOCAL_ADMIN_USER = {
  id: 'local-admin-user',
  email: 'admin@arenaplay.local',
  user_metadata: {
    display_name: 'Administrador Local',
  },
  created_at: new Date().toISOString(),
};

interface AuthState {
  user: typeof LOCAL_ADMIN_USER | null;
  session: { user: typeof LOCAL_ADMIN_USER } | null;
  isLoading: boolean;
  isAdmin: boolean;
  role: AppRole | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAdmin: false,
    role: null,
  });

  useEffect(() => {
    // Simula carregamento inicial e depois define o usuário local como admin
    const timer = setTimeout(() => {
      setAuthState({
        user: LOCAL_ADMIN_USER,
        session: { user: LOCAL_ADMIN_USER },
        isLoading: false,
        isAdmin: true,
        role: 'admin',
      });
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Funções de autenticação simplificadas para modo local
  const signUp = useCallback(async (_email: string, _password: string, _displayName?: string) => {
    // Em modo local, sempre retorna sucesso
    return { 
      data: { user: LOCAL_ADMIN_USER, session: { user: LOCAL_ADMIN_USER } }, 
      error: null 
    };
  }, []);

  const signIn = useCallback(async (_email: string, _password: string) => {
    // Em modo local, sempre retorna sucesso
    setAuthState({
      user: LOCAL_ADMIN_USER,
      session: { user: LOCAL_ADMIN_USER },
      isLoading: false,
      isAdmin: true,
      role: 'admin',
    });
    return { 
      data: { user: LOCAL_ADMIN_USER, session: { user: LOCAL_ADMIN_USER } }, 
      error: null 
    };
  }, []);

  const signOut = useCallback(async () => {
    // Em modo local, mantém o usuário (não faz logout real)
    return { error: null };
  }, []);

  const resetPassword = useCallback(async (_email: string) => {
    return { error: null };
  }, []);

  const updatePassword = useCallback(async (_newPassword: string) => {
    return { error: null };
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
