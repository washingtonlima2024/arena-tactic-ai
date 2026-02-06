import { NavLink, Link, useSearchParams } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  Upload, 
  BarChart3, 
  Calendar, 
  Scissors, 
  Mic, 
  Settings, 
  Radio,
  ShieldCheck,
  Ruler,
  Layers,
  Share2,
  LogOut,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { ServerStatusIndicator } from './ServerStatusIndicator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import arenaIcon from '@/assets/arena-play-icon.png';
import arenaWordmark from '@/assets/arena-play-wordmark.png';
import kakttusLogo from '@/assets/logo-kakttus.png';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const MATCH_CONTEXT_PAGES = ['/events', '/analysis', '/media', '/audio', '/field', '/dashboard'];

// Itens visíveis para todos (Espectador+)
const viewerItems = [
  { icon: LayoutDashboard, label: 'Início', path: '/home' },
  { icon: Video, label: 'Partidas', path: '/matches' },
  { icon: BarChart3, label: 'Análise Tática', path: '/analysis' },
  { icon: Layers, label: 'Dashboard Análise', path: '/dashboard' },
  { icon: Calendar, label: 'Eventos', path: '/events' },
  { icon: Scissors, label: 'Cortes & Mídia', path: '/media' },
  { icon: Mic, label: 'Podcast & Locução', path: '/audio' },
  { icon: Ruler, label: 'Campo FIFA', path: '/field' },
];

// Itens visíveis para Operador+ (nível 40+)
const uploaderItems = [
  { icon: Upload, label: 'Importar Vídeo', path: '/upload?mode=new' },
  { icon: Radio, label: 'Ao Vivo', path: '/live' },
  { icon: Share2, label: 'Redes Sociais', path: '/social' },
];

// Itens visíveis para Gerente+ (nível 60+)
const managerItems = [
  { icon: Settings, label: 'Configurações', path: '/settings' },
];

const superAdminItems = [
  { icon: ShieldCheck, label: 'Administração', path: '/admin' },
];

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const { isSuperAdmin, canUpload, canManage, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentMatchId = searchParams.get('match') || sessionStorage.getItem('arena_selected_match');

  const getNavPath = (basePath: string) => {
    if (MATCH_CONTEXT_PAGES.includes(basePath) && currentMatchId) {
      return `${basePath}?match=${currentMatchId}`;
    }
    return basePath;
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error('Erro ao sair');
      return;
    }
    toast.success('Logout realizado');
    onOpenChange(false);
    navigate('/auth');
  };

  const handleNavClick = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0 bg-sidebar">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Link to="/home" onClick={handleNavClick} className="flex items-center gap-2">
              <img src={arenaIcon} alt="Arena Play" className="h-8 w-8 object-contain" />
              <img src={arenaWordmark} alt="Arena Play" className="h-6 object-contain" />
            </Link>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 h-[calc(100vh-180px)]">
          <nav className="p-3">
            {/* Itens para todos */}
            <ul className="space-y-1">
              {viewerItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={getNavPath(item.path)}
                    onClick={handleNavClick}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all",
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        "active:scale-[0.98] touch-manipulation",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-sidebar-foreground"
                      )
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>

            {/* Operador+ (nível 40+) */}
            {canUpload && (
              <>
                <Separator className="my-3" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3">
                  Operações
                </span>
                <ul className="space-y-1 mt-2">
                  {uploaderItems.map((item) => (
                    <li key={item.path}>
                      <NavLink
                        to={getNavPath(item.path)}
                        onClick={handleNavClick}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all",
                            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            "active:scale-[0.98] touch-manipulation",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-sidebar-foreground"
                          )
                        }
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Gerente+ (nível 60+) */}
            {canManage && (
              <>
                <Separator className="my-3" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3">
                  Gestão
                </span>
                <ul className="space-y-1 mt-2">
                  {managerItems.map((item) => (
                    <li key={item.path}>
                      <NavLink
                        to={getNavPath(item.path)}
                        onClick={handleNavClick}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all",
                            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            "active:scale-[0.98] touch-manipulation",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-sidebar-foreground"
                          )
                        }
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* SuperAdmin only */}
            {isSuperAdmin && (
              <>
                <Separator className="my-3" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3">
                  Admin
                </span>
                <ul className="space-y-1 mt-2">
                  {superAdminItems.map((item) => (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        onClick={handleNavClick}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all",
                            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            "active:scale-[0.98] touch-manipulation",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-sidebar-foreground"
                          )
                        }
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-border p-3 bg-sidebar space-y-3">
          <ServerStatusIndicator collapsed={false} />
          
          <div className="flex items-center gap-2 px-2">
            <img src={kakttusLogo} alt="Kakttus" className="h-6 w-6 rounded" />
            <span className="text-sm font-medium text-muted-foreground">Kakttus Solutions</span>
          </div>

          {user && (
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
