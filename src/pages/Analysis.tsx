import { useState, useRef, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  BarChart3, Target, Swords, Shield, Zap,
  Download, Loader2, Video, Play, FileText, Volume2,
  Star, User, Trash2, Scissors, Film,
  StopCircle, Clock, Calendar, MapPin,
} from 'lucide-react';
import { useDynamicMatchStats } from '@/hooks/useDynamicMatchStats';
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
import { getEventLabel } from '@/lib/eventLabels';

// New analysis components
import { TeamComparisonPanel } from '@/components/analysis/TeamComparisonPanel';
import { BestPlayerCard } from '@/components/analysis/BestPlayerCard';
import { MatchStatsGrid } from '@/components/analysis/MatchStatsGrid';
import { AnalysisEventTimeline } from '@/components/analysis/AnalysisEventTimeline';
import { MatchReplayHeatmap } from '@/components/analysis/MatchReplayHeatmap';

export default function Analysis() {
  const queryClient = useQueryClient();
  
  const { isRecording, currentMatchId: liveMatchId } = useLiveBroadcastContext();
  const { currentMatchId, selectedMatch, matches, isLoading: matchesLoading, setSelectedMatch } = useMatchSelection();
  
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [playingEventId, setPlayingEventId] = useState<string | null>(null);
  const [reimportDialogOpen, setReimportDialogOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: analysis, isLoading: analysisLoading } = useMatchAnalysis(currentMatchId);
  const { data: events = [], refetch: refetchEvents } = useMatchEvents(currentMatchId);
  const { thumbnails, getThumbnail } = useThumbnailGeneration(currentMatchId || undefined);
  
  const dynamicStats = useDynamicMatchStats(
    events,
    selectedMatch?.home_team?.name || '',
    selectedMatch?.away_team?.name || ''
  );
  
  const { 
    isGenerating: isGeneratingClips, 
    progress: clipProgress, 
    generateAllClips, 
    cancel: cancelClipGeneration 
  } = useClipGeneration();

  const isLiveMatch = selectedMatch?.status === 'live' || (isRecording && liveMatchId === currentMatchId);

  // Polling for live matches
  useEffect(() => {
    if (!currentMatchId || !isLiveMatch) return;
    const pollInterval = setInterval(() => {
      refetchEvents();
      queryClient.invalidateQueries({ queryKey: ['match-video', currentMatchId] });
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [currentMatchId, isLiveMatch, refetchEvents, queryClient]);

  // Realtime subscription
  useEffect(() => {
    if (!currentMatchId) return;
    const channel = supabase
      .channel(`analysis-realtime-${currentMatchId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'match_events',
        filter: `match_id=eq.${currentMatchId}`
      }, (payload) => {
        refetchEvents();
        queryClient.invalidateQueries({ queryKey: ['match-events', currentMatchId] });
        if (isLiveMatch && payload.eventType === 'INSERT') {
          toast({ title: "Analise atualizada", description: "Novo evento adicionado a analise tatica" });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentMatchId, refetchEvents, queryClient, isLiveMatch]);

  const { data: matchVideo } = useQuery({
    queryKey: ['match-video', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return null;
      const { data } = await supabase.from('videos').select('*').eq('match_id', currentMatchId).maybeSingle();
      return data;
    },
    enabled: !!currentMatchId
  });

  const { data: generatedAudio } = useQuery({
    queryKey: ['generated-audio', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return [];
      const { data } = await supabase.from('generated_audio').select('*').eq('match_id', currentMatchId).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!currentMatchId
  });

  const eventAnalysis = useEventBasedAnalysis(events, selectedMatch?.home_team, selectedMatch?.away_team);
  const tacticalAnalysis = analysis?.tacticalAnalysis as ExtendedTacticalAnalysis | null;

  const { heatZones: eventHeatZones } = useEventHeatZones(
    events, selectedMatch?.home_team?.name, selectedMatch?.away_team?.name
  );

  const handlePlayVideo = (eventId: string) => {
    if (matchVideo) {
      setPlayingEventId(eventId);
      setVideoDialogOpen(true);
    } else {
      toast({ title: "Video nao disponivel", description: "Faca upload do video na pagina de Upload.", variant: "destructive" });
    }
  };

  const getEventTime = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return { minute: 0, second: 0, totalSeconds: 0, totalMs: 0 };
    const metadata = event.metadata as { eventMs?: number; videoSecond?: number } | null;
    let totalMs: number;
    if (metadata?.eventMs !== undefined) totalMs = metadata.eventMs;
    else if (metadata?.videoSecond !== undefined) totalMs = metadata.videoSecond * 1000;
    else totalMs = ((event.minute || 0) * 60 + (event.second || 0)) * 1000;
    const totalSeconds = Math.floor(totalMs / 1000);
    return { minute: Math.floor(totalSeconds / 60), second: totalSeconds % 60, totalSeconds, totalMs };
  };

  // Clip generation
  const eventsWithClips = events.filter(e => e.clip_url).length;
  const eventsWithoutClips = events.filter(e => !e.clip_url).length;
  const canGenerateClips = matchVideo && !matchVideo.file_url.includes('embed') && eventsWithoutClips > 0;

  const handleGenerateClips = async (mode: 'highlights' | 'all', limit: number = 20) => {
    if (!currentMatchId || !matchVideo) {
      toast({ title: "Erro", description: "Nenhum video disponivel", variant: "destructive" });
      return;
    }
    if (matchVideo.file_url.includes('embed') || matchVideo.file_url.includes('xtream.tech')) {
      toast({ title: "Erro", description: "Extracao de clips so funciona com videos MP4 diretos", variant: "destructive" });
      return;
    }
    let eventsToProcess: typeof events;
    if (mode === 'highlights') {
      const priorityTypes = ['goal', 'red_card', 'penalty', 'yellow_card'];
      eventsToProcess = events
        .filter(e => priorityTypes.includes(e.event_type) && !e.clip_url)
        .sort((a, b) => priorityTypes.indexOf(a.event_type) - priorityTypes.indexOf(b.event_type));
    } else {
      eventsToProcess = events.filter(e => !e.clip_url);
    }
    if (eventsToProcess.length === 0) {
      toast({ title: "Info", description: "Todos os eventos ja possuem clips" });
      return;
    }
    const clipsCount = Math.min(eventsToProcess.length, limit);
    toast({ title: "Gerando clips", description: `Iniciando extracao de ${clipsCount} clips...` });
    const videoStartMinute = matchVideo.start_minute ?? 0;
    await generateAllClips(eventsToProcess.slice(0, limit), matchVideo.file_url, currentMatchId, {
      limit, videoStartMinute, videoDurationSeconds: matchVideo.duration_seconds ?? undefined
    });
    refetchEvents();
    toast({ title: "Concluido", description: "Extracao de clips concluida!" });
  };

  // Team colors/names
  const homeTeamName = selectedMatch?.home_team?.name || 'Time Casa';
  const awayTeamName = selectedMatch?.away_team?.name || 'Time Visitante';
  const homeTeamColor = selectedMatch?.home_team?.primary_color || '#10b981';
  const awayTeamColor = selectedMatch?.away_team?.primary_color || '#3b82f6';

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
            <h1 className="font-display text-3xl font-bold">Analise Tatica</h1>
            <p className="text-muted-foreground">Visualize a analise tatica das partidas</p>
          </div>
          <Card variant="glass">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Video className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma analise disponivel</h3>
              <p className="text-muted-foreground text-center mb-4">
                Importe e analise um video para ver os resultados
              </p>
              <Button variant="arena" asChild>
                <Link to="/upload?mode=new">Importar Partida</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout key={currentMatchId}>
      <div className="space-y-6 max-w-5xl mx-auto">

        {/* ============================================================ */}
        {/* SECTION 1: HEADER - Score, Teams, Match Info                  */}
        {/* ============================================================ */}
        <div className="animate-fade-in">
          <Card variant="glow" className="overflow-hidden">
            <CardContent className="pt-6 pb-4">
              <div className="flex flex-col items-center gap-4">
                {/* Teams + Score */}
                <div className="flex items-center justify-center gap-4 sm:gap-8 w-full">
                  {/* Home team */}
                  <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                    {selectedMatch?.home_team?.logo_url ? (
                      <img src={selectedMatch.home_team.logo_url} alt="" className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border-2" style={{ borderColor: homeTeamColor }} />
                    ) : (
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl font-bold" style={{ backgroundColor: `${homeTeamColor}20`, color: homeTeamColor }}>
                        {homeTeamName.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm sm:text-base font-semibold text-center truncate max-w-[120px]">
                      {selectedMatch?.home_team?.short_name || homeTeamName}
                    </span>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-3">
                    <span className="text-4xl sm:text-5xl font-bold tabular-nums" style={{ color: homeTeamColor }}>
                      {dynamicStats.score.home}
                    </span>
                    <span className="text-2xl text-muted-foreground font-light">x</span>
                    <span className="text-4xl sm:text-5xl font-bold tabular-nums" style={{ color: awayTeamColor }}>
                      {dynamicStats.score.away}
                    </span>
                  </div>

                  {/* Away team */}
                  <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                    {selectedMatch?.away_team?.logo_url ? (
                      <img src={selectedMatch.away_team.logo_url} alt="" className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border-2" style={{ borderColor: awayTeamColor }} />
                    ) : (
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl font-bold" style={{ backgroundColor: `${awayTeamColor}20`, color: awayTeamColor }}>
                        {awayTeamName.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm sm:text-base font-semibold text-center truncate max-w-[120px]">
                      {selectedMatch?.away_team?.short_name || awayTeamName}
                    </span>
                  </div>
                </div>

                {/* Match info badges */}
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                  {selectedMatch?.competition && (
                    <Badge variant="outline" className="gap-1"><Swords className="h-3 w-3" />{selectedMatch.competition}</Badge>
                  )}
                  {selectedMatch?.match_date && (
                    <Badge variant="outline" className="gap-1"><Calendar className="h-3 w-3" />{new Date(selectedMatch.match_date).toLocaleDateString('pt-BR')}</Badge>
                  )}
                  {selectedMatch?.venue && (
                    <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" />{selectedMatch.venue}</Badge>
                  )}
                  {events.length > 0 && (
                    <Badge variant="arena" className="gap-1">{events.length} eventos</Badge>
                  )}
                  {isLiveMatch && (
                    <Badge variant="destructive" className="gap-1 animate-pulse">AO VIVO</Badge>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button variant="destructive" size="sm" onClick={() => setReimportDialogOpen(true)} disabled={!currentMatchId}>
                    <Trash2 className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Reimportar</span>
                  </Button>
                  {canGenerateClips && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm" disabled={isGeneratingClips}>
                          {isGeneratingClips ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <Scissors className="h-4 w-4 sm:mr-2" />}
                          <span className="hidden sm:inline">Gerar Clips</span>
                          {eventsWithClips > 0 && <Badge variant="outline" className="ml-1 text-xs">{eventsWithClips}/{events.length}</Badge>}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleGenerateClips('highlights', 10)}>
                          <Target className="mr-2 h-4 w-4" />Highlights (gols, cartoes)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleGenerateClips('all', 20)}>
                          <Film className="mr-2 h-4 w-4" />Todos (max 20)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleGenerateClips('all', 50)}>
                          <Video className="mr-2 h-4 w-4" />Todos (max 50)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button variant="arena-outline" size="sm">
                    <Download className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Exportar</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
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
                        <Badge variant="outline">{clipProgress.completedCount}/{clipProgress.totalCount} clips</Badge>
                      )}
                      <Button variant="ghost" size="sm" onClick={cancelClipGeneration} className="h-7">
                        <StopCircle className="h-4 w-4 mr-1" />Cancelar
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
            {/* ============================================================ */}
            {/* SECTION 2: EXECUTIVE SUMMARY                                  */}
            {/* ============================================================ */}
            {(eventAnalysis.matchSummary || eventAnalysis.tacticalOverview) && (
              <Card variant="glow" className="animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Resumo Executivo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {eventAnalysis.matchSummary && (
                    <p className="text-sm leading-relaxed bg-muted/30 p-4 rounded-lg">
                      {eventAnalysis.matchSummary}
                    </p>
                  )}
                  {eventAnalysis.tacticalOverview && (
                    <p className="text-sm leading-relaxed bg-muted/30 p-4 rounded-lg">
                      {eventAnalysis.tacticalOverview}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* SECTION 3: TEAM COMPARISON                                    */}
            {/* ============================================================ */}
            <TeamComparisonPanel
              homeTeamName={homeTeamName}
              awayTeamName={awayTeamName}
              homeTeamColor={homeTeamColor}
              awayTeamColor={awayTeamColor}
              stats={dynamicStats}
              possession={eventAnalysis.possession}
            />

            {/* ============================================================ */}
            {/* SECTION 4: BEST PLAYER                                        */}
            {/* ============================================================ */}
            <BestPlayerCard
              player={eventAnalysis.bestPlayer}
              homeTeamName={homeTeamName}
              awayTeamName={awayTeamName}
              homeTeamColor={homeTeamColor}
              awayTeamColor={awayTeamColor}
            />

            {/* ============================================================ */}
            {/* SECTION 5: REPLAY HEATMAP                                     */}
            {/* ============================================================ */}
            <MatchReplayHeatmap
              events={events}
              homeTeamName={homeTeamName}
              awayTeamName={awayTeamName}
              homeTeamColor={homeTeamColor}
              awayTeamColor={awayTeamColor}
              onPlayClip={(clipUrl) => window.open(clipUrl, '_blank')}
            />

            {/* ============================================================ */}
            {/* SECTION 6: TACTICAL SUMMARY                                   */}
            {/* ============================================================ */}
            {(eventAnalysis.patterns.length > 0 || tacticalAnalysis) && (
              <Card variant="glass" className="animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    Resumo Tatico
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Formations */}
                  {tacticalAnalysis?.formation && (
                    <div className="flex items-center justify-center gap-4">
                      <Badge variant="arena" className="text-sm">{tacticalAnalysis.formation.home}</Badge>
                      <span className="text-muted-foreground text-xs">vs</span>
                      <Badge variant="secondary" className="text-sm">{tacticalAnalysis.formation.away}</Badge>
                    </div>
                  )}

                  {/* Possession bar */}
                  {events.length >= 10 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{homeTeamName} {eventAnalysis.possession.home}%</span>
                        <span>Posse de Bola</span>
                        <span>{eventAnalysis.possession.away}% {awayTeamName}</span>
                      </div>
                      <div className="flex h-3 rounded-full overflow-hidden bg-muted/50">
                        <div className="transition-all duration-500" style={{ width: `${eventAnalysis.possession.home}%`, backgroundColor: homeTeamColor, opacity: 0.8 }} />
                        <div className="transition-all duration-500" style={{ width: `${eventAnalysis.possession.away}%`, backgroundColor: awayTeamColor, opacity: 0.8 }} />
                      </div>
                    </div>
                  )}

                  {/* Tactical patterns */}
                  {eventAnalysis.patterns.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {eventAnalysis.patterns.map((pattern, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/20 p-3 border border-border/30">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                            {pattern.type === 'defensive_scheme' ? <Shield className="h-4 w-4 text-primary" /> :
                             pattern.type === 'attacking_scheme' ? <Swords className="h-4 w-4 text-primary" /> :
                             <Zap className="h-4 w-4 text-primary" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Badge variant="outline" className="text-xs capitalize">{pattern.type.replace(/_/g, ' ')}</Badge>
                              <span className="text-xs text-primary font-medium">{Math.round(pattern.effectiveness * 100)}%</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{pattern.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Standout players */}
                  {eventAnalysis.standoutPlayers.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm text-muted-foreground flex items-center gap-2">
                        <Star className="h-4 w-4" />
                        Jogadores em Destaque
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {eventAnalysis.standoutPlayers.map((player, i) => (
                          <Badge key={i} variant="arena" className="gap-1">
                            <User className="h-3 w-3" />{player}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* SECTION 7: DETAILED STATS GRID                                */}
            {/* ============================================================ */}
            <MatchStatsGrid
              stats={dynamicStats}
              homeTeamName={homeTeamName}
              awayTeamName={awayTeamName}
            />

            {/* ============================================================ */}
            {/* SECTION 8: AUDIO                                              */}
            {/* ============================================================ */}
            {generatedAudio && generatedAudio.length > 0 && (
              <Card variant="glass" className="animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Volume2 className="h-5 w-5 text-primary" />
                    Narracao da Partida
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {generatedAudio.map((audio) => (
                      <div key={audio.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                            <Volume2 className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium capitalize text-sm">
                              {audio.audio_type === 'narration' ? 'Narracao' : audio.audio_type === 'podcast' ? 'Podcast' : audio.audio_type === 'summary' ? 'Resumo' : audio.audio_type}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {audio.voice ? `Voz: ${audio.voice}` : 'Locucao Padrao'}
                              {audio.duration_seconds && ` - ${Math.floor(audio.duration_seconds / 60)}:${String(audio.duration_seconds % 60).padStart(2, '0')}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:ml-auto">
                          <audio controls src={audio.audio_url || ''} className="h-10 w-full sm:max-w-[200px]" />
                          <Button variant="outline" size="icon" className="shrink-0" asChild>
                            <a href={audio.audio_url || ''} download target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* SECTION 9: EVENT TIMELINE                                     */}
            {/* ============================================================ */}
            <AnalysisEventTimeline
              events={events}
              homeTeamName={homeTeamName}
              awayTeamName={awayTeamName}
              onPlayEvent={handlePlayVideo}
              getThumbnail={getThumbnail}
            />
          </>
        )}

        {/* Video Dialog */}
        <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {(() => {
                    const eventTime = getEventTime(playingEventId || '');
                    return <span>Evento - {eventTime.minute}:{String(eventTime.second).padStart(2, '0')}</span>;
                  })()}
                  <Badge variant="arena">3s antes - 5s depois</Badge>
                </div>
                {playingEventId && matchVideo && (
                  <Button variant="arena" size="sm" onClick={() => {
                    const eventTime = getEventTime(playingEventId);
                    const startSeconds = Math.max(0, eventTime.totalSeconds - 3);
                    if (videoRef.current) {
                      videoRef.current.currentTime = startSeconds;
                      videoRef.current.play();
                    }
                  }}>
                    <Play className="h-4 w-4 mr-1" />
                    Ir para {getEventTime(playingEventId).minute}:{String(getEventTime(playingEventId).second).padStart(2, '0')}
                  </Button>
                )}
              </DialogTitle>
            </DialogHeader>
            {matchVideo && playingEventId && (() => {
              const eventTime = getEventTime(playingEventId);
              const startSeconds = Math.max(0, eventTime.totalSeconds - 3);
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
                        title={`Evento ${eventTime.minute}:${String(eventTime.second).padStart(2, '0')}`}
                      />
                    ) : (
                      <video
                        ref={videoRef}
                        src={matchVideo.file_url}
                        controls
                        autoPlay
                        className="w-full h-full rounded-lg"
                        onLoadedMetadata={(e) => { e.currentTarget.currentTime = startSeconds; }}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="gap-1">
                        <Play className="h-3 w-3" />
                        {eventTime.minute}:{String(eventTime.second).padStart(2, '0')}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Use a pagina de Eventos para editar se necessario.
                      </span>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/events?match=${currentMatchId}`}>Ver Eventos</Link>
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
