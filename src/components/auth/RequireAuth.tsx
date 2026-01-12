import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface RequireAuthProps {
  children: ReactNode;
  /** Requer que seja admin (org_admin ou superadmin) */
  requireAdmin?: boolean;
  /** Requer que seja superadmin */
  requireSuperAdmin?: boolean;
  /** Requer permissão de upload (uploader+) */
  requireUploader?: boolean;
  /** Requer permissão de gerenciamento (manager+) */
  requireManager?: boolean;
  /** Role mínimo permitido */
  minRole?: AppRole;
}

const ROLE_LABELS: Record<AppRole, string> = {
  superadmin: 'Super Administrador',
  org_admin: 'Administrador',
  admin: 'Administrador',
  manager: 'Gerente',
  uploader: 'Operador',
  viewer: 'Visualizador',
  user: 'Usuário',
};

export function RequireAuth({ 
  children, 
  requireAdmin = false,
  requireSuperAdmin = false,
  requireUploader = false,
  requireManager = false,
  minRole,
}: RequireAuthProps) {
  const { 
    user, 
    isLoading, 
    isAdmin, 
    isSuperAdmin, 
    canUpload, 
    canManage,
    role 
  } = useAuth();
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

  // Verificar permissões específicas
  let hasPermission = true;
  let requiredPermission = '';

  if (requireSuperAdmin && !isSuperAdmin) {
    hasPermission = false;
    requiredPermission = 'Super Administrador';
  } else if (requireAdmin && !isAdmin) {
    hasPermission = false;
    requiredPermission = 'Administrador';
  } else if (requireManager && !canManage) {
    hasPermission = false;
    requiredPermission = 'Gerente';
  } else if (requireUploader && !canUpload) {
    hasPermission = false;
    requiredPermission = 'Operador';
  }

  if (!hasPermission) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Acesso Restrito</h1>
          <p className="mt-2 text-muted-foreground">
            Você não tem permissão para acessar esta página.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nível necessário: <span className="font-medium">{requiredPermission}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Seu nível atual: <span className="font-medium">{role ? ROLE_LABELS[role] : 'Desconhecido'}</span>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
