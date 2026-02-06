import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Target,
  Shield,
  AlertTriangle,
  Flag,
  CornerDownRight,
  ArrowLeftRight,
  Zap,
  Users,
  CheckCircle,
  Clock,
  LayoutGrid,
} from 'lucide-react';

interface TeamStats {
  home: number;
  away: number;
  total: number;
}

interface DynamicStats {
  goals: TeamStats;
  shots: TeamStats;
  shotsOnTarget: TeamStats;
  saves: TeamStats;
  fouls: TeamStats;
  yellowCards: TeamStats;
  redCards: TeamStats;
  corners: TeamStats;
  offsides: TeamStats;
  substitutions: TeamStats;
  tactical: TeamStats;
  pending: number;
  approved: number;
  total: number;
}

interface MatchStatsGridProps {
  stats: DynamicStats;
  homeTeamName: string;
  awayTeamName: string;
}

interface StatItem {
  label: string;
  home: number;
  away: number;
  icon: React.ElementType;
  show: boolean;
}

export function MatchStatsGrid({ stats, homeTeamName, awayTeamName }: MatchStatsGridProps) {
  const items: StatItem[] = [
    { label: 'Gols', home: stats.goals.home, away: stats.goals.away, icon: Target, show: stats.goals.total > 0 },
    { label: 'Finalizacoes', home: stats.shots.home, away: stats.shots.away, icon: Target, show: stats.shots.total > 0 },
    { label: 'No Gol', home: stats.shotsOnTarget.home, away: stats.shotsOnTarget.away, icon: Target, show: stats.shotsOnTarget.total > 0 },
    { label: 'Defesas', home: stats.saves.home, away: stats.saves.away, icon: Shield, show: stats.saves.total > 0 },
    { label: 'Faltas', home: stats.fouls.home, away: stats.fouls.away, icon: AlertTriangle, show: stats.fouls.total > 0 },
    { label: 'Amarelos', home: stats.yellowCards.home, away: stats.yellowCards.away, icon: AlertTriangle, show: stats.yellowCards.total > 0 },
    { label: 'Vermelhos', home: stats.redCards.home, away: stats.redCards.away, icon: AlertTriangle, show: stats.redCards.total > 0 },
    { label: 'Escanteios', home: stats.corners.home, away: stats.corners.away, icon: CornerDownRight, show: stats.corners.total > 0 },
    { label: 'Impedimentos', home: stats.offsides.home, away: stats.offsides.away, icon: Flag, show: stats.offsides.total > 0 },
    { label: 'Substituicoes', home: stats.substitutions.home, away: stats.substitutions.away, icon: ArrowLeftRight, show: stats.substitutions.total > 0 },
    { label: 'Jogadas Taticas', home: stats.tactical.home, away: stats.tactical.away, icon: Zap, show: stats.tactical.total > 0 },
  ];

  const visibleItems = items.filter(i => i.show);

  if (visibleItems.length === 0) return null;

  return (
    <Card variant="glass" className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-primary" />
          Estatisticas Detalhadas
        </CardTitle>
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>{homeTeamName}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {stats.total} eventos
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              {stats.approved} aprovados
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {stats.pending} pendentes
            </span>
          </div>
          <span>{awayTeamName}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {visibleItems.map((item, index) => (
            <div
              key={index}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-border/50 bg-muted/20 p-3 text-center"
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <div className="flex items-center gap-3 font-bold tabular-nums">
                <span>{item.home}</span>
                <span className="text-muted-foreground text-xs">x</span>
                <span>{item.away}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
