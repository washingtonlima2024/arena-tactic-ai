import { useState, useRef } from 'react';
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
import { LiveTacticalField } from '@/components/tactical/LiveTacticalField';
import { FootballField } from '@/components/tactical/FootballField';
import { Heatmap3D } from '@/components/tactical/Heatmap3D';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import heroBg from '@/assets/hero-bg.jpg';
import arenaWordmark from '@/assets/arena-play-wordmark.png';
import { Link } from 'react-router-dom';
import { useAllCompletedMatches, useMatchEvents } from '@/hooks/useMatchDetails';
import { useEventHeatZones } from '@/hooks/useEventHeatZones';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

export default function Dashboard() {
  // Fetch real matches from database
  const { data: realMatches = [], isLoading: matchesLoading } = useAllCompletedMatches();
  
  // Get the first match for events display
  const firstMatchId = realMatches[0]?.id;
  const { data: matchEvents = [] } = useMatchEvents(firstMatchId);
  
  // Video player state
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [playingEventMinute, setPlayingEventMinute] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Fetch video for the first match
  const { data: matchVideo } = useQuery({
    queryKey: ['match-video', firstMatchId],
    queryFn: async () => {
      if (!firstMatchId) return null;
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('match_id', firstMatchId)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!firstMatchId
  });
  
  // Fetch stats from database
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [matchesRes, eventsRes, analysisRes] = await Promise.all([
        supabase.from('matches').select('id, status'),
        supabase.from('match_events').select('id, event_type'),
        supabase.from('analysis_jobs').select('id').eq('status', 'completed')
      ]);
      
      const totalMatches = matchesRes.data?.length || 0;
      const analyzedMatches = analysisRes.data?.length || 0;
      const totalEvents = eventsRes.data?.length || 0;
      const totalGoals = eventsRes.data?.filter(e => e.event_type === 'goal').length || 0;
      const totalShots = eventsRes.data?.filter(e => 
        e.event_type === 'shot' || 
        e.event_type === 'shot_on_target' || 
        e.event_type === 'Finalização'
      ).length || 0;
      
      return {
        totalMatches,
        analyzedMatches,
        totalEvents,
        totalGoals,
        totalShots,
        accuracyRate: 94
      };
    }
  });
  
  // Generate heat zones from real events
  const eventHeatZones = useEventHeatZones(
    matchEvents,
    realMatches[0]?.home_team?.name,
    realMatches[0]?.away_team?.name
  );
  
  const recentEvents = matchEvents.slice(0, 5);
  
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
  
  // Calculate video start seconds
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
            <img 
              src={arenaWordmark} 
              alt="Arena Play" 
              className="h-10 md:h-12 object-contain"
            />
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
            title="Gols Registrados"
            value={stats?.totalGoals || 0}
            subtitle={`${stats?.totalShots || 0} finalizações`}
            icon={Activity}
            trend={{ value: 8, isPositive: true }}
          />
          <StatCard
            title="Eventos Detectados"
            value={(stats?.totalEvents || 0).toLocaleString()}
            subtitle="Faltas, cartões, escanteios..."
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

            {/* 3D Visualization */}
            {realMatches.length > 0 && (
              <Card variant="glow" className="mt-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      Mapa de Calor 3D
                    </CardTitle>
                    <Badge variant="arena">Visualização Interativa</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Heatmap3D
                    homeTeam={realMatches[0]?.home_team?.name || 'Time Casa'}
                    awayTeam={realMatches[0]?.away_team?.name || 'Time Visitante'}
                    homeColor={realMatches[0]?.home_team?.primary_color || '#10b981'}
                    awayColor={realMatches[0]?.away_team?.primary_color || '#3b82f6'}
                    height={900}
                    eventHeatZones={eventHeatZones}
                  />
                  <p className="mt-3 text-center text-sm text-muted-foreground">
                    Arraste para rotacionar • Scroll para zoom
                  </p>
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
                  <EventTimeline 
                    events={recentEvents.map(e => ({
                      id: e.id,
                      type: e.event_type as any,
                      minute: e.minute || 0,
                      team: 'home' as const,
                      matchId: firstMatchId || '',
                      teamId: '',
                      description: e.description || '',
                      player: { id: '', name: '', number: 0, position: '' }
                    }))} 
                    hasVideo={!!matchVideo}
                    onPlayVideo={handlePlayVideo}
                  />
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

        {/* Video Player Dialog */}
        <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <Play className="h-5 w-5 text-primary" />
                <span>Evento - {playingEventMinute}'</span>
                <Badge variant="arena">5s antes</Badge>
              </DialogTitle>
            </DialogHeader>
            {matchVideo && (() => {
              const startSeconds = getVideoStartSeconds(playingEventMinute);
              const isEmbed = matchVideo.file_url.includes('/embed/') || matchVideo.file_url.includes('iframe') || matchVideo.file_url.includes('xtream');
              const separator = matchVideo.file_url.includes('?') ? '&' : '?';
              const embedUrl = `${matchVideo.file_url}${separator}t=${Math.round(startSeconds)}&autoplay=1`;
              
              return (
                <div className="space-y-4">
                  <div className="aspect-video relative">
                    {isEmbed ? (
                      <iframe
                        src={embedUrl}
                        className="absolute inset-0 w-full h-full rounded-lg"
                        frameBorder="0"
                        allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
                        title={`Evento ${playingEventMinute}'`}
                      />
                    ) : (
                      <video
                        ref={videoRef}
                        src={matchVideo.file_url}
                        controls
                        autoPlay
                        className="w-full h-full rounded-lg"
                        onLoadedMetadata={(e) => {
                          const video = e.currentTarget;
                          video.currentTime = startSeconds;
                        }}
                      />
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="gap-1">
                        <Play className="h-3 w-3" />
                        {playingEventMinute}'
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {realMatches[0]?.home_team?.name} vs {realMatches[0]?.away_team?.name}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/analysis?match=${firstMatchId}`}>
                        Ver Análise Completa
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

      </div>
    </AppLayout>
  );
}
