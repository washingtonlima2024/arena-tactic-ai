import { useNavigate } from 'react-router-dom';
import { Bell, User, LogOut, Shield, Radio, Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from './GlobalSearch';
import { ProjectSelector } from './ProjectSelector';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { useLiveBroadcastContext } from '@/contexts/LiveBroadcastContext';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useState } from 'react';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const { user, isAdmin, role, signOut } = useAuth();
  const { isRecording, recordingTime, matchInfo } = useLiveBroadcastContext();
  const isMobile = useIsMobile();
  const [searchOpen, setSearchOpen] = useState(false);

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
    <header className="sticky top-0 z-30 flex h-14 md:h-16 items-center justify-between border-b border-border bg-background/80 px-4 md:px-6 backdrop-blur-xl">
      {/* Left side */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Mobile menu button */}
        {isMobile && onMenuClick && (
          <Button variant="ghost" size="icon" onClick={onMenuClick} className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        )}
        
        <ProjectSelector />
        
        {/* Desktop search */}
        <div className="hidden md:flex items-center gap-4">
          <div className="h-6 w-px bg-border" />
          <GlobalSearch />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Mobile search button */}
        {isMobile && (
          <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <Search className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="top-4 translate-y-0 sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Buscar</DialogTitle>
              </DialogHeader>
              <div className="mt-2">
                <GlobalSearch />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Live Recording Badge */}
        {isRecording && (
          <button
            onClick={() => navigate("/live")}
            className={cn(
              "flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-full",
              "bg-red-500/20 border border-red-500/50 hover:bg-red-500/30 transition-colors cursor-pointer"
            )}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            {!isMobile && <Radio className="h-3.5 w-3.5 text-red-500" />}
            <span className="text-red-500 font-semibold text-xs md:text-sm">
              {isMobile ? formatTime(recordingTime) : 'AO VIVO'}
            </span>
            {!isMobile && (
              <span className="text-red-400 font-mono text-xs">
                {formatTime(recordingTime)}
              </span>
            )}
            {!isMobile && matchInfo.homeTeam && matchInfo.awayTeam && (
              <span className="text-red-400/70 text-xs hidden lg:inline">
                • {matchInfo.homeTeam} x {matchInfo.awayTeam}
              </span>
            )}
          </button>
        )}

        {/* Admin badge - hidden on mobile */}
        {isAdmin && !isMobile && (
          <Badge variant="arena" className="gap-1">
            <Shield className="h-3 w-3" />
            Admin
          </Badge>
        )}
        
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative h-9 w-9 md:h-10 md:w-10">
          <Bell className="h-4 w-4 md:h-5 md:w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            3
          </span>
        </Button>
        
        <div className="h-6 md:h-8 w-px bg-border hidden md:block" />
        
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2 md:px-3">
                <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-full bg-gradient-arena">
                  <User className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary-foreground" />
                </div>
                {!isMobile && (
                  <div className="text-left">
                    <p className="text-sm font-medium">{displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{role || 'user'}</p>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover">
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
          <Button variant="outline" size={isMobile ? "sm" : "default"} onClick={() => navigate('/auth')}>
            Entrar
          </Button>
        )}
      </div>
    </header>
  );
}

// Helper for cn
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
