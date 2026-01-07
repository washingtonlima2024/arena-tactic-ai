import { useState, useRef, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FootballField } from '@/components/tactical/FootballField';
import { AnimatedTacticalPlay } from '@/components/tactical/AnimatedTacticalPlay';
import { Heatmap3D } from '@/components/tactical/Heatmap3D';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  BarChart3, 
  Users, 
  Target, 
  TrendingUp,
  Swords,
  Shield,
  Zap,
  Download,
  Loader2,
  Video,
  Play,
  Image,
  FileText,
  Volume2,
  Star,
  Clock,
  User,
  Trash2,
  Radio,
  Scissors,
  Film,
  ExternalLink,
  Share2,
  StopCircle,
  Copy,
  Twitter
} from 'lucide-react';
import { useMatchAnalysis, useMatchEvents, ExtendedTacticalAnalysis } from '@/hooks/useMatchDetails';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { useThumbnailGeneration } from '@/hooks/useThumbnailGeneration';
import { useEventBasedAnalysis } from '@/hooks/useEventBasedAnalysis';
import { useEventHeatZones } from '@/hooks/useEventHeatZones';
import { useClipGeneration } from '@/hooks/useClipGeneration';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { ReimportMatchDialog } from '@/components/events/ReimportMatchDialog';
import { useLiveBroadcastContext } from '@/contexts/LiveBroadcastContext';

export default function Analysis() {
  const queryClient = useQueryClient();
  
  // Live broadcast context for realtime updates
  const { isRecording, currentMatchId: liveMatchId } = useLiveBroadcastContext();
  
  // Centralized match selection
  const { currentMatchId, selectedMatch, matches, isLoading: matchesLoading, setSelectedMatch } = useMatchSelection();
  
  const [selectedEventForPlay, setSelectedEventForPlay] = useState<string | null>(null);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [playingEventId, setPlayingEventId] = useState<string | null>(null);
  const [reimportDialogOpen, setReimportDialogOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: analysis, isLoading: analysisLoading } = useMatchAnalysis(currentMatchId);
  const { data: events = [], refetch: refetchEvents } = useMatchEvents(currentMatchId);
  const { thumbnails, getThumbnail } = useThumbnailGeneration(currentMatchId || undefined);
  
  // Clip generation
  const { 
    isGenerating: isGeneratingClips, 
    progress: clipProgress, 
    generateAllClips, 
    cancel: cancelClipGeneration 
  } = useClipGeneration();

  // Check if this is a live match
  const isLiveMatch = selectedMatch?.status === 'live' || (isRecording && liveMatchId === currentMatchId);

  // Polling every 10 seconds for live matches
  useEffect(() => {
    if (!currentMatchId || !isLiveMatch) return;
    
    console.log('Starting live match polling for:', currentMatchId);
    
    const pollInterval = setInterval(() => {
      console.log('Polling live match events...');
      refetchEvents();
      queryClient.invalidateQueries({ queryKey: ['match-video', currentMatchId] });
    }, 10000);

    return () => {
      console.log('Stopping live match polling');
      clearInterval(pollInterval);
    };
  }, [currentMatchId, isLiveMatch, refetchEvents, queryClient]);

  // Real-time subscription for live match analysis updates
  useEffect(() => {
    if (!currentMatchId) return;
    
    const channel = supabase
      .channel(`analysis-realtime-${currentMatchId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'match_events',
        filter: `match_id=eq.${currentMatchId}`
      }, (payload) => {
        console.log('Analysis: Event change received:', payload);
        // Refetch events to update analysis
        refetchEvents();
        queryClient.invalidateQueries({ queryKey: ['match-events', currentMatchId] });
        
        if (isLiveMatch && payload.eventType === 'INSERT') {
          toast({
            title: "Análise atualizada",
            description: "Novo evento adicionado à análise tática",
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentMatchId, refetchEvents, queryClient, isLiveMatch]);

  // Fetch video for the match
  const { data: matchVideo } = useQuery({
    queryKey: ['match-video', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return null;
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('match_id', currentMatchId)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!currentMatchId
  });

  // Fetch generated audio for the match
  const { data: generatedAudio } = useQuery({
    queryKey: ['generated-audio', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return [];
      const { data, error } = await supabase
        .from('generated_audio')
        .select('*')
        .eq('match_id', currentMatchId)
        .order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!currentMatchId
  });

  // Generate analysis from real events
  const eventAnalysis = useEventBasedAnalysis(
    events,
    selectedMatch?.home_team,
    selectedMatch?.away_team
  );

  // Use event-based analysis as primary, fallback to stored tactical analysis
  const tacticalAnalysis = analysis?.tacticalAnalysis as ExtendedTacticalAnalysis | null;

  // Generate real heat zones based on events using the hook
  const eventHeatZones = useEventHeatZones(
    events,
    selectedMatch?.home_team?.name,
    selectedMatch?.away_team?.name
  );

  // Get important events (goals, shots, key moments, tactical events)
  const importantEvents = events.filter(e => 
    ['goal', 'shot', 'shot_on_target', 'penalty', 'corner', 'foul', 'free_kick', 'cross', 
     'save', 'offside', 'yellow_card', 'red_card', 'high_press', 'transition', 'ball_recovery'].includes(e.event_type)
  ).slice(0, 10);

  const handlePlayVideo = (eventId: string) => {
    if (matchVideo) {
      setPlayingEventId(eventId);
      setVideoDialogOpen(true);
    } else {
      toast({
        title: "Vídeo não disponível",
        description: "Faça upload do vídeo da partida na página de Upload para visualizar os cortes.",
        variant: "destructive"
      });
    }
  };

  // Get event time from metadata.eventMs (milliseconds) as primary source
  const getEventTime = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return { minute: 0, second: 0, totalSeconds: 0, totalMs: 0 };
    
    const metadata = event.metadata as { eventMs?: number; videoSecond?: number } | null;
    
    // Priority: eventMs (ms) > videoSecond (s) > minute+second
    let totalMs: number;
    if (metadata?.eventMs !== undefined) {
      totalMs = metadata.eventMs;
    } else if (metadata?.videoSecond !== undefined) {
      totalMs = metadata.videoSecond * 1000;
    } else {
      totalMs = ((event.minute || 0) * 60 + (event.second || 0)) * 1000;
    }
    
    const totalSeconds = Math.floor(totalMs / 1000);
    return { 
      minute: Math.floor(totalSeconds / 60), 
      second: totalSeconds % 60, 
      totalSeconds,
      totalMs
    };
  };
  
  // Format timestamp helper
  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Clip generation helpers
  const eventsWithClips = events.filter(e => e.clip_url).length;
  const eventsWithoutClips = events.filter(e => !e.clip_url).length;
  const canGenerateClips = matchVideo && !matchVideo.file_url.includes('embed') && eventsWithoutClips > 0;

  const handleGenerateClips = async (mode: 'highlights' | 'all', limit: number = 20) => {
    if (!currentMatchId || !matchVideo) {
      toast({
        title: "Erro",
        description: "Nenhum vídeo disponível para esta partida",
        variant: "destructive"
      });
      return;
    }

    if (matchVideo.file_url.includes('embed') || matchVideo.file_url.includes('xtream.tech')) {
      toast({
        title: "Erro",
        description: "Extração de clips só funciona com vídeos MP4 diretos, não com embeds",
        variant: "destructive"
      });
      return;
    }

    let eventsToProcess: typeof events;
    
    if (mode === 'highlights') {
      const priorityTypes = ['goal', 'red_card', 'penalty', 'yellow_card'];
      eventsToProcess = events
        .filter(e => priorityTypes.includes(e.event_type) && !e.clip_url)
        .sort((a, b) => {
          const priorityA = priorityTypes.indexOf(a.event_type);
          const priorityB = priorityTypes.indexOf(b.event_type);
          return priorityA - priorityB;
        });
    } else {
      eventsToProcess = events.filter(e => !e.clip_url);
    }

    if (eventsToProcess.length === 0) {
      toast({
        title: "Info",
        description: "Todos os eventos já possuem clips extraídos"
      });
      return;
    }

    const clipsCount = Math.min(eventsToProcess.length, limit);
    toast({
      title: "Gerando clips",
      description: `Iniciando extração de ${clipsCount} clips...`
    });

    const videoStartMinute = matchVideo.start_minute ?? 0;

    await generateAllClips(
      eventsToProcess.slice(0, limit),
      matchVideo.file_url,
      currentMatchId,
      {
        limit,
        videoStartMinute,
        videoDurationSeconds: matchVideo.duration_seconds ?? undefined
      }
    );

    refetchEvents();
    toast({
      title: "Concluído",
      description: "Extração de clips concluída!"
    });
  };

  const handleCopyClipLink = (clipUrl: string) => {
    navigator.clipboard.writeText(clipUrl);
    toast({ title: "Link copiado!" });
  };

  const handleShareTwitter = (clipUrl: string, eventType: string) => {
    const text = encodeURIComponent(`Confira este momento: ${eventType} 🎥`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(clipUrl)}`, '_blank');
  };

  if (matchesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (matches.length === 0) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold">Análise Tática</h1>
            <p className="text-muted-foreground">Visualize a análise tática das partidas</p>
          </div>
          <Card variant="glass">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Video className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma análise disponível</h3>
              <p className="text-muted-foreground text-center mb-4">
                Importe e analise um vídeo para ver os resultados
              </p>
              <Button variant="arena" asChild>
                <Link to="/upload">Importar Partida</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-bold">Análise Tática</h1>
              {selectedMatch && (
                <>
                  <Badge variant="arena">
                    {selectedMatch.home_team?.short_name || 'Casa'} vs {selectedMatch.away_team?.short_name || 'Visitante'}
                  </Badge>
                  <Badge variant="outline" className="text-lg font-bold px-3 py-1">
                    {selectedMatch.home_score ?? 0} x {selectedMatch.away_score ?? 0}
                  </Badge>
                </>
              )}
            </div>
            <p className="text-muted-foreground">
              {selectedMatch?.competition || 'Amistoso'} • {selectedMatch?.match_date ? new Date(selectedMatch.match_date).toLocaleDateString('pt-BR') : 'Data não definida'}
              {events.length > 0 && ` • ${events.length} eventos detectados`}
            </p>
          </div>
          <div className="flex gap-2">
            <Select 
              value={currentMatchId || ''} 
              onValueChange={(value) => {
                setSelectedMatch(value);
                setSelectedEventForPlay(null); // Reset event selection
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecionar partida" />
              </SelectTrigger>
              <SelectContent>
                {matches.map(match => (
                  <SelectItem key={match.id} value={match.id}>
                    <div className="flex items-center gap-2">
                      <span>{match.home_team?.short_name || 'Casa'} vs {match.away_team?.short_name || 'Visitante'}</span>
                      {match.status === 'live' && (
                        <Badge variant="destructive" className="text-xs px-1.5 py-0 gap-1 animate-pulse">
                          <Radio className="h-2.5 w-2.5" />
                          AO VIVO
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => setReimportDialogOpen(true)}
              disabled={!currentMatchId}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Reimportar Vídeos
            </Button>
            
            {/* Clip Generation Dropdown */}
            {canGenerateClips && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="secondary" 
                    size="sm"
                    disabled={isGeneratingClips}
                  >
                    {isGeneratingClips ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Scissors className="mr-2 h-4 w-4" />
                    )}
                    Gerar Clips
                    {eventsWithClips > 0 && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {eventsWithClips}/{events.length}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleGenerateClips('highlights', 10)}>
                    <Target className="mr-2 h-4 w-4" />
                    Gerar Highlights (gols, cartões)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleGenerateClips('all', 20)}>
                    <Film className="mr-2 h-4 w-4" />
                    Gerar Todos (máx 20)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleGenerateClips('all', 50)}>
                    <Video className="mr-2 h-4 w-4" />
                    Gerar Todos (máx 50)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            <Button variant="arena-outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Exportar Relatório
            </Button>
          </div>
        </div>

        {/* Reimport Dialog */}
        {currentMatchId && selectedMatch && (
          <ReimportMatchDialog
            isOpen={reimportDialogOpen}
            onClose={() => setReimportDialogOpen(false)}
            matchId={currentMatchId}
            matchName={`${selectedMatch.home_team?.short_name || 'Casa'} vs ${selectedMatch.away_team?.short_name || 'Visitante'}`}
          />
        )}

        {/* Clip Generation Progress */}
        {isGeneratingClips && (
          <Card variant="glass" className="border-primary/30">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{clipProgress.message}</span>
                    <div className="flex items-center gap-2">
                      {clipProgress.completedCount !== undefined && (
                        <Badge variant="outline">
                          {clipProgress.completedCount}/{clipProgress.totalCount} clips
                        </Badge>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={cancelClipGeneration}
                        className="h-7"
                      >
                        <StopCircle className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                  <Progress value={clipProgress.progress} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {analysisLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* 3D Heatmap with Player Formations */}
            <Card variant="glow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Mapa de Calor 3D - Formação dos Jogadores
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="arena">{tacticalAnalysis?.formation?.home || '4-3-3'}</Badge>
                    <span className="text-muted-foreground">vs</span>
                    <Badge variant="secondary">{tacticalAnalysis?.formation?.away || '4-4-2'}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Heatmap3D
                  homeTeam={selectedMatch?.home_team?.name || 'Time Casa'}
                  awayTeam={selectedMatch?.away_team?.name || 'Time Visitante'}
                  homeColor={selectedMatch?.home_team?.primary_color || '#10b981'}
                  awayColor={selectedMatch?.away_team?.primary_color || '#3b82f6'}
                  height={900}
                  eventHeatZones={eventHeatZones}
                  homePlayers={[
                    { x: 5, y: 50, number: 1, team: 'home', intensity: 0.3 },
                    { x: 20, y: 20, number: 4, team: 'home', intensity: 0.7 },
                    { x: 20, y: 40, number: 3, team: 'home', intensity: 0.6 },
                    { x: 20, y: 60, number: 15, team: 'home', intensity: 0.65 },
                    { x: 20, y: 80, number: 2, team: 'home', intensity: 0.75 },
                    { x: 45, y: 30, number: 8, team: 'home', intensity: 0.85 },
                    { x: 45, y: 50, number: 5, team: 'home', intensity: 0.9 },
                    { x: 45, y: 70, number: 17, team: 'home', intensity: 0.8 },
                    { x: 70, y: 20, number: 19, team: 'home', intensity: 0.95 },
                    { x: 75, y: 50, number: 9, team: 'home', intensity: 1 },
                    { x: 70, y: 80, number: 11, team: 'home', intensity: 0.9 },
                  ]}
                  awayPlayers={[
                    { x: 95, y: 50, number: 1, team: 'away', intensity: 0.3 },
                    { x: 80, y: 20, number: 2, team: 'away', intensity: 0.7 },
                    { x: 80, y: 40, number: 4, team: 'away', intensity: 0.65 },
                    { x: 80, y: 60, number: 5, team: 'away', intensity: 0.6 },
                    { x: 80, y: 80, number: 23, team: 'away', intensity: 0.75 },
                    { x: 60, y: 25, number: 8, team: 'away', intensity: 0.8 },
                    { x: 60, y: 50, number: 10, team: 'away', intensity: 0.95 },
                    { x: 60, y: 75, number: 15, team: 'away', intensity: 0.85 },
                    { x: 35, y: 30, number: 11, team: 'away', intensity: 0.9 },
                    { x: 30, y: 50, number: 9, team: 'away', intensity: 1 },
                    { x: 35, y: 70, number: 7, team: 'away', intensity: 0.88 },
                  ]}
                />
              </CardContent>
            </Card>

            {/* Formation Overview 2D */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card variant="tactical">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{selectedMatch?.home_team?.name || 'Time Casa'}</CardTitle>
                    <Badge variant="arena">{tacticalAnalysis?.formation?.home || '4-3-3'}</Badge>
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
                    <CardTitle>{selectedMatch?.away_team?.name || 'Time Visitante'}</CardTitle>
                    <Badge variant="arena">{tacticalAnalysis?.formation?.away || '4-4-2'}</Badge>
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

            {/* Animated Tactical Plays - Key Events */}
            {importantEvents.length > 0 && (
              <Card variant="glow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Play className="h-5 w-5 text-primary" />
                      Jogadas Táticas Animadas
                    </CardTitle>
                    <Badge variant="outline">{importantEvents.length} momentos-chave</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Event selector */}
                  <div className="flex flex-wrap gap-2">
                    {importantEvents.map((event) => {
                      const eventLabels: Record<string, string> = {
                        goal: 'GOL',
                        shot: 'Finalização',
                        shot_on_target: 'Chute no Gol',
                        corner: 'Escanteio',
                        penalty: 'Pênalti',
                        foul: 'Falta',
                        free_kick: 'Falta Direta',
                        cross: 'Cruzamento',
                        save: 'Defesa',
                        offside: 'Impedimento',
                        yellow_card: 'Amarelo',
                        red_card: 'Vermelho',
                        high_press: 'Pressão Alta',
                        transition: 'Transição',
                        ball_recovery: 'Recuperação',
                      };
                      const isSelected = selectedEventForPlay === event.id;
                      return (
                        <Button
                          key={event.id}
                          variant={isSelected ? "arena" : "outline"}
                          size="sm"
                          onClick={() => setSelectedEventForPlay(isSelected ? null : event.id)}
                          className="gap-2"
                        >
                          <Badge variant={event.event_type === 'goal' ? 'success' : 'secondary'} className="h-5 font-mono">
                            {formatTimestamp(getEventTime(event.id).totalSeconds)}
                          </Badge>
                          {eventLabels[event.event_type] || event.event_type}
                          {getThumbnail(event.id) && <Image className="h-3 w-3" />}
                          {matchVideo && <Video className="h-3 w-3" />}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Animated Play */}
                  {selectedEventForPlay ? (
                    <AnimatedTacticalPlay
                      event={importantEvents.find(e => e.id === selectedEventForPlay)!}
                      homeTeam={selectedMatch?.home_team?.name || 'Time Casa'}
                      awayTeam={selectedMatch?.away_team?.name || 'Time Visitante'}
                      thumbnail={getThumbnail(selectedEventForPlay)?.imageUrl}
                      hasVideo={!!matchVideo}
                      onViewThumbnail={(id) => {
                        const thumb = getThumbnail(id);
                        if (thumb) window.open(thumb.imageUrl, '_blank');
                      }}
                      onPlayVideo={handlePlayVideo}
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Selecione um evento acima para ver a jogada animada</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stats Comparison */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle>Comparativo de Estatísticas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: 'Posse de Bola', home: eventAnalysis.possession.home, away: eventAnalysis.possession.away, suffix: '%' },
                    { label: 'Gols', home: selectedMatch?.home_score ?? 0, away: selectedMatch?.away_score ?? 0 },
                    { label: 'Finalizações', home: eventAnalysis.homeStats.shots, away: eventAnalysis.awayStats.shots },
                    { label: 'Defesas', home: eventAnalysis.homeStats.saves, away: eventAnalysis.awayStats.saves },
                    { label: 'Faltas/Cartões', home: eventAnalysis.homeStats.fouls + eventAnalysis.homeStats.cards, away: eventAnalysis.awayStats.fouls + eventAnalysis.awayStats.cards },
                  ].map((stat, index) => (
                    <div key={index} className="grid grid-cols-[1fr,2fr,1fr] items-center gap-4">
                      <div className="text-right">
                        <span className="text-lg font-bold">
                          {stat.home}{stat.suffix || ''}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                          <div 
                            className="bg-gradient-arena transition-all"
                            style={{ width: `${(stat.home / (stat.home + stat.away || 1)) * 100}%` }}
                          />
                        </div>
                        <p className="text-center text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                      <div className="text-left">
                        <span className="text-lg font-bold">
                          {stat.away}{stat.suffix || ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Match Summary Section - Generated from events */}
            {(eventAnalysis.matchSummary || eventAnalysis.tacticalOverview || events.length > 0) && (
              <Card variant="glow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Resumo da Partida
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Complete Analysis */}
                  {eventAnalysis.matchSummary && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Análise Completa
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-4 rounded-lg">
                        {eventAnalysis.matchSummary}
                      </p>
                    </div>
                  )}
                  
                  {/* Tactical Analysis */}
                  {eventAnalysis.tacticalOverview && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Análise Tática
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-4 rounded-lg">
                        {eventAnalysis.tacticalOverview}
                      </p>
                    </div>
                  )}
                  
                  {/* Standout Players */}
                  {eventAnalysis.standoutPlayers && eventAnalysis.standoutPlayers.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                        <Star className="h-4 w-4" />
                        Jogadores em Destaque
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {eventAnalysis.standoutPlayers.map((player, i) => (
                          <Badge key={i} variant="arena" className="gap-1">
                            <User className="h-3 w-3" />
                            {player}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Audio Player Section */}
            {generatedAudio && generatedAudio.length > 0 && (
              <Card variant="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Volume2 className="h-5 w-5 text-primary" />
                    Narração da Partida
                  </CardTitle>
                  <CardDescription>
                    Áudios gerados para esta partida
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {generatedAudio.map((audio) => (
                      <div key={audio.id} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border/50">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 shrink-0">
                          <Volume2 className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium capitalize">
                            {audio.audio_type === 'narration' ? 'Narração' : 
                             audio.audio_type === 'podcast' ? 'Podcast' : 
                             audio.audio_type === 'summary' ? 'Resumo' : audio.audio_type}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {audio.voice ? `Voz: ${audio.voice}` : 'Locução Padrão'}
                            {audio.duration_seconds && ` • ${Math.floor(audio.duration_seconds / 60)}:${String(audio.duration_seconds % 60).padStart(2, '0')}`}
                          </p>
                        </div>
                        <audio 
                          controls 
                          src={audio.audio_url || ''} 
                          className="h-10 max-w-[200px]"
                        />
                        <Button variant="outline" size="icon" asChild>
                          <a href={audio.audio_url || ''} download target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tactical Patterns */}
            <Tabs defaultValue="insights" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="insights">
                  Insights ({eventAnalysis.keyMoments.length})
                </TabsTrigger>
                <TabsTrigger value="patterns">Padrões Táticos ({eventAnalysis.patterns.length})</TabsTrigger>
                <TabsTrigger value="events">Eventos ({events.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="insights" className="space-y-4">
                {eventAnalysis.keyMoments.length > 0 ? (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-3">
                      {eventAnalysis.keyMoments.map((moment, index) => {
                        const typeLabels: Record<string, string> = {
                          goal: 'Gol',
                          assist: 'Assistência',
                          shot: 'Finalização',
                          save: 'Defesa',
                          yellowCard: 'Cartão Amarelo',
                          redCard: 'Cartão Vermelho',
                          substitution: 'Substituição',
                          foul: 'Falta',
                          dribble: 'Drible',
                          woodwork: 'Na Trave',
                          offside: 'Impedimento',
                          freeKick: 'Falta Direta',
                          corner: 'Escanteio',
                          penalty: 'Pênalti',
                          transition: 'Transição',
                          emotionalMoment: 'Momento Especial'
                        };
                        
                        const typeColors: Record<string, string> = {
                          goal: 'bg-green-500/20 text-green-400 border-green-500/30',
                          assist: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
                          yellowCard: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                          redCard: 'bg-red-500/20 text-red-400 border-red-500/30',
                          save: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
                          penalty: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                        };
                        
                        return (
                          <Card key={index} variant="glass" className="hover:border-primary/50 transition-colors">
                            <CardContent className="py-4">
                              <div className="flex items-start gap-4">
                                <Badge 
                                  variant="outline" 
                                  className={`shrink-0 font-mono ${typeColors[moment.type] || 'bg-muted'}`}
                                >
                                  <Clock className="h-3 w-3 mr-1" />
                                  {moment.timestamp}
                                </Badge>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    {moment.player && (
                                      <span className="font-semibold text-foreground">{moment.player}</span>
                                    )}
                                    <Badge 
                                      variant="secondary" 
                                      className={`text-xs ${typeColors[moment.type] || ''}`}
                                    >
                                      {typeLabels[moment.type] || moment.type}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground leading-relaxed">
                                    {moment.description}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                ) : eventAnalysis.insights.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {eventAnalysis.insights.map((insight, index) => (
                      <Card key={index} variant="glow">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                              <Zap className="h-5 w-5 text-primary" />
                            </div>
                            <p className="text-sm leading-relaxed">{insight}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card variant="glass">
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Nenhum insight disponível - analise uma partida para ver os resultados
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="patterns" className="space-y-4">
                {eventAnalysis.patterns.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {eventAnalysis.patterns.map((pattern, index) => (
                      <Card key={index} variant="glow">
                        <CardContent className="pt-6">
                          <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                              {pattern.type === 'defensive_scheme' ? <Shield className="h-5 w-5 text-primary" /> :
                               pattern.type === 'attacking_scheme' ? <Swords className="h-5 w-5 text-primary" /> :
                               <Target className="h-5 w-5 text-primary" />}
                            </div>
                            <div>
                              <Badge variant="outline" className="capitalize">
                                {pattern.type.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm">{pattern.description}</p>
                          <div className="mt-4 flex items-center justify-end text-sm">
                            <span className="font-medium text-primary">
                              {Math.round(pattern.effectiveness * 100)}% eficácia
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card variant="glass">
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Nenhum padrão tático identificado - mais eventos são necessários
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="events" className="space-y-4">
                {events.length > 0 ? (
                  <div className="space-y-2">
                    {events.map((event) => {
                      const thumbnail = getThumbnail(event.id);
                      return (
                        <Card key={event.id} variant="glass" className="hover:border-primary/50 transition-colors">
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center gap-4">
                              {/* Play button */}
                              <Button
                                variant="outline"
                                size="icon"
                                className="shrink-0 h-12 w-12"
                                onClick={() => handlePlayVideo(event.id)}
                                disabled={!matchVideo}
                              >
                                <Play className={`h-5 w-5 ${matchVideo ? 'text-primary' : 'text-muted-foreground'}`} />
                              </Button>
                              
                              {/* Thumbnail or placeholder */}
                              {thumbnail ? (
                                <img 
                                  src={thumbnail.imageUrl} 
                                  alt={event.event_type}
                                  className="w-16 h-10 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => window.open(thumbnail.imageUrl, '_blank')}
                                />
                              ) : (
                                <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                                  <div className={`w-3 h-3 rounded-full ${
                                    event.event_type === 'goal' ? 'bg-green-500' :
                                    event.event_type.includes('card') ? 'bg-red-500' :
                                    event.event_type === 'foul' ? 'bg-yellow-500' : 'bg-muted-foreground'
                                  }`} />
                                </div>
                              )}
                              
                              <div className="flex-1 min-w-0">
                                <p className="font-medium capitalize">{event.event_type.replace(/_/g, ' ')}</p>
                                {event.description && (
                                  <p className="text-sm text-muted-foreground truncate">{event.description}</p>
                                )}
                              </div>
                              
                              <Badge variant={
                                event.event_type === 'goal' ? 'success' :
                                event.event_type.includes('card') ? 'destructive' :
                                event.event_type === 'foul' ? 'warning' : 'outline'
                              }>
                                {event.minute ? `${event.minute}'` : '—'}
                              </Badge>

                              {/* Clip badge and actions */}
                              {event.clip_url ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="secondary" size="sm" className="gap-1.5">
                                      <Film className="h-3.5 w-3.5" />
                                      Clip
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => window.open(event.clip_url!, '_blank')}>
                                      <ExternalLink className="mr-2 h-4 w-4" />
                                      Abrir Clip
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleCopyClipLink(event.clip_url!)}>
                                      <Copy className="mr-2 h-4 w-4" />
                                      Copiar Link
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleShareTwitter(event.clip_url!, event.event_type)}>
                                      <Twitter className="mr-2 h-4 w-4" />
                                      Compartilhar no X
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                      <a href={event.clip_url} download target="_blank" rel="noopener noreferrer">
                                        <Download className="mr-2 h-4 w-4" />
                                        Download
                                      </a>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : matchVideo && !matchVideo.file_url.includes('embed') ? (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  Sem clip
                                </Badge>
                              ) : null}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card variant="glass">
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Nenhum evento registrado
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* Video Dialog with Embed - 3s before and 5s after event */}
        <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {(() => {
                    const eventTime = getEventTime(playingEventId || '');
                    return <span>Evento - {eventTime.minute}:{String(eventTime.second).padStart(2, '0')}</span>;
                  })()}
                  <Badge variant="arena">3s antes • 5s depois</Badge>
                </div>
                {playingEventId && matchVideo && (
                  <Button
                    variant="arena"
                    size="sm"
                    onClick={() => {
                      const eventTime = getEventTime(playingEventId);
                      const startSeconds = Math.max(0, eventTime.totalSeconds - 3); // 3 seconds before
                      
                      if (videoRef.current) {
                        videoRef.current.currentTime = startSeconds;
                        videoRef.current.play();
                        toast({
                          title: "Navegando para evento",
                          description: `Indo para ${Math.floor(startSeconds / 60)}:${String(Math.floor(startSeconds % 60)).padStart(2, '0')} (3s antes do evento)`,
                        });
                      }
                    }}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Ir para {getEventTime(playingEventId).minute}:{String(getEventTime(playingEventId).second).padStart(2, '0')}
                  </Button>
                )}
              </DialogTitle>
            </DialogHeader>
            {matchVideo && playingEventId && (() => {
              const eventTime = getEventTime(playingEventId);
              const startSeconds = Math.max(0, eventTime.totalSeconds - 3); // 3 seconds before event
              
              const isEmbed = matchVideo.file_url.includes('/embed/') || matchVideo.file_url.includes('iframe') || matchVideo.file_url.includes('xtream');
              const separator = matchVideo.file_url.includes('?') ? '&' : '?';
              const embedUrl = `${matchVideo.file_url}${separator}t=${Math.round(startSeconds)}&autoplay=1`;
              
              console.log('Analysis video sync:', {
                eventTime,
                startSeconds,
                videoUrl: matchVideo.file_url
              });
              
              return (
                <div className="space-y-4">
                  <div className="aspect-video relative">
                    {isEmbed ? (
                      <iframe
                        src={embedUrl}
                        className="absolute inset-0 w-full h-full rounded-lg"
                        frameBorder="0"
                        allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
                        title={`Evento ${eventTime.minute}:${String(eventTime.second).padStart(2, '0')}`}
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
                  
                  {/* Event Info + Confirmation hint */}
                  <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="gap-1">
                        <Play className="h-3 w-3" />
                        {eventTime.minute}:{String(eventTime.second).padStart(2, '0')}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Visualize o vídeo para confirmar se o evento está correto. Use a página de Eventos para editar se necessário.
                      </span>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/events?match=${currentMatchId}`}>
                        Ver Todos Eventos
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })()}</DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}