import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { MobileNav } from './MobileNav';
import { useSidebarContext } from '@/contexts/SidebarContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { collapsed } = useSidebarContext();
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden max-w-[100vw]">
      {/* Desktop Sidebar */}
      {!isMobile && <Sidebar />}
      
      {/* Mobile Navigation Sheet */}
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      
      <div 
        className={cn(
          "flex min-h-screen flex-col transition-all duration-300 overflow-x-hidden",
          !isMobile && (collapsed ? "ml-20" : "ml-64")
        )}
      >
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main className={cn(
          "flex-1 p-4 md:p-6 overflow-x-hidden",
          isMobile && "pb-20" // Space for bottom nav
        )}>
          {children}
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <BottomNav onMenuClick={() => setMobileNavOpen(true)} />
    </div>
  );
}
