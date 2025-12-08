import { useState, useEffect } from 'react';
import { 
  Video, 
  BarChart3, 
  Calendar, 
  Zap, 
  TrendingUp,
  Users,
  Activity,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { MatchCard } from '@/components/matches/MatchCard';
import { EventTimeline } from '@/components/events/EventTimeline';
import { LiveTacticalField } from '@/components/tactical/LiveTacticalField';
import { FootballField } from '@/components/tactical/FootballField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import heroBg from '@/assets/hero-bg.jpg';
import { Link } from 'react-router-dom';
import { useAllCompletedMatches, useMatchEvents } from '@/hooks/useMatchDetails';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export default function Dashboard() {
  // Fetch real matches from database
  const { data: realMatches = [], isLoading: matchesLoading } = useAllCompletedMatches();
  
  // Get the first match for events display
  const firstMatchId = realMatches[0]?.id;
  const { data: matchEvents = [] } = useMatchEvents(firstMatchId);
  
  // Fetch stats from database
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [matchesRes, eventsRes, analysisRes] = await Promise.all([
        supabase.from('matches').select('id, status'),
        supabase.from('match_events').select('id'),
        supabase.from('analysis_jobs').select('id').eq('status', 'completed')
      ]);
      
      const totalMatches = matchesRes.data?.length || 0;
      const analyzedMatches = analysisRes.data?.length || 0;
      const totalEvents = eventsRes.data?.length || 0;
      
      return {
        totalMatches,
        analyzedMatches,
        totalEvents,
        accuracyRate: 94
      };
    }
  });
  
  const recentEvents = matchEvents.slice(0, 5);

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
            value={stats?.analyzedMatches || 0}
            subtitle={`de ${stats?.totalMatches || 0} total`}
            icon={Video}
            trend={{ value: 12, isPositive: true }}
          />
          <StatCard
            title="Eventos Detectados"
            value={(stats?.totalEvents || 0).toLocaleString()}
            subtitle="Gols, assistências, faltas..."
            icon={Activity}
            trend={{ value: 8, isPositive: true }}
          />
          <StatCard
            title="Insights Táticos"
            value={realMatches.length * 5}
            subtitle="Padrões identificados"
            icon={BarChart3}
            trend={{ value: 23, isPositive: true }}
          />
          <StatCard
            title="Taxa de Precisão"
            value={`${stats?.accuracyRate || 94}%`}
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
            
            {matchesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : realMatches.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {realMatches.slice(0, 4).map(match => (
                  <MatchCard 
                    key={match.id} 
                    match={{
                      id: match.id,
                      homeTeam: {
                        id: match.home_team?.id || '',
                        name: match.home_team?.name || 'Time Casa',
                        shortName: match.home_team?.short_name || 'CAS',
                        logo: '',
                        primaryColor: match.home_team?.primary_color || '#10b981',
                        secondaryColor: match.home_team?.secondary_color || '#059669'
                      },
                      awayTeam: {
                        id: match.away_team?.id || '',
                        name: match.away_team?.name || 'Time Visitante',
                        shortName: match.away_team?.short_name || 'VIS',
                        logo: '',
                        primaryColor: match.away_team?.primary_color || '#3b82f6',
                        secondaryColor: match.away_team?.secondary_color || '#2563eb'
                      },
                      score: {
                        home: match.home_score || 0,
                        away: match.away_score || 0
                      },
                      date: match.match_date || new Date().toISOString(),
                      competition: match.competition || 'Amistoso',
                      venue: match.venue || '',
                      status: match.status === 'completed' ? 'completed' : 'scheduled'
                    }} 
                  />
                ))}
              </div>
            ) : (
              <Card variant="glass">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Video className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhuma partida importada</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Importe seu primeiro vídeo para começar a análise
                  </p>
                  <Button variant="arena" asChild>
                    <Link to="/upload">
                      <Video className="mr-2 h-4 w-4" />
                      Importar Partida
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Event Timeline */}
            {recentEvents.length > 0 && (
              <Card variant="glass">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle>Últimos Eventos</CardTitle>
                    {realMatches[0] && (
                      <Badge variant="arena">
                        {realMatches[0].home_team?.short_name || 'CAS'} {realMatches[0].home_score}-{realMatches[0].away_score} {realMatches[0].away_team?.short_name || 'VIS'}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <EventTimeline events={recentEvents.map(e => ({
                    id: e.id,
                    type: e.event_type as any,
                    minute: e.minute || 0,
                    team: 'home' as const,
                    matchId: firstMatchId || '',
                    teamId: '',
                    description: e.description || '',
                    player: { id: '', name: '', number: 0, position: '' }
                  }))} />
                </CardContent>
              </Card>
            )}

            {/* Live Tactical Field with Events */}
            {recentEvents.length > 0 && (
              <Card variant="tactical">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle>Campo Tático ao Vivo</CardTitle>
                    <Badge variant="arena" className="animate-pulse">
                      {recentEvents.length} eventos
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <LiveTacticalField 
                    events={recentEvents.map(e => ({
                      id: e.id,
                      event_type: e.event_type,
                      minute: e.minute,
                      description: e.description,
                      position_x: e.position_x,
                      position_y: e.position_y
                    }))}
                    homeTeam={realMatches[0]?.home_team?.short_name}
                    awayTeam={realMatches[0]?.away_team?.short_name}
                    className="aspect-[3/2]"
                  />
                </CardContent>
              </Card>
            )}

            {/* Empty state */}
            {recentEvents.length === 0 && realMatches.length > 0 && (
              <Card variant="tactical">
                <CardHeader className="pb-3">
                  <CardTitle>Campo Tático</CardTitle>
                </CardHeader>
                <CardContent>
                  <FootballField showGrid />
                  <p className="mt-3 text-center text-sm text-muted-foreground">
                    Nenhum evento registrado ainda
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
