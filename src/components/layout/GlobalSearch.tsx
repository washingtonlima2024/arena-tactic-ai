import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Users, Calendar, Zap, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGlobalSearch, SearchResult } from '@/hooks/useGlobalSearch';
import { cn } from '@/lib/utils';

const typeIcons = {
  match: Calendar,
  team: Users,
  event: Zap,
  player: User,
};

const typeLabels = {
  match: 'Partida',
  team: 'Time',
  event: 'Evento',
  player: 'Jogador',
};

const typeColors = {
  match: 'bg-primary/20 text-primary',
  team: 'bg-arena-emerald/20 text-arena-emerald',
  event: 'bg-amber-500/20 text-amber-500',
  player: 'bg-purple-500/20 text-purple-500',
};

export function GlobalSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const {
    query,
    results,
    isOpen,
    setIsOpen,
    handleSearch,
    clearSearch,
  } = useGlobalSearch();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setIsOpen]);

  const handleResultClick = (result: SearchResult) => {
    navigate(result.path);
    clearSearch();
  };

  return (
    <div ref={containerRef} className="relative w-96">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="Buscar partidas, jogadores, eventos... (Ctrl+K)"
          className="h-10 bg-muted/50 pl-10 pr-10 focus:bg-muted"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={clearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50">
          <div className="bg-background/95 backdrop-blur-xl border border-border rounded-lg shadow-2xl overflow-hidden">
            {results.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhum resultado encontrado para "{query}"</p>
                <p className="text-xs mt-1">Tente buscar por nome de time, jogador ou evento</p>
              </div>
            ) : (
              <ScrollArea className="max-h-80">
                <div className="p-2">
                  {results.map((result) => {
                    const Icon = typeIcons[result.type];
                    return (
                      <button
                        key={`${result.type}-${result.id}`}
                        onClick={() => handleResultClick(result)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg text-left",
                          "hover:bg-muted/70 transition-colors duration-150",
                          "focus:outline-none focus:bg-muted/70"
                        )}
                      >
                        <div className={cn(
                          "flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg",
                          typeColors[result.type]
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{result.title}</p>
                          {result.subtitle && (
                            <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                          )}
                        </div>
                        <span className="flex-shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted px-2 py-1 rounded">
                          {typeLabels[result.type]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            {/* Footer hint */}
            <div className="border-t border-border px-3 py-2 bg-muted/30">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Pressione <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Enter</kbd> para navegar</span>
                <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Esc</kbd> para fechar</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
