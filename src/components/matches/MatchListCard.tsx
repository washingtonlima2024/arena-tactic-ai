import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Radio, Trash2, RefreshCw, Mic } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TeamBadge } from '@/components/teams/TeamBadge';
import { useMatchEvents } from '@/hooks/useMatchDetails';
import { calculateScoreFromEvents } from '@/hooks/useDynamicMatchStats';
import { Match } from '@/hooks/useMatches';

interface MatchListCardProps {
  match: Match;
  onDelete?: (match: Match) => void;
  onReprocess?: (match: Match) => void;
}

export function MatchListCard({ match, onDelete, onReprocess }: MatchListCardProps) {
  // Fetch events for dynamic score calculation - same as ProjectSelector
  const { data: events = [] } = useMatchEvents(match.id);
  
  // Calculate score dynamically from events - same logic as ProjectSelector
  const dynamicScore = calculateScoreFromEvents(
    events,
    match.home_team?.name || '',
    match.away_team?.name || ''
  );
  
  // Use dynamic score if events exist, otherwise fallback to database score
  const homeScore = events.length > 0 ? dynamicScore.home : (match.home_score ?? 0);
  const awayScore = events.length > 0 ? dynamicScore.away : (match.away_score ?? 0);

  return (
    <Card variant="glass" className="overflow-hidden hover:border-primary/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Badge variant={
            match.status === 'completed' ? 'success' :
            match.status === 'analyzing' ? 'arena' : 'secondary'
          }>
            {match.status === 'completed' ? 'Analisada' :
             match.status === 'analyzing' ? 'Analisando' : 'Pendente'}
          </Badge>
          {match.competition && (
            <span className="text-xs text-muted-foreground">{match.competition}</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 mb-4">
          {/* Home Team */}
          <div className="flex-1 text-center">
            <TeamBadge 
              team={{
                name: match.home_team?.name || 'Casa',
                logo_url: match.home_team?.logo_url || undefined,
                short_name: match.home_team?.short_name || match.home_team?.name?.slice(0, 3),
                primary_color: match.home_team?.primary_color || undefined
              }} 
              size="lg" 
              className="mx-auto mb-2"
            />
            <p className="text-sm font-medium truncate">{match.home_team?.name || 'Time Casa'}</p>
          </div>

          {/* Score - now uses dynamic score like ProjectSelector */}
          <div className="text-center">
            <div className="text-2xl font-bold">
              {homeScore} - {awayScore}
            </div>
          </div>

          {/* Away Team */}
          <div className="flex-1 text-center">
            <TeamBadge 
              team={{
                name: match.away_team?.name || 'Visitante',
                logo_url: match.away_team?.logo_url || undefined,
                short_name: match.away_team?.short_name || match.away_team?.name?.slice(0, 3),
                primary_color: match.away_team?.primary_color || undefined
              }} 
              size="lg" 
              className="mx-auto mb-2"
            />
            <p className="text-sm font-medium truncate">{match.away_team?.name || 'Time Visitante'}</p>
          </div>
        </div>

        {match.match_date && (
          <p className="text-xs text-center text-muted-foreground">
            {format(new Date(match.match_date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        )}

        <div className="flex gap-2 mt-4">
          {/* Live match buttons */}
          {match.status === 'live' && (
            <Button variant="arena" size="sm" className="flex-1 animate-pulse" asChild>
              <Link to="/live">
                <Radio className="mr-2 h-4 w-4" />
                Ver Ao Vivo
              </Link>
            </Button>
          )}
          {(match.status === 'completed' || match.status === 'analyzed') && (
            <Button variant="arena-outline" size="sm" className="flex-1" asChild>
              <Link to={`/events?match=${match.id}`}>Ver Análise</Link>
            </Button>
          )}
          {match.status === 'pending' && (
            <Button variant="arena-outline" size="sm" className="flex-1" asChild>
              <Link to={`/events?match=${match.id}`}>Ver Análise</Link>
            </Button>
          )}
          {match.status === 'analyzing' && (
            <Button variant="secondary" size="sm" className="flex-1" disabled>
              Analisando...
            </Button>
          )}
          
          {/* Reprocess button */}
          {(match.status === 'completed' || match.status === 'analyzed' || match.status === 'pending') && onReprocess && (
            <Button 
              variant="ghost" 
              size="icon"
              className="h-8 w-8"
              onClick={() => onReprocess(match)}
              title="Reprocessar partida"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          
          {/* Delete button */}
          {onDelete && (
            <Button 
              variant="ghost" 
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onDelete(match)}
              title="Excluir partida"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
