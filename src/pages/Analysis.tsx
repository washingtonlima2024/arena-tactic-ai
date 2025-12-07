import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FootballField } from '@/components/tactical/FootballField';
import { InsightCard } from '@/components/tactical/InsightCard';
import { 
  BarChart3, 
  Users, 
  Target, 
  TrendingUp,
  Swords,
  Shield,
  Zap,
  Download
} from 'lucide-react';
import { 
  mockTacticalAnalysis, 
  mockTeamStats, 
  mockMatches,
  mockPlayerStats 
} from '@/data/mockData';

export default function Analysis() {
  const match = mockMatches[0];
  const homeStats = mockTeamStats[0];
  const awayStats = mockTeamStats[1];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-bold">Análise Tática</h1>
              <Badge variant="arena">{match.homeTeam.shortName} vs {match.awayTeam.shortName}</Badge>
            </div>
            <p className="text-muted-foreground">
              {match.competition} • {new Date(match.date).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <Button variant="arena-outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar Relatório
          </Button>
        </div>

        {/* Formation Overview */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card variant="tactical">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{match.homeTeam.name}</CardTitle>
                <Badge variant="arena">{mockTacticalAnalysis.formation.home}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <FootballField 
                players={[
                  { x: 5, y: 50, number: 1, team: 'home' },
                  { x: 20, y: 20, number: 4, team: 'home' },
                  { x: 20, y: 40, number: 3, team: 'home' },
                  { x: 20, y: 60, number: 15, team: 'home' },
                  { x: 20, y: 80, number: 2, team: 'home' },
                  { x: 45, y: 30, number: 8, team: 'home' },
                  { x: 45, y: 50, number: 5, team: 'home' },
                  { x: 45, y: 70, number: 17, team: 'home' },
                  { x: 70, y: 20, number: 19, team: 'home' },
                  { x: 75, y: 50, number: 9, team: 'home' },
                  { x: 70, y: 80, number: 11, team: 'home' },
                ]}
              />
            </CardContent>
          </Card>

          <Card variant="tactical">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{match.awayTeam.name}</CardTitle>
                <Badge variant="arena">{mockTacticalAnalysis.formation.away}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <FootballField 
                players={[
                  { x: 95, y: 50, number: 1, team: 'away' },
                  { x: 80, y: 20, number: 2, team: 'away' },
                  { x: 80, y: 40, number: 4, team: 'away' },
                  { x: 80, y: 60, number: 5, team: 'away' },
                  { x: 80, y: 80, number: 23, team: 'away' },
                  { x: 60, y: 25, number: 8, team: 'away' },
                  { x: 60, y: 50, number: 10, team: 'away' },
                  { x: 60, y: 75, number: 15, team: 'away' },
                  { x: 35, y: 30, number: 11, team: 'away' },
                  { x: 30, y: 50, number: 9, team: 'away' },
                  { x: 35, y: 70, number: 7, team: 'away' },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        {/* Stats Comparison */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Comparativo de Estatísticas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'Posse de Bola', home: homeStats.possession, away: awayStats.possession, suffix: '%' },
                { label: 'Finalizações', home: homeStats.shots, away: awayStats.shots },
                { label: 'Finalizações no Gol', home: homeStats.shotsOnTarget, away: awayStats.shotsOnTarget },
                { label: 'Precisão de Passes', home: homeStats.passAccuracy, away: awayStats.passAccuracy, suffix: '%' },
                { label: 'xG (Gols Esperados)', home: homeStats.expectedGoals, away: awayStats.expectedGoals, decimal: true },
                { label: 'Escanteios', home: homeStats.corners, away: awayStats.corners },
                { label: 'Eventos de Pressão', home: homeStats.pressureEvents, away: awayStats.pressureEvents },
              ].map((stat, index) => (
                <div key={index} className="grid grid-cols-[1fr,2fr,1fr] items-center gap-4">
                  <div className="text-right">
                    <span className="text-lg font-bold">
                      {stat.decimal ? stat.home.toFixed(2) : stat.home}{stat.suffix || ''}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                      <div 
                        className="bg-gradient-arena transition-all"
                        style={{ width: `${(stat.home / (stat.home + stat.away)) * 100}%` }}
                      />
                    </div>
                    <p className="text-center text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                  <div className="text-left">
                    <span className="text-lg font-bold">
                      {stat.decimal ? stat.away.toFixed(2) : stat.away}{stat.suffix || ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tactical Patterns */}
        <Tabs defaultValue="insights" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="patterns">Padrões</TabsTrigger>
            <TabsTrigger value="predictions">Previsões</TabsTrigger>
            <TabsTrigger value="heatmaps">Mapas de Calor</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mockTacticalAnalysis.insights.map(insight => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="patterns" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mockTacticalAnalysis.patterns.map(pattern => (
                <Card key={pattern.id} variant="glow">
                  <CardContent className="pt-6">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        {pattern.type === 'pressing' ? <Zap className="h-5 w-5 text-primary" /> :
                         pattern.type === 'buildup' ? <Swords className="h-5 w-5 text-primary" /> :
                         <Shield className="h-5 w-5 text-primary" />}
                      </div>
                      <div>
                        <Badge variant="outline" className="capitalize">{pattern.type.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                    <p className="text-sm">{pattern.description}</p>
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {pattern.occurrences} ocorrências
                      </span>
                      <span className="font-medium text-primary">
                        {Math.round(pattern.effectiveness * 100)}% eficácia
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="predictions" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mockTacticalAnalysis.predictions.map(prediction => (
                <Card key={prediction.id} variant="glow">
                  <CardContent className="pt-6">
                    <div className="mb-3 flex items-center justify-between">
                      <Badge 
                        variant={
                          prediction.impact === 'high' ? 'destructive' : 
                          prediction.impact === 'medium' ? 'warning' : 'secondary'
                        }
                      >
                        {prediction.impact === 'high' ? 'Alto Impacto' : 
                         prediction.impact === 'medium' ? 'Médio Impacto' : 'Baixo Impacto'}
                      </Badge>
                      <span className="text-3xl font-bold text-primary">
                        {Math.round(prediction.probability * 100)}%
                      </span>
                    </div>
                    <h3 className="font-medium">{prediction.scenario}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {prediction.recommendation}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="heatmaps" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card variant="tactical">
                <CardHeader>
                  <CardTitle>Lewandowski - Zonas de Atuação</CardTitle>
                </CardHeader>
                <CardContent>
                  <FootballField 
                    heatmap={mockPlayerStats[0]?.heatmap}
                    showGrid
                  />
                </CardContent>
              </Card>
              <Card variant="tactical">
                <CardHeader>
                  <CardTitle>Time da Casa - Ocupação de Espaço</CardTitle>
                </CardHeader>
                <CardContent>
                  <FootballField 
                    heatmap={{
                      zones: [
                        { x: 50, y: 50, intensity: 0.7 },
                        { x: 70, y: 40, intensity: 0.9 },
                        { x: 70, y: 60, intensity: 0.85 },
                        { x: 30, y: 50, intensity: 0.5 },
                        { x: 85, y: 50, intensity: 0.6 },
                      ]
                    }}
                    showGrid
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
