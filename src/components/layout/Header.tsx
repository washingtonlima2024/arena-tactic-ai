import { useNavigate } from 'react-router-dom';
import { Bell, User, LogOut, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from './GlobalSearch';
import { ProjectSelector } from './ProjectSelector';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export function Header() {
  const navigate = useNavigate();
  const { user, isAdmin, role, signOut } = useAuth();

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error('Erro ao sair');
      return;
    }
    toast.success('Logout realizado');
    navigate('/auth');
  };

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Usuário';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-xl">
      {/* Left side: Project Selector + Search */}
      <div className="flex items-center gap-4">
        <ProjectSelector />
        <div className="h-6 w-px bg-border hidden md:block" />
        <div className="hidden md:block">
          <GlobalSearch />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Badge variant="arena" className="gap-1">
            <Shield className="h-3 w-3" />
            Admin
          </Badge>
        )}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            3
          </span>
        </Button>
        <div className="h-8 w-px bg-border" />
        
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-arena">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{role || 'user'}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="text-xs text-muted-foreground">
                {user.email}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="outline" onClick={() => navigate('/auth')}>
            Entrar
          </Button>
        )}
      </div>
    </header>
  );
}
