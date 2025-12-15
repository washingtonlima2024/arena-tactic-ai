import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Trophy, Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function ProjectSelector() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedMatch, matches, isLoading, setSelectedMatch } = useMatchSelection();

  // Pages that use match context
  const matchContextPages = ['/events', '/analysis', '/media', '/audio', '/field'];
  const isOnMatchPage = matchContextPages.some(page => location.pathname.startsWith(page));

  const handleSelectMatch = (matchId: string) => {
    setSelectedMatch(matchId);
    // If not on a match page, navigate to events
    if (!isOnMatchPage) {
      navigate(`/events?match=${matchId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
    );
  }

  if (!selectedMatch && matches.length === 0) {
    return (
      <Button 
        variant="outline" 
        size="sm"
        onClick={() => navigate('/upload')}
        className="gap-2"
      >
        <Trophy className="h-4 w-4" />
        Novo Projeto
      </Button>
    );
  }

  const homeTeam = selectedMatch?.home_team;
  const awayTeam = selectedMatch?.away_team;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="gap-2 h-auto py-2 px-3 hover:bg-muted/50"
        >
          {selectedMatch ? (
            <div className="flex items-center gap-3">
              {/* Team badges */}
              <div className="flex items-center gap-1">
                {homeTeam?.logo_url ? (
                  <img 
                    src={homeTeam.logo_url} 
                    alt={homeTeam.name} 
                    className="h-6 w-6 object-contain"
                  />
                ) : (
                  <div 
                    className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: homeTeam?.primary_color || '#10b981' }}
                  >
                    {homeTeam?.short_name?.[0] || homeTeam?.name?.[0] || 'H'}
                  </div>
                )}
                <span className="text-sm font-semibold">
                  {selectedMatch.home_score ?? 0}
                </span>
                <span className="text-muted-foreground text-xs">x</span>
                <span className="text-sm font-semibold">
                  {selectedMatch.away_score ?? 0}
                </span>
                {awayTeam?.logo_url ? (
                  <img 
                    src={awayTeam.logo_url} 
                    alt={awayTeam.name} 
                    className="h-6 w-6 object-contain"
                  />
                ) : (
                  <div 
                    className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: awayTeam?.primary_color || '#ef4444' }}
                  >
                    {awayTeam?.short_name?.[0] || awayTeam?.name?.[0] || 'A'}
                  </div>
                )}
              </div>
              
              {/* Match info */}
              <div className="text-left hidden sm:block">
                <p className="text-xs font-medium line-clamp-1">
                  {homeTeam?.short_name || homeTeam?.name} vs {awayTeam?.short_name || awayTeam?.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {selectedMatch.competition || 'Partida'}
                </p>
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Selecionar partida</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Projetos / Partidas Analisadas
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <div className="max-h-[300px] overflow-y-auto">
          {matches.map((match) => {
            const isSelected = match.id === selectedMatch?.id;
            return (
              <DropdownMenuItem
                key={match.id}
                onClick={() => handleSelectMatch(match.id)}
                className={`flex items-center gap-3 p-3 cursor-pointer ${
                  isSelected ? 'bg-primary/10' : ''
                }`}
              >
                {/* Team logos */}
                <div className="flex items-center gap-1">
                  {match.home_team?.logo_url ? (
                    <img 
                      src={match.home_team.logo_url} 
                      alt="" 
                      className="h-5 w-5 object-contain"
                    />
                  ) : (
                    <div 
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: match.home_team?.primary_color || '#10b981' }}
                    />
                  )}
                  <span className="text-sm font-bold mx-1">
                    {match.home_score ?? 0} x {match.away_score ?? 0}
                  </span>
                  {match.away_team?.logo_url ? (
                    <img 
                      src={match.away_team.logo_url} 
                      alt="" 
                      className="h-5 w-5 object-contain"
                    />
                  ) : (
                    <div 
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: match.away_team?.primary_color || '#ef4444' }}
                    />
                  )}
                </div>
                
                {/* Match details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {match.home_team?.name || 'Time A'} vs {match.away_team?.name || 'Time B'}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {match.competition && (
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3 w-3" />
                        {match.competition}
                      </span>
                    )}
                    {match.match_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(match.match_date), 'dd/MM', { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </div>
                
                {isSelected && (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
              </DropdownMenuItem>
            );
          })}
        </div>
        
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={() => navigate('/upload')}
          className="text-primary"
        >
          <Trophy className="mr-2 h-4 w-4" />
          Nova Partida
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
