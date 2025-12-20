import { useNavigate } from 'react-router-dom';
import { Bell, User, LogOut, Shield, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from './GlobalSearch';
import { ProjectSelector } from './ProjectSelector';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { useLiveBroadcastContext } from '@/contexts/LiveBroadcastContext';
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
  const { isRecording, recordingTime, matchInfo } = useLiveBroadcastContext();

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error('Erro ao sair');
      return;
    }
    toast.success('Logout realizado');
    navigate('/auth');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
        {/* Live Recording Badge - Clickable to navigate to /live */}
        {isRecording && (
          <button
            onClick={() => navigate("/live")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/50 hover:bg-red-500/30 transition-colors cursor-pointer group"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <Radio className="h-3.5 w-3.5 text-red-500" />
            <span className="text-red-500 font-semibold text-sm">
              AO VIVO
            </span>
            <span className="text-red-400 font-mono text-xs">
              {formatTime(recordingTime)}
            </span>
            {matchInfo.homeTeam && matchInfo.awayTeam && (
              <span className="text-red-400/70 text-xs hidden sm:inline">
                • {matchInfo.homeTeam} x {matchInfo.awayTeam}
              </span>
            )}
          </button>
        )}

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
