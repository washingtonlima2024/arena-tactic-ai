import { NavLink, useSearchParams } from 'react-router-dom';
import { Home, Video, Radio, Calendar, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

const MATCH_CONTEXT_PAGES = ['/events', '/analysis', '/media', '/audio', '/field', '/dashboard'];

const navItems = [
  { icon: Home, label: 'Início', path: '/home' },
  { icon: Video, label: 'Partidas', path: '/matches' },
  { icon: Radio, label: 'Ao Vivo', path: '/live' },
  { icon: Calendar, label: 'Eventos', path: '/events' },
];

interface BottomNavProps {
  onMenuClick: () => void;
}

export function BottomNav({ onMenuClick }: BottomNavProps) {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const currentMatchId = searchParams.get('match') || sessionStorage.getItem('arena_selected_match');

  if (!isMobile) return null;

  const getNavPath = (basePath: string) => {
    if (MATCH_CONTEXT_PAGES.includes(basePath) && currentMatchId) {
      return `${basePath}?match=${currentMatchId}`;
    }
    return basePath;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={getNavPath(item.path)}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px]",
                "active:scale-95 touch-manipulation",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}
        
        {/* Menu button */}
        <button
          onClick={onMenuClick}
          className={cn(
            "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px]",
            "text-muted-foreground hover:text-foreground active:scale-95 touch-manipulation"
          )}
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </nav>
  );
}
