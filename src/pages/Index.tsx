import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { 
  Video, 
  BarChart3, 
  Zap, 
  TrendingUp,
  Activity,
  Loader2,
  Play
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { MatchCard } from '@/components/matches/MatchCard';
import { EventTimeline } from '@/components/events/EventTimeline';
import { FootballField } from '@/components/tactical/FootballField';
import { Heatmap2D } from '@/components/tactical/Heatmap2D';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import heroBg from '@/assets/hero-bg.jpg';
import arenaWordmark from '@/assets/arena-play-wordmark.png';
import { Link } from 'react-router-dom';
import { useMatchEvents } from '@/hooks/useMatchDetails';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { useEventHeatZones } from '@/hooks/useEventHeatZones';
import { apiClient } from '@/lib/apiClient';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { useDynamicMatchStats } from '@/hooks/useDynamicMatchStats';

export default function Dashboard() {
  const { 
    currentMatchId, 
    selectedMatch, 
    matches: realMatches, 
    isLoading: matchesLoading
  } = useMatchSelection();
  
  const { data: matchEvents = [] } = useMatchEvents(currentMatchId);
  
  const dynamicStats = useDynamicMatchStats(
    matchEvents,
    selectedMatch?.home_team?.name || '',
    selectedMatch?.away_team?.name || ''
  );
  
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [playingEventMinute, setPlayingEventMinute] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const { data: matchVideo } = useQuery({
    queryKey: ['match-video', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return null;
      const videos = await apiClient.getVideos(currentMatchId);
      return videos?.[0] || null;
    },
    enabled: !!currentMatchId
  });
  
  const { data: globalStats } = useQuery({
    queryKey: ['dashboard-global-stats'],
    queryFn: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      const { data: matches } = await supabase
        .from('matches')
        .select('id, status')
        .in('status', ['completed', 'analyzing', 'analyzed', 'live']);
      
      const { data: jobs } = await supabase
        .from('analysis_jobs')
        .select('id, status')
        .eq('status', 'completed');
      
      return {
        totalMatches: matches?.length || 0,
        analyzedMatches: jobs?.length || 0
      };
    }
  });
  
  const matchStats = useMemo(() => {
    const totalEvents = matchEvents.length;
    const totalGoals = matchEvents.filter(e => e.event_type === 'goal').length;
    const totalShots = matchEvents.filter(e => 
      e.event_type === 'shot' || 
      e.event_type === 'shot_on_target'
    ).length;
    const totalFouls = matchEvents.filter(e => e.event_type === 'foul').length;
    const totalCards = matchEvents.filter(e => 
      e.event_type === 'yellow_card' || 
      e.event_type === 'red_card'
    ).length;
    
    return { totalEvents, totalGoals, totalShots, totalFouls, totalCards };
  }, [matchEvents]);
  
  const { heatZones, homePlayers, awayPlayers } = useEventHeatZones(
    matchEvents,
    selectedMatch?.home_team?.name,
    selectedMatch?.away_team?.name
  );
  
  const recentEvents = matchEvents.slice(0, 5);
  
  const goalEvents = useMemo(() => {
    return matchEvents.filter(e => e.event_type === 'goal');
  }, [matchEvents]);
  
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  
  const selectedGoal = useMemo(() => {
    if (!selectedGoalId && goalEvents.length > 0) {
      return goalEvents[0];
    }
    return goalEvents.find(g => g.id === selectedGoalId) || goalEvents[0];
  }, [selectedGoalId, goalEvents]);
  
  const handleGoalChange = useCallback((goalId: string) => {
    setSelectedGoalId(goalId);
  }, []);
  
  const handlePlayVideo = (eventId: string, eventMinute: number) => {
    if (!matchVideo) {
      toast({
        title: "Vídeo não disponível",
        description: "Faça upload do vídeo da partida na página de Upload",
        variant: "destructive"
      });
      return;
    }
    setPlayingEventMinute(eventMinute);
    setVideoDialogOpen(true);
  };
  
  const getVideoStartSeconds = (eventMinute: number) => {
    if (!matchVideo) return 0;
    const videoStartMinute = matchVideo.start_minute || 0;
    const videoEndMinute = matchVideo.end_minute || (videoStartMinute + 45);
    const videoDuration = matchVideo.duration_seconds || ((videoEndMinute - videoStartMinute) * 60);
    
    const matchMinutesSpan = videoEndMinute - videoStartMinute;
    const relativePosition = (eventMinute - videoStartMinute) / matchMinutesSpan;
    const eventVideoSeconds = relativePosition * videoDuration;
    return Math.max(0, eventVideoSeconds - 5);
  };

  return (
    <AppLayout key={currentMatchId}>
      <div className="space-y-6 md:space-y-8">
        {/* Hero Section */}
        <section className="relative -mx-4 md:-mx-6 -mt-4 md:-mt-6 overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroBg})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
          <div className="relative px-4 md:px-6 py-8 md:py-16">
            <Badge variant="arena" className="mb-3 md:mb-4">
              <Zap className="mr-1 h-3 w-3" />
              Powered by AI
            </Badge>
            <img 
              src={arenaWordmark} 
              alt="Arena Play" 
              className="h-8 md:h-10 lg:h-12 object-contain"
            />
            <p className="mt-2 max-w-xl text-sm md:text-lg text-muted-foreground">
              A Inteligência Artificial que Transforma Dados em Vantagem Competitiva. 
              Análise tática automatizada e insights preditivos.
            </p>
            <div className="mt-4 md:mt-6 flex flex-col sm:flex-row gap-2 md:gap-3">
              <Button variant="arena" size="default" className="w-full sm:w-auto" asChild>
                <Link to="/upload?mode=new">
                  <Video className="mr-2 h-4 w-4 md:h-5 md:w-5" />
                  Importar Partida
                </Link>
              </Button>
              <Button variant="arena-outline" size="default" className="w-full sm:w-auto" asChild>
                <Link to="/matches">
                  Ver Análises
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Partidas Analisadas"
            value={globalStats?.analyzedMatches || 0}
            subtitle={`de ${globalStats?.totalMatches || 0} partidas`}
            icon={Video}
          />
          <StatCard
            title="Gols na Partida"
            value={matchStats.totalGoals}
            subtitle={`${matchStats.totalShots} finalizações`}
            icon={Activity}
          />
          <StatCard
            title="Eventos na Partida"
            value={matchStats.totalEvents.toLocaleString()}
            subtitle={`${matchStats.totalFouls} faltas • ${matchStats.totalCards} cartões`}
            icon={BarChart3}
          />
          <StatCard
            title="Taxa de Precisão"
            value="94%"
            subtitle="Detecção de eventos"
            icon={TrendingUp}
          />
        </section>

        {/* Main Content Grid */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          {/* Recent Matches */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl md:text-2xl font-semibold">Partidas Recentes</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/matches">Ver todas</Link>
              </Button>
            </div>
            
            {matchesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : realMatches.length > 0 ? (
              <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2">
                {realMatches.slice(0, 4).map(match => (
                  <MatchCard 
                    key={match.id} 
                    match={{
                      id: match.id,
                      homeTeam: {
                        id: match.home_team?.id || '',
                        name: match.home_team?.name || 'Time Casa',
                        shortName: match.home_team?.short_name || 'CAS',
                        logo: match.home_team?.logo_url || '',
                        primaryColor: match.home_team?.primary_color || '#10b981',
                        secondaryColor: match.home_team?.secondary_color || '#059669'
                      },
                      awayTeam: {
                        id: match.away_team?.id || '',
                        name: match.away_team?.name || 'Time Visitante',
                        shortName: match.away_team?.short_name || 'VIS',
                        logo: match.away_team?.logo_url || '',
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
                <CardContent className="flex flex-col items-center justify-center py-8 md:py-12">
                  <Video className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mb-3 md:mb-4" />
                  <h3 className="text-base md:text-lg font-semibold mb-2">Nenhuma partida importada</h3>
                  <p className="text-sm text-muted-foreground text-center mb-4">
                    Importe seu primeiro vídeo para começar a análise
                  </p>
                  <Button variant="arena" asChild>
                    <Link to="/upload?mode=new">
                      <Video className="mr-2 h-4 w-4" />
                      Importar Partida
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* 2D Tactical Visualization */}
            {realMatches.length > 0 && (
              <Card variant="glow" className="mt-6">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      Análise Tática
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      {goalEvents.length > 0 && (
                        <Select 
                          value={selectedGoalId || goalEvents[0]?.id} 
                          onValueChange={handleGoalChange}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Selecione o gol" />
                          </SelectTrigger>
                          <SelectContent>
                            {goalEvents.map((goal) => (
                              <SelectItem key={goal.id} value={goal.id}>
                                ⚽ {goal.minute}' - {goal.description?.slice(0, 20) || 'Gol'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Heatmap2D
                    homeTeamName={selectedMatch?.home_team?.name || 'Time Casa'}
                    awayTeamName={selectedMatch?.away_team?.name || 'Time Visitante'}
                    homeTeamColor={selectedMatch?.home_team?.primary_color || '#10b981'}
                    awayTeamColor={selectedMatch?.away_team?.primary_color || '#3b82f6'}
                    heatZones={heatZones}
                    homePlayers={homePlayers}
                    awayPlayers={awayPlayers}
                    height={450}
                  />
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
                    {selectedMatch && (
                      <Badge variant="arena">
                        {selectedMatch.home_team?.short_name || 'CAS'} {dynamicStats.score.home}-{dynamicStats.score.away} {selectedMatch.away_team?.short_name || 'VIS'}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <EventTimeline 
                    events={recentEvents.map(e => ({
                      id: e.id,
                      matchId: currentMatchId || '',
                      minute: e.minute || 0,
                      type: e.event_type as any,
                      description: e.description || '',
                      teamId: (e.metadata as any)?.team === 'away' 
                        ? selectedMatch?.away_team?.id || '' 
                        : selectedMatch?.home_team?.id || ''
                    }))} 
                    homeTeam={selectedMatch?.home_team ? {
                      id: selectedMatch.home_team.id,
                      name: selectedMatch.home_team.name,
                      short_name: selectedMatch.home_team.short_name,
                      primary_color: selectedMatch.home_team.primary_color
                    } : undefined}
                    awayTeam={selectedMatch?.away_team ? {
                      id: selectedMatch.away_team.id,
                      name: selectedMatch.away_team.name,
                      short_name: selectedMatch.away_team.short_name,
                      primary_color: selectedMatch.away_team.primary_color
                    } : undefined}
                    onPlayVideo={matchVideo ? handlePlayVideo : undefined}
                  />
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card variant="glass">
              <CardHeader className="pb-3">
                <CardTitle>Ações Rápidas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="arena-outline" className="w-full justify-start" asChild>
                  <Link to="/upload?mode=new">
                    <Video className="mr-2 h-4 w-4" />
                    Nova Partida
                  </Link>
                </Button>
                <Button variant="arena-outline" className="w-full justify-start" asChild>
                  <Link to="/analysis">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Ver Análises
                  </Link>
                </Button>
                <Button variant="arena-outline" className="w-full justify-start" asChild>
                  <Link to="/live">
                    <Play className="mr-2 h-4 w-4" />
                    Transmissão ao Vivo
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Video Dialog */}
      <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Visualizar Evento</DialogTitle>
          </DialogHeader>
          {matchVideo && (
            <video
              ref={videoRef}
              src={`${matchVideo.file_url}#t=${getVideoStartSeconds(playingEventMinute)}`}
              controls
              autoPlay
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
