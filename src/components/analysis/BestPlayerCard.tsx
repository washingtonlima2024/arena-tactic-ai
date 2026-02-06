import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Target, Shield, AlertTriangle } from 'lucide-react';

export interface BestPlayer {
  name: string;
  team: 'home' | 'away';
  goals: number;
  assists: number;
  saves: number;
  recoveries: number;
  totalActions: number;
}

interface BestPlayerCardProps {
  player: BestPlayer | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamColor: string;
  awayTeamColor: string;
}

export function BestPlayerCard({
  player,
  homeTeamName,
  awayTeamName,
  homeTeamColor,
  awayTeamColor
}: BestPlayerCardProps) {
  if (!player) return null;

  const teamName = player.team === 'home' ? homeTeamName : awayTeamName;
  const teamColor = player.team === 'home' ? homeTeamColor : awayTeamColor;

  const stats = [
    { label: 'Gols', value: player.goals, icon: Target, show: player.goals > 0 },
    { label: 'Assistencias', value: player.assists, icon: Target, show: player.assists > 0 },
    { label: 'Defesas', value: player.saves, icon: Shield, show: player.saves > 0 },
    { label: 'Recuperacoes', value: player.recoveries, icon: AlertTriangle, show: player.recoveries > 0 },
  ].filter(s => s.show);

  return (
    <Card className="animate-fade-in overflow-hidden border-0">
      <div
        className="p-[2px] rounded-xl"
        style={{
          background: `linear-gradient(135deg, ${teamColor}, ${teamColor}66, transparent)`,
        }}
      >
        <CardContent className="bg-card rounded-[10px] p-6">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full shrink-0"
              style={{ backgroundColor: `${teamColor}20` }}
            >
              <Trophy className="h-7 w-7" style={{ color: teamColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Melhor em Campo
              </p>
              <h3 className="text-xl font-bold truncate">{player.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className="text-xs border-current"
                  style={{ color: teamColor }}
                >
                  {teamName}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {player.totalActions} acoes decisivas
                </span>
              </div>
            </div>
          </div>

          {stats.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-border/50">
              {stats.map((stat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    <span className="font-bold">{stat.value}</span>{' '}
                    <span className="text-muted-foreground">{stat.label}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
