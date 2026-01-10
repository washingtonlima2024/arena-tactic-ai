import { 
  LayoutDashboard, 
  Video, 
  Upload, 
  BarChart3, 
  Calendar, 
  Scissors, 
  Mic, 
  Settings, 
  ChevronLeft,
  ChevronRight,
  Radio,
  ShieldCheck,
  Ruler,
  Layers,
  Share2
} from 'lucide-react';
import { NavLink, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSidebarContext } from '@/contexts/SidebarContext';
import { useAuth } from '@/hooks/useAuth';
import { ServerStatusIndicator } from './ServerStatusIndicator';
import arenaIcon from '@/assets/arena-play-icon.png';
import arenaWordmark from '@/assets/arena-play-wordmark.png';
import kakttusLogo from '@/assets/logo-kakttus.png';

const navItems = [
  { icon: LayoutDashboard, label: 'Início', path: '/' },
  { icon: Video, label: 'Partidas', path: '/matches' },
  { icon: Upload, label: 'Importar Vídeo', path: '/upload' },
  { icon: Radio, label: 'Ao Vivo', path: '/live' },
  { icon: BarChart3, label: 'Análise Tática', path: '/analysis' },
  { icon: Layers, label: 'Dashboard Análise', path: '/dashboard' },
  { icon: Calendar, label: 'Eventos', path: '/events' },
  { icon: Scissors, label: 'Cortes & Mídia', path: '/media' },
  { icon: Mic, label: 'Podcast & Locução', path: '/audio' },
  { icon: Share2, label: 'Redes Sociais', path: '/social' },
  { icon: Ruler, label: 'Campo FIFA', path: '/field' },
  { icon: Settings, label: 'Configurações', path: '/settings' },
];

const adminItems = [
  { icon: ShieldCheck, label: 'Administração', path: '/admin' },
];

export function Sidebar() {
  const { isAdmin } = useAuth();
  const { collapsed, toggle } = useSidebarContext();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-300",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo - Com link para home */}
      <div className="flex h-20 items-center justify-between border-b border-border px-4">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img 
            src={arenaIcon} 
            alt="Arena Play" 
            className="h-10 w-10 object-contain"
          />
          {!collapsed && (
            <img 
              src={arenaWordmark} 
              alt="Arena Play" 
              className="h-8 object-contain"
            />
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 scrollbar-arena">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive
                      ? "bg-primary/10 text-primary shadow-sm arena-glow-subtle"
                      : "text-sidebar-foreground"
                  )
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Admin Section */}
        {isAdmin && (
          <>
            <div className="my-3 px-3">
              {!collapsed && (
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Admin
                </span>
              )}
              {collapsed && <div className="h-px bg-border" />}
            </div>
            <ul className="space-y-1">
              {adminItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        isActive
                          ? "bg-primary/10 text-primary shadow-sm arena-glow-subtle"
                          : "text-sidebar-foreground"
                      )
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* Server Status & Kakttus Solutions Branding */}
      <div className="border-t border-border p-3 space-y-3">
        {/* Server Status Indicator */}
        <ServerStatusIndicator collapsed={collapsed} />

        {/* Kakttus Solutions Branding */}
        {!collapsed && (
          <div className="flex items-center gap-2 px-2">
            <img 
              src={kakttusLogo} 
              alt="Kakttus Solutions" 
              className="h-8 w-8 rounded object-contain"
            />
            <span className="text-lg font-bold text-white tracking-wide">
              Kakttus Solutions
            </span>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            <img 
              src={kakttusLogo} 
              alt="Kakttus Solutions" 
              className="h-8 w-8 rounded object-contain"
            />
          </div>
        )}

        {/* Collapse Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className="w-full justify-center"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span className="ml-2">Recolher</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
