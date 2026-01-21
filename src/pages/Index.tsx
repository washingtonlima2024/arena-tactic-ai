import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { 
  Video, 
  BarChart3, 
  Zap, 
  TrendingUp,
  Activity,
  Loader2,
  Play,
  Scan
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { MatchCard } from '@/components/matches/MatchCard';
import { EventTimeline } from '@/components/events/EventTimeline';
import { LiveTacticalField } from '@/components/tactical/LiveTacticalField';
import { FootballField } from '@/components/tactical/FootballField';
import { TacticalField3D } from '@/components/tactical/TacticalField3D';
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
import { useGoalDetection } from '@/hooks/useGoalDetection';
import { useGoalPlayAnalysis } from '@/hooks/useGoalPlayAnalysis';
import { apiClient } from '@/lib/apiClient';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { useDynamicMatchStats } from '@/hooks/useDynamicMatchStats';

export default function Dashboard() {
  // Use centralized match selection hook
  const { 
    currentMatchId, 
    selectedMatch, 
    matches: realMatches, 
    isLoading: matchesLoading
  } = useMatchSelection();
  
  // Get events for the selected match
  const { data: matchEvents = [] } = useMatchEvents(currentMatchId);
  
  // Dynamic stats calculated from events
  const dynamicStats = useDynamicMatchStats(
    matchEvents,
    selectedMatch?.home_team?.name || '',
    selectedMatch?.away_team?.name || ''
  );
  
  // Video player state
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [playingEventMinute, setPlayingEventMinute] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Fetch video for the selected match
  const { data: matchVideo } = useQuery({
    queryKey: ['match-video', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return null;
      const videos = await apiClient.getVideos(currentMatchId);
      return videos?.[0] || null;
    },
    enabled: !!currentMatchId
  });
  
  // Fetch global stats from Cloud (Supabase) for consistency
  const { data: globalStats } = useQuery({
    queryKey: ['dashboard-global-stats'],
    queryFn: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Get all matches with completed/analyzing status
      const { data: matches } = await supabase
        .from('matches')
        .select('id, status')
        .in('status', ['completed', 'analyzing', 'analyzed', 'live']);
      
      // Get completed analysis jobs
      const { data: jobs } = await supabase
        .from('analysis_jobs')
        .select('id, status')
        .eq('status', 'completed');
      
      const totalMatches = matches?.length || 0;
      const analyzedMatches = jobs?.length || 0;
      
      return {
        totalMatches,
        analyzedMatches
      };
    }
  });
  
  // Calculate match-specific stats from matchEvents (already fetched above)
  const matchStats = useMemo(() => {
    const totalEvents = matchEvents.length;
    const totalGoals = matchEvents.filter(e => e.event_type === 'goal').length;
    const totalShots = matchEvents.filter(e => 
      e.event_type === 'shot' || 
      e.event_type === 'shot_on_target' || 
      e.event_type === 'Finalização'
    ).length;
    const totalFouls = matchEvents.filter(e => e.event_type === 'foul').length;
    const totalCards = matchEvents.filter(e => 
      e.event_type === 'yellow_card' || 
      e.event_type === 'red_card'
    ).length;
    
    return {
      totalEvents,
      totalGoals,
      totalShots,
      totalFouls,
      totalCards
    };
  }, [matchEvents]);
  
  // Generate heat zones and players from real events
  const { heatZones, homePlayers, awayPlayers } = useEventHeatZones(
    matchEvents,
    selectedMatch?.home_team?.name,
    selectedMatch?.away_team?.name
  );
  
  const recentEvents = matchEvents.slice(0, 5);
  
  // Filter goal events for animation
  const goalEvents = useMemo(() => {
    return matchEvents.filter(e => e.event_type === 'goal');
  }, [matchEvents]);
  
  // Selected goal for animation
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  
  // AI-powered goal play analysis
  const { 
    analyzeGoal, 
    isAnalyzing, 
    frames: aiFrames, 
    analysis: goalAnalysis,
    error: analysisError 
  } = useGoalPlayAnalysis();
  
  // YOLO detection state
  const detectionVideoRef = useRef<HTMLVideoElement>(null);
  const [yoloFrames, setYoloFrames] = useState<any[]>([]);
  const [useYoloDetection, setUseYoloDetection] = useState(false);
  
  const { 
    processGoalAnimation, 
    isProcessing: isDetecting, 
    progress: detectionProgress 
  } = useGoalDetection({
    framesPerSecond: 5,
    durationSeconds: 6,
    homeColor: selectedMatch?.home_team?.primary_color,
    awayColor: selectedMatch?.away_team?.primary_color
  });
  
  // Generate animation frames for selected goal
  const selectedGoal = useMemo(() => {
    if (!selectedGoalId && goalEvents.length > 0) {
      return goalEvents[0];
    }
    return goalEvents.find(g => g.id === selectedGoalId) || goalEvents[0];
  }, [selectedGoalId, goalEvents]);
  
  // Automatically analyze goal when selected
  useEffect(() => {
    if (selectedGoal && !useYoloDetection) {
      // Build context narration from surrounding events
      const goalMinute = selectedGoal.minute || 0;
      const contextEvents = matchEvents.filter(e => 
        e.minute !== null && 
        e.minute >= goalMinute - 3 && 
        e.minute <= goalMinute + 1
      );
      const contextNarration = contextEvents
        .map(e => e.description)
        .filter(Boolean)
        .join('. ');
      
      analyzeGoal(
        selectedGoal.description || '',
        selectedMatch?.home_team?.name,
        selectedMatch?.away_team?.name,
        selectedGoal.minute || undefined,
        contextNarration
      );
    }
  }, [selectedGoal?.id, matchEvents, selectedMatch, useYoloDetection]);
  
  // Calculate video timestamp for goal
  const getGoalVideoTimestamp = useCallback((goalMinute: number) => {
    if (!matchVideo) return 0;
    const videoStartMinute = matchVideo.start_minute || 0;
    const videoEndMinute = matchVideo.end_minute || (videoStartMinute + 45);
    const videoDuration = matchVideo.duration_seconds || ((videoEndMinute - videoStartMinute) * 60);
    const matchMinutesSpan = videoEndMinute - videoStartMinute;
    const relativePosition = (goalMinute - videoStartMinute) / matchMinutesSpan;
    return relativePosition * videoDuration;
  }, [matchVideo]);
  
  // Run YOLO detection on goal video
  const handleRunYoloDetection = useCallback(async () => {
    if (!detectionVideoRef.current || !selectedGoal) return;
    
    const goalTimeSeconds = getGoalVideoTimestamp(selectedGoal.minute || 0);
    
    toast({
      title: "Iniciando detecção YOLO",
      description: `Analisando frames do gol aos ${selectedGoal.minute}'...`
    });
    
    const frames = await processGoalAnimation(detectionVideoRef.current, goalTimeSeconds);
    
    if (frames.length > 0) {
      setYoloFrames(frames);
      setUseYoloDetection(true);
      toast({
        title: "Detecção concluída!",
        description: `${frames.length} frames processados com posições reais dos jogadores.`
      });
    }
  }, [selectedGoal, getGoalVideoTimestamp, processGoalAnimation]);
  
  // Use YOLO frames if available, then AI frames, otherwise empty
  const goalAnimationFrames = useMemo(() => {
    if (useYoloDetection && yoloFrames.length > 0) {
      return yoloFrames;
    }
    
    if (aiFrames.length > 0) {
      return aiFrames;
    }
    
    return [];
  }, [useYoloDetection, yoloFrames, aiFrames]);
  
  // Reset YOLO frames when goal changes
  const handleGoalChange = useCallback((goalId: string) => {
    setSelectedGoalId(goalId);
    setYoloFrames([]);
    setUseYoloDetection(false);
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
    <AppLayout key={currentMatchId}>
      <div className="space-y-6 md:space-y-8">
        {/* Hero Section - responsive */}
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
                <Link to="/upload">
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

        {/* Stats Grid - responsive */}
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

        {/* Main Content Grid - responsive */}
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
                    <Link to="/upload">
                      <Video className="mr-2 h-4 w-4" />
                      Importar Partida
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Unified 3D Tactical Visualization */}
            {realMatches.length > 0 && (
              <Card variant="glow" className="mt-6">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      Análise Tática 3D
                      {useYoloDetection && (
                        <Badge variant="outline" className="ml-2 text-xs border-green-500 text-green-500">
                          <Scan className="h-3 w-3 mr-1" />
                          YOLO
                        </Badge>
                      )}
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
                      
                      {/* YOLO Detection Button */}
                      {matchVideo && !matchVideo.file_url.includes('/embed/') && goalEvents.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRunYoloDetection}
                          disabled={isDetecting}
                          className="gap-1"
                        >
                          {isDetecting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Scan className="h-4 w-4" />
                          )}
                          {isDetecting ? 'Detectando...' : 'Detectar Jogadores'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Hidden video element for frame extraction */}
                  {matchVideo && !matchVideo.file_url.includes('/embed/') && (
                    <video
                      ref={detectionVideoRef}
                      src={matchVideo.file_url}
                      className="hidden"
                      crossOrigin="anonymous"
                      preload="auto"
                    />
                  )}
                  
                  <TacticalField3D
                    homeTeamName={selectedMatch?.home_team?.name || 'Time Casa'}
                    awayTeamName={selectedMatch?.away_team?.name || 'Time Visitante'}
                    homeTeamColor={selectedMatch?.home_team?.primary_color || '#10b981'}
                    awayTeamColor={selectedMatch?.away_team?.primary_color || '#3b82f6'}
                    defaultMode={goalEvents.length > 0 ? 'animation' : 'heatmap'}
                    heatZones={heatZones}
                    homePlayers={homePlayers}
                    awayPlayers={awayPlayers}
                    animationFrames={goalAnimationFrames}
                    selectedGoal={selectedGoal ? {
                      id: selectedGoal.id,
                      minute: selectedGoal.minute || 0,
                      description: selectedGoal.description || undefined,
                      team: (selectedGoal.metadata as any)?.team === 'away' ? 'away' : 'home',
                      metadata: selectedGoal.metadata as any
                    } : null}
                    matchId={currentMatchId || undefined}
                    height={650}
                    isLoading={isDetecting}
                    detectionProgress={detectionProgress}
                  />
                  
                  {/* Detection info */}
                  {useYoloDetection && yoloFrames.length > 0 && (
                    <div className="mt-3 flex items-center justify-center gap-4 text-sm">
                      <Badge variant="secondary" className="gap-1">
                        <Scan className="h-3 w-3" />
                        {yoloFrames.length} frames detectados
                      </Badge>
                      <span className="text-muted-foreground">
                        Posições reais dos jogadores via análise de vídeo
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setUseYoloDetection(false);
                          setYoloFrames([]);
                        }}
                      >
                        Usar animação simulada
                      </Button>
                    </div>
                  )}
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
                      type: e.event_type as any,
                      minute: e.minute || 0,
                      team: 'home' as const,
                      matchId: currentMatchId || '',
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
                    homeTeam={selectedMatch?.home_team?.short_name}
                    awayTeam={selectedMatch?.away_team?.short_name}
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
                        {selectedMatch?.home_team?.name} vs {selectedMatch?.away_team?.name}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/analysis?match=${currentMatchId}`}>
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
