import { 
  Video, 
  BarChart3, 
  Calendar, 
  Zap, 
  TrendingUp,
  Users,
  Activity
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { MatchCard } from '@/components/matches/MatchCard';
import { EventTimeline } from '@/components/events/EventTimeline';
import { AnalysisProgress } from '@/components/analysis/AnalysisProgress';
import { InsightCard } from '@/components/tactical/InsightCard';
import { FootballField } from '@/components/tactical/FootballField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  mockMatches, 
  mockEvents, 
  mockDashboardStats, 
  mockTacticalAnalysis,
  mockAnalysisJob,
  mockPlayerStats
} from '@/data/mockData';
import heroBg from '@/assets/hero-bg.jpg';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const recentEvents = mockEvents.slice(0, 5);
  const recentInsights = mockTacticalAnalysis.insights.slice(0, 2);

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Hero Section */}
        <section className="relative -mx-6 -mt-6 overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroBg})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
          <div className="relative px-6 py-16">
            <Badge variant="arena" className="mb-4">
              <Zap className="mr-1 h-3 w-3" />
              Powered by AI
            </Badge>
            <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
              Arena Play
            </h1>
            <p className="mt-2 max-w-xl text-lg text-muted-foreground">
              A Inteligência Artificial que Transforma Dados em Vantagem Competitiva. 
              Análise tática automatizada e insights preditivos.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="arena" size="lg" asChild>
                <Link to="/upload">
                  <Video className="mr-2 h-5 w-5" />
                  Importar Partida
                </Link>
              </Button>
              <Button variant="arena-outline" size="lg" asChild>
                <Link to="/matches">
                  Ver Análises
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Partidas Analisadas"
            value={mockDashboardStats.analyzedMatches}
            subtitle={`de ${mockDashboardStats.totalMatches} total`}
            icon={Video}
            trend={{ value: 12, isPositive: true }}
          />
          <StatCard
            title="Eventos Detectados"
            value={mockDashboardStats.totalEvents.toLocaleString()}
            subtitle="Gols, assistências, faltas..."
            icon={Activity}
            trend={{ value: 8, isPositive: true }}
          />
          <StatCard
            title="Insights Táticos"
            value={mockDashboardStats.totalInsights}
            subtitle="Padrões identificados"
            icon={BarChart3}
            trend={{ value: 23, isPositive: true }}
          />
          <StatCard
            title="Taxa de Precisão"
            value={`${mockDashboardStats.accuracyRate}%`}
            subtitle="Detecção de eventos"
            icon={TrendingUp}
          />
        </section>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Matches */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold">Partidas Recentes</h2>
              <Button variant="ghost" asChild>
                <Link to="/matches">Ver todas</Link>
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {mockMatches.slice(0, 2).map(match => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>

            {/* Analysis in Progress */}
            {mockAnalysisJob.status === 'processing' && (
              <AnalysisProgress job={mockAnalysisJob} />
            )}

            {/* Tactical Insights */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-semibold">Insights Táticos</h2>
                <Button variant="ghost" asChild>
                  <Link to="/analysis">Ver todos</Link>
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {recentInsights.map(insight => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Event Timeline */}
            <Card variant="glass">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle>Últimos Eventos</CardTitle>
                  <Badge variant="arena">BAR 2-1 RMA</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <EventTimeline events={recentEvents} />
              </CardContent>
            </Card>

            {/* Field Visualization */}
            <Card variant="tactical">
              <CardHeader className="pb-3">
                <CardTitle>Mapa de Calor</CardTitle>
              </CardHeader>
              <CardContent>
                <FootballField 
                  heatmap={mockPlayerStats[0]?.heatmap}
                  showGrid
                />
                <p className="mt-3 text-center text-sm text-muted-foreground">
                  Robert Lewandowski - Zonas de atuação
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom Section - Predictions */}
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">Previsões Táticas</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {mockTacticalAnalysis.predictions.map(prediction => (
              <Card key={prediction.id} variant="glow" className="relative overflow-hidden">
                <div 
                  className="absolute right-0 top-0 h-full w-24 opacity-10"
                  style={{
                    background: `linear-gradient(to left, hsl(var(--primary)), transparent)`
                  }}
                />
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
        </section>
      </div>
    </AppLayout>
  );
}
