import { Bell, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from './GlobalSearch';

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-xl">
      {/* Search */}
      <GlobalSearch />

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            3
          </span>
        </Button>
        <div className="h-8 w-px bg-border" />
        <Button variant="ghost" className="gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-arena">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium">Analista</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
        </Button>
      </div>
    </header>
  );
}
