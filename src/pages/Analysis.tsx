import { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FootballField } from '@/components/tactical/FootballField';
import { AnimatedTacticalPlay } from '@/components/tactical/AnimatedTacticalPlay';
import { Heatmap3D } from '@/components/tactical/Heatmap3D';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
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
  Image
} from 'lucide-react';
import { useMatchAnalysis, useMatchEvents } from '@/hooks/useMatchDetails';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { useThumbnailGeneration } from '@/hooks/useThumbnailGeneration';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

export default function Analysis() {
  // Centralized match selection
  const { currentMatchId, selectedMatch, matches, isLoading: matchesLoading, setSelectedMatch } = useMatchSelection();
  
  const [selectedEventForPlay, setSelectedEventForPlay] = useState<string | null>(null);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [playingEventId, setPlayingEventId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: analysis, isLoading: analysisLoading } = useMatchAnalysis(currentMatchId);
  const { data: events = [] } = useMatchEvents(currentMatchId);
  const { thumbnails, getThumbnail } = useThumbnailGeneration(currentMatchId || undefined);

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

  const tacticalAnalysis = analysis?.tacticalAnalysis;

  // Get important events (goals, shots, key moments, tactical events)
  const importantEvents = events.filter(e => 
    ['goal', 'shot', 'shot_on_target', 'penalty', 'corner', 'foul', 'free_kick', 'cross', 
     'save', 'offside', 'yellow_card', 'red_card', 'high_press', 'transition', 'ball_recovery'].includes(e.event_type)
  ).slice(0, 10);

  // Calculate stats from events
  const eventCounts = {
    goals: events.filter(e => e.event_type === 'goal').length,
    shots: events.filter(e => e.event_type.includes('shot')).length,
    fouls: events.filter(e => e.event_type === 'foul' || e.event_type.includes('card')).length,
    tactical: events.filter(e => ['high_press', 'transition', 'ball_recovery', 'substitution'].includes(e.event_type)).length,
  };

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

  const getEventTime = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return { minute: 0, second: 0, totalSeconds: 0 };
    
    // Use videoSecond from metadata if available
    const metadata = event.metadata as { videoSecond?: number } | null;
    const videoSecond = metadata?.videoSecond;
    
    // If we have videoSecond from analysis, use it directly
    if (videoSecond !== undefined && videoSecond >= 0) {
      return { 
        minute: Math.floor(videoSecond / 60), 
        second: videoSecond % 60, 
        totalSeconds: videoSecond 
      };
    }
    
    // Fallback to minute + second fields
    const totalSeconds = (event.minute * 60) + (event.second || 0);
    return { 
      minute: event.minute, 
      second: event.second || 0, 
      totalSeconds 
    };
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
                <Badge variant="arena">
                  {selectedMatch.home_team?.short_name || 'Casa'} vs {selectedMatch.away_team?.short_name || 'Visitante'}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {selectedMatch?.competition || 'Amistoso'} • {selectedMatch?.match_date ? new Date(selectedMatch.match_date).toLocaleDateString('pt-BR') : 'Data não definida'}
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
                    {match.home_team?.short_name || 'Casa'} vs {match.away_team?.short_name || 'Visitante'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="arena-outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar Relatório
            </Button>
          </div>
        </div>

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
                          <Badge variant={event.event_type === 'goal' ? 'success' : 'secondary'} className="h-5">
                            {event.minute}'
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
                    { label: 'Posse de Bola', home: tacticalAnalysis?.possession?.home || 50, away: tacticalAnalysis?.possession?.away || 50, suffix: '%' },
                    { label: 'Gols', home: selectedMatch?.home_score || eventCounts.goals, away: selectedMatch?.away_score || 0 },
                    { label: 'Eventos Táticos', home: eventCounts.tactical, away: 0 },
                    { label: 'Faltas/Cartões', home: eventCounts.fouls, away: 0 },
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

            {/* Tactical Patterns */}
            <Tabs defaultValue="insights" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="insights">Insights</TabsTrigger>
                <TabsTrigger value="patterns">Padrões Táticos</TabsTrigger>
                <TabsTrigger value="events">Eventos ({events.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="insights" className="space-y-4">
                {tacticalAnalysis?.insights && tacticalAnalysis.insights.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {tacticalAnalysis.insights.map((insight, index) => (
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
                      Nenhum insight disponível
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="patterns" className="space-y-4">
                {tacticalAnalysis?.patterns && tacticalAnalysis.patterns.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {tacticalAnalysis.patterns.map((pattern, index) => (
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
                      Nenhum padrão tático identificado
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