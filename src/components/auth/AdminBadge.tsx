import { Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';

export function AdminBadge() {
  const { isAdmin } = useAuth();

  if (!isAdmin) return null;

  return (
    <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
      <Shield className="h-3 w-3" />
      Admin
    </Badge>
  );
}
