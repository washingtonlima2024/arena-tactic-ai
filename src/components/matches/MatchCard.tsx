import { Match } from '@/types/arena';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, BarChart3, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface MatchCardProps {
  match: Match;
}

const statusLabels = {
  scheduled: 'Agendada',
  live: 'Ao Vivo',
  completed: 'Concluída',
  analyzing: 'Analisando',
};

const statusColors = {
  scheduled: 'secondary',
  live: 'destructive',
  completed: 'success',
  analyzing: 'arena',
} as const;

export function MatchCard({ match }: MatchCardProps) {
  const formattedDate = new Date(match.date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = new Date(match.date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card variant="glow" className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge variant={statusColors[match.status]}>
            {statusLabels[match.status]}
          </Badge>
          <span className="text-xs text-muted-foreground">{match.competition}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Teams */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-2">
            <div 
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
              style={{ backgroundColor: match.homeTeam.primaryColor + '20', color: match.homeTeam.primaryColor }}
            >
              {match.homeTeam.shortName.slice(0, 2)}
            </div>
            <span className="text-sm font-medium">{match.homeTeam.shortName}</span>
          </div>

          <div className="flex flex-col items-center">
            {match.status === 'completed' || match.status === 'analyzing' ? (
              <div className="flex items-center gap-2 text-2xl font-bold">
                <span>{match.score.home}</span>
                <span className="text-muted-foreground">-</span>
                <span>{match.score.away}</span>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-lg font-semibold">{formattedTime}</p>
                <p className="text-xs text-muted-foreground">{formattedDate}</p>
              </div>
            )}
            {match.status === 'analyzing' && match.analysisProgress !== undefined && (
              <div className="mt-2 w-full">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div 
                    className="h-full bg-gradient-arena transition-all duration-500"
                    style={{ width: `${match.analysisProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  {match.analysisProgress}% analisado
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            <div 
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
              style={{ backgroundColor: match.awayTeam.primaryColor + '20', color: match.awayTeam.primaryColor }}
            >
              {match.awayTeam.shortName.slice(0, 2)}
            </div>
            <span className="text-sm font-medium">{match.awayTeam.shortName}</span>
          </div>
        </div>

        {/* Venue */}
        <p className="text-center text-xs text-muted-foreground">{match.venue}</p>

        {/* Actions */}
        <div className="flex gap-2">
          {match.status === 'completed' && (
            <>
              <Button variant="arena-outline" size="sm" className="flex-1" asChild>
                <Link to={`/matches/${match.id}`}>
                  <BarChart3 className="mr-1 h-4 w-4" />
                  Análise
                </Link>
              </Button>
              <Button variant="arena" size="sm" className="flex-1" asChild>
                <Link to={`/matches/${match.id}/video`}>
                  <Play className="mr-1 h-4 w-4" />
                  Vídeo
                </Link>
              </Button>
            </>
          )}
          {match.status === 'analyzing' && (
            <Button variant="secondary" size="sm" className="flex-1" disabled>
              <Clock className="mr-1 h-4 w-4 animate-spin" />
              Processando...
            </Button>
          )}
          {match.status === 'scheduled' && (
            <Button variant="arena-outline" size="sm" className="flex-1" asChild>
              <Link to="/upload">
                Importar Vídeo
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
