import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface RequireAuthProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function RequireAuth({ children, requireAdmin = false }: RequireAuthProps) {
  const { user, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold text-destructive">Acesso Restrito</h1>
        <p className="text-muted-foreground">
          Você não tem permissão para acessar esta página.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
