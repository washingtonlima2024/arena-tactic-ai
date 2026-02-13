import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Swords, Shield, Award, Star, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

interface MatchAnalyticsSectionProps {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamColor: string;
  awayTeamColor: string;
  dynamicStats: any;
  eventAnalysis: any;
  tacticalAnalysis?: any;
}

export function MatchAnalyticsSection({
  homeTeamName, awayTeamName, homeTeamColor, awayTeamColor,
  dynamicStats, eventAnalysis, tacticalAnalysis
}: MatchAnalyticsSectionProps) {
  // Stats comparison data
  const comparisonData = [
    { name: 'Gols', home: dynamicStats.goals.home, away: dynamicStats.goals.away },
    { name: 'Chutes', home: dynamicStats.shots.home, away: dynamicStats.shots.away },
    { name: 'Faltas', home: dynamicStats.fouls.home, away: dynamicStats.fouls.away },
    { name: 'Escanteios', home: dynamicStats.corners.home, away: dynamicStats.corners.away },
    { name: 'Cartões', home: dynamicStats.cards.home, away: dynamicStats.cards.away },
    { name: 'Defesas', home: dynamicStats.saves.home, away: dynamicStats.saves.away },
  ];

  const possessionData = [
    { name: homeTeamName, value: eventAnalysis.possession.home, color: homeTeamColor },
    { name: awayTeamName, value: eventAnalysis.possession.away, color: awayTeamColor },
  ];

  return (
    <div className="space-y-6">
      {/* Tactical Analysis Tabs */}
      <Card className="border-primary/20">
        <Tabs defaultValue="summary">
          <CardHeader className="pb-0">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="summary" className="text-xs">Resumo</TabsTrigger>
              <TabsTrigger value="home" className="text-xs">{homeTeamName.slice(0, 10)}</TabsTrigger>
              <TabsTrigger value="away" className="text-xs">{awayTeamName.slice(0, 10)}</TabsTrigger>
              <TabsTrigger value="mvp" className="text-xs">Destaque</TabsTrigger>
            </TabsList>
          </CardHeader>

          <TabsContent value="summary" className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><BarChart3 className="h-5 w-5 text-primary" /></div>
              <div>
                <h3 className="font-bold text-lg mb-2">Resumo da Partida</h3>
                <p className="text-base text-muted-foreground leading-relaxed">{eventAnalysis.matchSummary}</p>
                {eventAnalysis.tacticalOverview && (
                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{eventAnalysis.tacticalOverview}</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="home" className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${homeTeamColor}20` }}>
                <Swords className="h-5 w-5" style={{ color: homeTeamColor }} />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">{homeTeamName}</h3>
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Gols', val: dynamicStats.goals.home },
                    { label: 'Chutes', val: dynamicStats.shots.home },
                    { label: 'Faltas', val: dynamicStats.fouls.home },
                    { label: 'Escanteios', val: dynamicStats.corners.home },
                  ].map(s => (
                    <div key={s.label} className="text-center p-2 rounded-lg bg-muted/50">
                      <div className="text-xl font-bold" style={{ color: homeTeamColor }}>{s.val}</div>
                      <div className="text-[10px] text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="away" className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${awayTeamColor}20` }}>
                <Shield className="h-5 w-5" style={{ color: awayTeamColor }} />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">{awayTeamName}</h3>
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Gols', val: dynamicStats.goals.away },
                    { label: 'Chutes', val: dynamicStats.shots.away },
                    { label: 'Faltas', val: dynamicStats.fouls.away },
                    { label: 'Escanteios', val: dynamicStats.corners.away },
                  ].map(s => (
                    <div key={s.label} className="text-center p-2 rounded-lg bg-muted/50">
                      <div className="text-xl font-bold" style={{ color: awayTeamColor }}>{s.val}</div>
                      <div className="text-[10px] text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="mvp" className="p-5">
            {eventAnalysis.bestPlayer ? (
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <Award className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                    {eventAnalysis.bestPlayer.name}
                    <Badge variant="outline" className="text-xs">
                      {eventAnalysis.bestPlayer.team === 'home' ? homeTeamName : awayTeamName}
                    </Badge>
                  </h3>
                  <div className="flex gap-0.5 mb-2">
                    {[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 fill-yellow-500 text-yellow-500" />)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {eventAnalysis.bestPlayer.goals} gol(s), {eventAnalysis.bestPlayer.assists} assist(s), {eventAnalysis.bestPlayer.totalActions} ações
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Dados insuficientes para determinar destaque.</p>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Comparison bar chart */}
        <Card className="border-primary/20 p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Comparativo por Equipe</span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Bar dataKey="home" name={homeTeamName} fill={homeTeamColor} radius={[4, 4, 0, 0]} />
              <Bar dataKey="away" name={awayTeamName} fill={awayTeamColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Possession pie */}
        <Card className="border-primary/20 p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Posse de Bola Estimada</span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={possessionData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value"
                label={({ name, value }) => `${value}%`}>
                {possessionData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Gols', home: dynamicStats.goals.home, away: dynamicStats.goals.away, color: 'text-emerald-400' },
          { label: 'Chutes', home: dynamicStats.shots.home, away: dynamicStats.shots.away, color: 'text-pink-400' },
          { label: 'Faltas', home: dynamicStats.fouls.home, away: dynamicStats.fouls.away, color: 'text-orange-400' },
          { label: 'Escanteios', home: dynamicStats.corners.home, away: dynamicStats.corners.away, color: 'text-cyan-400' },
          { label: 'Cartões', home: dynamicStats.cards.home, away: dynamicStats.cards.away, color: 'text-yellow-400' },
          { label: 'Defesas', home: dynamicStats.saves.home, away: dynamicStats.saves.away, color: 'text-blue-400' },
        ].map((stat) => (
          <Card key={stat.label} className="p-3 text-center border-primary/10">
            <div className="flex items-center justify-center gap-3 mb-1">
              <span className="text-lg font-bold" style={{ color: homeTeamColor }}>{stat.home}</span>
              <span className="text-xs text-muted-foreground">×</span>
              <span className="text-lg font-bold" style={{ color: awayTeamColor }}>{stat.away}</span>
            </div>
            <div className="text-[11px] text-muted-foreground font-medium">{stat.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
