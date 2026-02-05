import { Badge } from '@/components/ui/badge';
import { AppRole } from '@/hooks/useAuth';
import { Crown, Shield, UserCog, Upload, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoleBadgeProps {
  role: AppRole | null;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const ROLE_CONFIG: Record<AppRole, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Crown; color: string }> = {
  superadmin: {
    label: 'Super Admin',
    variant: 'destructive',
    icon: Crown,
    color: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0',
  },
  org_admin: {
    label: 'Admin',
    variant: 'default',
    icon: Shield,
    color: 'bg-primary text-primary-foreground',
  },
  admin: {
    label: 'Admin',
    variant: 'default',
    icon: Shield,
    color: 'bg-primary text-primary-foreground',
  },
  manager: {
    label: 'Gerente',
    variant: 'secondary',
    icon: UserCog,
    color: 'bg-blue-500 text-white',
  },
  uploader: {
    label: 'Operador',
    variant: 'secondary',
    icon: Upload,
    color: 'bg-emerald-500 text-white',
  },
  viewer: {
    label: 'Espectador',
    variant: 'outline',
    icon: Eye,
    color: '',
  },
  user: {
    label: 'Usuário',
    variant: 'outline',
    icon: Eye,
    color: '',
  },
};

export function RoleBadge({ role, size = 'sm', showIcon = true, className }: RoleBadgeProps) {
  if (!role) return null;

  const config = ROLE_CONFIG[role] || ROLE_CONFIG.viewer;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <Badge
      variant={config.variant}
      className={cn(
        sizeClasses[size],
        config.color,
        'gap-1 font-medium',
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {config.label}
    </Badge>
  );
}
