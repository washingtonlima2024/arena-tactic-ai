import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface TeamStats {
  home: number;
  away: number;
  total: number;
}

interface DynamicStats {
  score: { home: number; away: number };
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
  total: number;
}

interface TeamComparisonPanelProps {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamColor: string;
  awayTeamColor: string;
  stats: DynamicStats;
  possession: { home: number; away: number };
}

interface ComparisonRow {
  label: string;
  home: number;
  away: number;
  suffix?: string;
}

export function TeamComparisonPanel({
  homeTeamName,
  awayTeamName,
  homeTeamColor,
  awayTeamColor,
  stats,
  possession
}: TeamComparisonPanelProps) {
  const rows: ComparisonRow[] = useMemo(() => [
    { label: 'Posse de Bola', home: possession.home, away: possession.away, suffix: '%' },
    { label: 'Gols', home: stats.goals.home, away: stats.goals.away },
    { label: 'Finalizacoes', home: stats.shots.home, away: stats.shots.away },
    { label: 'Chutes no Gol', home: stats.shotsOnTarget.home, away: stats.shotsOnTarget.away },
    { label: 'Defesas', home: stats.saves.home, away: stats.saves.away },
    { label: 'Faltas', home: stats.fouls.home, away: stats.fouls.away },
    { label: 'Cartoes Amarelos', home: stats.yellowCards.home, away: stats.yellowCards.away },
    { label: 'Cartoes Vermelhos', home: stats.redCards.home, away: stats.redCards.away },
    { label: 'Escanteios', home: stats.corners.home, away: stats.corners.away },
    { label: 'Impedimentos', home: stats.offsides.home, away: stats.offsides.away },
    { label: 'Recuperacoes', home: stats.tactical.home, away: stats.tactical.away },
  ], [stats, possession]);

  // Only show rows that have at least 1 event
  const visibleRows = rows.filter(r => r.home + r.away > 0 || r.label === 'Posse de Bola');

  if (visibleRows.length === 0) return null;

  return (
    <Card variant="glass" className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Comparativo de Estatisticas
        </CardTitle>
        <div className="flex items-center justify-between text-sm font-semibold mt-2">
          <span style={{ color: homeTeamColor }}>{homeTeamName}</span>
          <span style={{ color: awayTeamColor }}>{awayTeamName}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {visibleRows.map((row, index) => {
            const total = row.home + row.away || 1;
            const homePercent = (row.home / total) * 100;

            return (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold tabular-nums">
                    {row.home}{row.suffix || ''}
                  </span>
                  <span className="text-muted-foreground text-xs">{row.label}</span>
                  <span className="font-bold tabular-nums">
                    {row.away}{row.suffix || ''}
                  </span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="transition-all duration-500 rounded-l-full"
                    style={{
                      width: `${homePercent}%`,
                      backgroundColor: homeTeamColor,
                      opacity: 0.8,
                    }}
                  />
                  <div
                    className="transition-all duration-500 rounded-r-full"
                    style={{
                      width: `${100 - homePercent}%`,
                      backgroundColor: awayTeamColor,
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
