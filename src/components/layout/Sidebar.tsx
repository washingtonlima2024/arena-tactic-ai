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
  ChevronRight
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSidebarContext } from '@/contexts/SidebarContext';
import arenaLogo from '@/assets/arena-play-logo.png';
import kakttusLogo from '@/assets/logo-kakttus.png';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Video, label: 'Partidas', path: '/matches' },
  { icon: Upload, label: 'Importar Vídeo', path: '/upload' },
  { icon: BarChart3, label: 'Análise Tática', path: '/analysis' },
  { icon: Calendar, label: 'Eventos', path: '/events' },
  { icon: Scissors, label: 'Cortes & Mídia', path: '/media' },
  { icon: Mic, label: 'Podcast & Locução', path: '/audio' },
  { icon: Settings, label: 'Configurações', path: '/settings' },
];

export function Sidebar() {
  const { collapsed, toggle } = useSidebarContext();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-300",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <img 
              src={arenaLogo} 
              alt="Arena Play Logo" 
              className="h-12 w-12 rounded-lg object-contain"
            />
            <div>
              <h1 className="font-neon text-lg font-bold tracking-wide neon-text-blue">
                ARENA PLAY
              </h1>
              <p className="text-[10px] text-muted-foreground">by Kakttus Solutions</p>
            </div>
          </div>
        )}
        {collapsed && (
          <img 
            src={arenaLogo} 
            alt="Arena Play Logo" 
            className="mx-auto h-12 w-12 rounded-lg object-contain"
          />
        )}
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
      </nav>

      {/* Kakttus Solutions Branding */}
      <div className="border-t border-border p-3">
        {!collapsed && (
          <div className="flex items-center gap-2 mb-3 px-2">
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
          <div className="flex justify-center mb-3">
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
