import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Target, 
  Shield, 
  AlertTriangle, 
  Flag, 
  Lightbulb, 
  TrendingUp,
  Activity,
  Zap
} from "lucide-react";

interface TeamStats {
  goals: number;
  shots: number;
  fouls: number;
  cards: number;
  corners: number;
  saves: number;
  recoveries: number;
  offsides: number;
}

interface KeyMoment {
  timestamp: string;
  type: string;
  description: string;
  player?: string;
}

interface LiveAnalysisPanelProps {
  homeTeam: string;
  awayTeam: string;
  homeStats: TeamStats;
  awayStats: TeamStats;
  insights: string[];
  keyMoments: KeyMoment[];
  matchSummary: string;
  possession: { home: number; away: number };
  eventsCount: number;
}

function getKeyMomentIcon(type: string): string {
  switch (type) {
    case 'goal': return '⚽';
    case 'ownGoal': return '🔴';
    case 'shot': return '🎯';
    case 'save': return '🧤';
    case 'yellowCard': return '🟨';
    case 'redCard': return '🟥';
    case 'penalty': return '⚠️';
    case 'transition': return '⚡';
    default: return '📍';
  }
}

export function LiveAnalysisPanel({
  homeTeam,
  awayTeam,
  homeStats,
  awayStats,
  insights,
  keyMoments,
  matchSummary,
  possession,
  eventsCount,
}: LiveAnalysisPanelProps) {
  const hasMinimalData = eventsCount >= 1;

  return (
    <div className="space-y-4">
      {/* Header with live badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Análise em Tempo Real</h3>
        </div>
        <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary">
          <span className="relative flex h-2 w-2 mr-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          {eventsCount} evento{eventsCount !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Stats Comparison */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Estatísticas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Team headers */}
          <div className="flex justify-between text-xs font-medium text-muted-foreground mb-2">
            <span className="truncate max-w-[100px]">{homeTeam}</span>
            <span className="truncate max-w-[100px]">{awayTeam}</span>
          </div>

          {/* Possession */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-primary">{possession.home}%</span>
              <span className="text-muted-foreground">Posse</span>
              <span className="font-medium text-primary">{possession.away}%</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              <div 
                className="bg-primary transition-all duration-500"
                style={{ width: `${possession.home}%` }}
              />
              <div 
                className="bg-primary/40 transition-all duration-500"
                style={{ width: `${possession.away}%` }}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {/* Shots */}
            <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5">
              <span className="font-bold text-foreground">{homeStats.shots}</span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Target className="h-3 w-3" />
              </div>
              <span className="font-bold text-foreground">{awayStats.shots}</span>
            </div>
            {/* Saves */}
            <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5">
              <span className="font-bold text-foreground">{homeStats.saves}</span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
              </div>
              <span className="font-bold text-foreground">{awayStats.saves}</span>
            </div>
            {/* Cards */}
            <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5">
              <span className="font-bold text-foreground">{homeStats.cards}</span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
              </div>
              <span className="font-bold text-foreground">{awayStats.cards}</span>
            </div>
          </div>

          {/* Additional stats row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between bg-muted/20 rounded px-2 py-1">
              <span className="text-muted-foreground">Escanteios</span>
              <span className="font-medium">{homeStats.corners} - {awayStats.corners}</span>
            </div>
            <div className="flex items-center justify-between bg-muted/20 rounded px-2 py-1">
              <span className="text-muted-foreground">Faltas</span>
              <span className="font-medium">{homeStats.fouls} - {awayStats.fouls}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Moments */}
      {keyMoments.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Momentos-Chave
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[120px] pr-3">
              <div className="space-y-2">
                {keyMoments.map((moment, index) => (
                  <div 
                    key={index}
                    className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors animate-fade-in"
                  >
                    <span className="text-lg">{getKeyMomentIcon(moment.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 border-primary/30">
                          {moment.timestamp}
                        </Badge>
                        {moment.player && (
                          <span className="text-xs font-medium text-primary truncate">
                            {moment.player}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {moment.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {insights.slice(0, 4).map((insight, index) => (
                <li 
                  key={index}
                  className="text-xs text-muted-foreground flex items-start gap-2 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <span className="text-primary mt-0.5">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Match Summary */}
      {hasMinimalData && matchSummary && (
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-3">
            <p className="text-xs text-foreground/80 leading-relaxed">
              {matchSummary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!hasMinimalData && (
        <div className="text-center py-8 text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aguardando eventos...</p>
          <p className="text-xs mt-1">Aprove eventos para ver a análise em tempo real</p>
        </div>
      )}
    </div>
  );
}
