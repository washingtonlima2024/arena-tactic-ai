import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Filter, 
  Download, 
  Target,
  Shield,
  AlertTriangle,
  Zap,
  Loader2,
  Video,
  Plus,
  Pencil,
  CheckCircle,
  Clock,
  XCircle,
  Play,
  Scissors,
  AlertCircle
} from 'lucide-react';
import { useMatchEvents } from '@/hooks/useMatchDetails';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { Link } from 'react-router-dom';
import { EventEditDialog } from '@/components/events/EventEditDialog';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { VideoPlayerModal } from '@/components/media/VideoPlayerModal';
import { useClipGeneration } from '@/hooks/useClipGeneration';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

export default function Events() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  
  // Centralized match selection
  const { currentMatchId, selectedMatch, matches, isLoading: matchesLoading, setSelectedMatch } = useMatchSelection();
  
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [approvalFilter, setApprovalFilter] = useState<string>('all');
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [playingEvent, setPlayingEvent] = useState<any>(null);
  const [showVignette, setShowVignette] = useState(true);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  
  // Clip generation
  const { 
    isGenerating: isExtractingClips, 
    progress: clipProgress, 
    generateClip,
    isGeneratingEvent 
  } = useClipGeneration();

  const { data: events = [], isLoading: eventsLoading } = useMatchEvents(currentMatchId);

  // Fetch match video
  const { data: matchVideo } = useQuery({
    queryKey: ['match-video', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return null;
      const { data } = await supabase
        .from('videos')
        .select('*')
        .eq('match_id', currentMatchId)
        .maybeSingle();
      return data;
    },
    enabled: !!currentMatchId
  });

  // Fetch thumbnails for events
  const { data: thumbnails = [] } = useQuery({
    queryKey: ['event-thumbnails', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return [];
      const { data } = await supabase
        .from('thumbnails')
        .select('*')
        .eq('match_id', currentMatchId);
      return data || [];
    },
    enabled: !!currentMatchId
  });

  // Filter events by type and approval status
  const filteredEvents = events.filter(event => {
    // Type filter
    let typeMatch = true;
    if (typeFilter === 'goals') typeMatch = event.event_type === 'goal';
    else if (typeFilter === 'shots') typeMatch = event.event_type.includes('shot');
    else if (typeFilter === 'fouls') typeMatch = event.event_type === 'foul' || event.event_type.includes('card');
    else if (typeFilter === 'tactical') typeMatch = ['high_press', 'transition', 'ball_recovery', 'substitution'].includes(event.event_type);
    
    // Approval filter
    let approvalMatch = true;
    if (approvalFilter === 'pending') approvalMatch = event.approval_status === 'pending' || !event.approval_status;
    else if (approvalFilter === 'approved') approvalMatch = event.approval_status === 'approved';
    else if (approvalFilter === 'rejected') approvalMatch = event.approval_status === 'rejected';
    
    return typeMatch && approvalMatch;
  });

  // Calculate counts
  const eventCounts = {
    goals: events.filter(e => e.event_type === 'goal').length,
    shots: events.filter(e => e.event_type.includes('shot')).length,
    fouls: events.filter(e => e.event_type === 'foul' || e.event_type.includes('card')).length,
    tactical: events.filter(e => ['high_press', 'transition', 'ball_recovery', 'substitution'].includes(e.event_type)).length,
    pending: events.filter(e => e.approval_status === 'pending' || !e.approval_status).length,
    approved: events.filter(e => e.approval_status === 'approved').length,
  };

  // Helper to get event time in ms from metadata
  const getEventTimeMs = (event: any): number => {
    const metadata = event.metadata as { eventMs?: number; videoSecond?: number } | null;
    if (metadata?.eventMs !== undefined) return metadata.eventMs;
    if (metadata?.videoSecond !== undefined) return metadata.videoSecond * 1000;
    return ((event.minute || 0) * 60 + (event.second || 0)) * 1000;
  };
  
  // Format timestamp from ms to MM:SS
  const formatTimestamp = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Group events by half (based on video seconds, not game minutes)
  const firstHalfEvents = filteredEvents.filter(e => getEventTimeMs(e) <= 45 * 60 * 1000);
  const secondHalfEvents = filteredEvents.filter(e => getEventTimeMs(e) > 45 * 60 * 1000);

  const getApprovalIcon = (status: string | null) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  // Handle event click - open video
  const handleEventClick = (event: any) => {
    if (!matchVideo && !event.clip_url) {
      toast.error('Nenhum vídeo vinculado a esta partida');
      return;
    }
    
    // Check if event is within video range (when we have duration info)
    const videoDuration = matchVideo?.duration_seconds;
    const eventVideoSecond = event.metadata?.videoSecond;
    
    if (videoDuration && eventVideoSecond && eventVideoSecond > videoDuration) {
      toast.error(`Evento fora do range do vídeo (${Math.round(videoDuration)}s). O vídeo não contém este momento.`);
      return;
    }
    
    if (matchVideo || event.clip_url) {
      setShowVignette(true);
      setPlayingEvent(event);
    }
  };

  // Handle edit button click
  const handleEditClick = (e: React.MouseEvent, event: any) => {
    e.stopPropagation();
    setEditingEvent(event);
  };

  // Handle create new event
  const handleCreateEvent = () => {
    if (!currentMatchId) return;
    setIsCreatingEvent(true);
    setEditingEvent({
      id: null,
      event_type: 'goal',
      minute: null,
      second: null,
      description: '',
      metadata: { team: selectedMatch?.home_team?.name || '' },
      approval_status: 'pending',
      match_id: currentMatchId,
      isNew: true
    });
  };

  // Get thumbnail for event
  const getEventThumbnail = (eventId: string) => {
    const thumb = thumbnails.find(t => t.event_id === eventId);
    return thumb ? { imageUrl: thumb.image_url } : undefined;
  };

  // Check if video is extractable (direct file, not embed)
  const isVideoExtractable = matchVideo && 
    !matchVideo.file_url.includes('xtream.tech') && 
    !matchVideo.file_url.includes('embed') &&
    matchVideo.file_url.includes('supabase');

  // Count clips already extracted
  const clipsExtracted = events.filter(e => e.clip_url).length;

  // Handle single clip extraction - use eventMs from metadata
  const handleExtractClip = async (e: React.MouseEvent, event: any) => {
    e.stopPropagation();
    
    if (!matchVideo || !isVideoExtractable) {
      toast.error('Vídeo não disponível para extração. Use um arquivo MP4 direto.');
      return;
    }

    const videoStartMs = (matchVideo.start_minute ?? 0) * 60 * 1000;
    const videoEndMs = (matchVideo.end_minute ?? 90) * 60 * 1000;
    const videoDurationMs = (matchVideo.duration_seconds ?? ((matchVideo.end_minute ?? 90) - (matchVideo.start_minute ?? 0)) * 60) * 1000;
    
    // Use eventMs from metadata as primary source
    const eventMs = getEventTimeMs(event);

    await generateClip({
      eventId: event.id,
      eventMinuteMs: eventMs,
      videoUrl: matchVideo.file_url,
      videoStartMs,
      videoEndMs,
      videoDurationMs,
      matchId: currentMatchId!,
      bufferBeforeMs: 3000,
      bufferAfterMs: 3000
    });

    queryClient.invalidateQueries({ queryKey: ['match-events', currentMatchId] });
  };

  // Handle extract all clips
  const handleExtractAllClips = async () => {
    if (!matchVideo || !isVideoExtractable) {
      toast.error('Vídeo não disponível para extração');
      return;
    }

    const eventsWithoutClips = events.filter(e => !e.clip_url);
    if (eventsWithoutClips.length === 0) {
      toast.info('Todos os clips já foram extraídos');
      return;
    }

    const videoStartMs = (matchVideo.start_minute ?? 0) * 60 * 1000;
    const videoEndMs = (matchVideo.end_minute ?? 90) * 60 * 1000;
    const videoDurationMs = (matchVideo.duration_seconds ?? ((matchVideo.end_minute ?? 90) - (matchVideo.start_minute ?? 0)) * 60) * 1000;

    for (const event of eventsWithoutClips) {
      // Use eventMs from metadata as primary source
      const eventMs = getEventTimeMs(event);
      await generateClip({
        eventId: event.id,
        eventMinuteMs: eventMs,
        videoUrl: matchVideo.file_url,
        videoStartMs,
        videoEndMs,
        videoDurationMs,
        matchId: currentMatchId!,
        bufferBeforeMs: 3000,
        bufferAfterMs: 3000
      });
    }

    queryClient.invalidateQueries({ queryKey: ['match-events', currentMatchId] });
    toast.success(`${eventsWithoutClips.length} clips extraídos!`);
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
            <h1 className="font-display text-3xl font-bold">Eventos da Partida</h1>
            <p className="text-muted-foreground">Visualize os eventos detectados nas partidas</p>
          </div>
          <Card variant="glass">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Video className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum evento disponível</h3>
              <p className="text-muted-foreground text-center mb-4">
                Importe e analise um vídeo para ver os eventos detectados
              </p>
              <Button variant="arena" asChild>
                <Link to="/upload">
                  <Plus className="mr-2 h-4 w-4" />
                  Importar Partida
                </Link>
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
            <h1 className="font-display text-3xl font-bold">Eventos da Partida</h1>
            {selectedMatch && (
              <p className="text-muted-foreground">
                {selectedMatch.home_team?.name || 'Casa'} {selectedMatch.home_score ?? 0} - {selectedMatch.away_score ?? 0} {selectedMatch.away_team?.name || 'Visitante'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Select 
              value={currentMatchId || ''} 
              onValueChange={(value) => setSelectedMatch(value)}
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
            {isAdmin && (
              <Button variant="arena" onClick={handleCreateEvent}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Evento
              </Button>
            )}
            {isVideoExtractable && events.length > 0 && (
              <Button 
                variant="arena-outline" 
                onClick={handleExtractAllClips}
                disabled={isExtractingClips}
              >
                {isExtractingClips ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Scissors className="mr-2 h-4 w-4" />
                )}
                Extrair Clips ({clipsExtracted}/{events.length})
              </Button>
            )}
            <Button variant="arena-outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          <Card variant="glow">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                <Target className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gols</p>
                <p className="font-display text-3xl font-bold">{eventCounts.goals}</p>
              </div>
            </CardContent>
          </Card>

          <Card variant="glow">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-500/10">
                <Zap className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Finalizações</p>
                <p className="font-display text-3xl font-bold">{eventCounts.shots}</p>
              </div>
            </CardContent>
          </Card>

          <Card variant="glow">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Faltas</p>
                <p className="font-display text-3xl font-bold">{eventCounts.fouls}</p>
              </div>
            </CardContent>
          </Card>

          <Card variant="glow">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Táticos</p>
                <p className="font-display text-3xl font-bold">{eventCounts.tactical}</p>
              </div>
            </CardContent>
          </Card>

          {/* Admin: Pending approval count */}
          {isAdmin && (
            <>
              <Card variant="glow" className="border-yellow-500/30">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-500/10">
                    <Clock className="h-6 w-6 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pendentes</p>
                    <p className="font-display text-3xl font-bold">{eventCounts.pending}</p>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glow" className="border-green-500/30">
                <CardContent className="flex items-center gap-4 pt-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Aprovados</p>
                    <p className="font-display text-3xl font-bold">{eventCounts.approved}</p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Clip Extraction Progress - only show when actively extracting, not during idle */}
        {isExtractingClips && clipProgress.stage !== 'idle' && clipProgress.message && (
          <Card variant="glow" className="border-primary/30">
            <CardContent className="flex items-center gap-4 py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div className="flex-1">
                <p className="font-medium">{clipProgress.message}</p>
                <Progress value={clipProgress.progress} className="mt-2 h-2" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Warning for non-extractable videos */}
        {matchVideo && !isVideoExtractable && (
          <Card variant="glass" className="border-yellow-500/30">
            <CardContent className="flex items-center gap-4 py-4">
              <AlertCircle className="h-6 w-6 text-yellow-500" />
              <div>
                <p className="font-medium text-yellow-500">Vídeo embed detectado</p>
                <p className="text-sm text-muted-foreground">
                  Clips só podem ser extraídos de arquivos MP4 enviados diretamente. Para embeds, use o player com navegação por timestamp.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Timeline */}
          <div className="lg:col-span-2">
            <Card variant="glass">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Timeline de Eventos ({filteredEvents.length})</CardTitle>
                <div className="flex gap-2">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-36">
                      <Filter className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="goals">Gols</SelectItem>
                      <SelectItem value="shots">Finalizações</SelectItem>
                      <SelectItem value="fouls">Faltas</SelectItem>
                      <SelectItem value="tactical">Táticos</SelectItem>
                    </SelectContent>
                  </Select>
                  {isAdmin && (
                    <Select value={approvalFilter} onValueChange={setApprovalFilter}>
                      <SelectTrigger className="w-36">
                        <CheckCircle className="mr-2 h-4 w-4" />
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pending">Pendentes</SelectItem>
                        <SelectItem value="approved">Aprovados</SelectItem>
                        <SelectItem value="rejected">Rejeitados</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    Nenhum evento encontrado
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredEvents.map((event) => (
                      <div 
                        key={event.id}
                        className={`flex items-center gap-4 rounded-lg border p-3 transition-colors group cursor-pointer ${
                          event.approval_status === 'pending' || !event.approval_status
                            ? 'border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10'
                            : event.approval_status === 'approved'
                            ? 'border-green-500/20 bg-muted/30 hover:bg-muted/50'
                            : 'border-red-500/20 bg-red-500/5 hover:bg-red-500/10'
                        }`}
                        onClick={() => handleEventClick(event)}
                      >
                        {/* Play icon for video */}
                        {(matchVideo || event.clip_url) && (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary group-hover:bg-primary/30 transition-colors">
                            <Play className="h-4 w-4" />
                          </div>
                        )}

                        {/* Approval status icon */}
                        {getApprovalIcon(event.approval_status)}
                        
                        <Badge 
                          variant={
                            event.event_type === 'goal' ? 'success' :
                            event.event_type.includes('card') ? 'destructive' :
                            event.event_type === 'foul' ? 'warning' : 'outline'
                          }
                          className="min-w-[60px] justify-center font-mono"
                        >
                          {formatTimestamp(getEventTimeMs(event))}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium capitalize truncate">
                            {event.event_type.replace(/_/g, ' ')}
                          </p>
                          {event.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {event.description}
                            </p>
                          )}
                        </div>
                        {event.metadata?.team && (
                          <Badge variant="outline" className="shrink-0">
                            {event.metadata.team}
                          </Badge>
                        )}
                        {event.metadata?.edited && (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            Editado
                          </Badge>
                        )}
                        {/* Clip status indicator */}
                        {event.clip_url ? (
                          <Badge variant="success" className="shrink-0 text-xs gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Clip
                          </Badge>
                        ) : isVideoExtractable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs"
                            onClick={(e) => handleExtractClip(e, event)}
                            disabled={isGeneratingEvent(event.id)}
                          >
                            {isGeneratingEvent(event.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Scissors className="h-3 w-3 mr-1" />
                            )}
                            Extrair
                          </Button>
                        )}
                        {/* Edit button - only for admin */}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={(e) => handleEditClick(e, event)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="space-y-6">
            <Card variant="glass">
              <CardHeader>
                <CardTitle>Por Tempo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>1º Tempo</span>
                    <span className="font-medium">{firstHalfEvents.length} eventos</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div 
                      className="h-full bg-gradient-arena transition-all" 
                      style={{ 
                        width: `${filteredEvents.length > 0 ? (firstHalfEvents.length / filteredEvents.length) * 100 : 0}%` 
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>2º Tempo</span>
                    <span className="font-medium">{secondHalfEvents.length} eventos</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div 
                      className="h-full bg-gradient-arena transition-all"
                      style={{ 
                        width: `${filteredEvents.length > 0 ? (secondHalfEvents.length / filteredEvents.length) * 100 : 0}%` 
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Approval Summary for Admin */}
            {isAdmin && (
              <Card variant="glow" className="border-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-primary" />
                    Aprovações
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">Pendentes</span>
                    </div>
                    <Badge variant="warning">{eventCounts.pending}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Aprovados</span>
                    </div>
                    <Badge variant="success">{eventCounts.approved}</Badge>
                  </div>
                  {eventCounts.pending > 0 && (
                    <Button
                      variant="arena"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => setApprovalFilter('pending')}
                    >
                      Ver Pendentes
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            <Card variant="glass">
              <CardHeader>
                <CardTitle>Por Time</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedMatch?.home_team && (
                  <div 
                    className="flex items-center justify-between rounded-lg p-3"
                    style={{ backgroundColor: selectedMatch.home_team.primary_color + '15' }}
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: selectedMatch.home_team.primary_color }}
                      />
                      <span className="font-medium">{selectedMatch.home_team.short_name}</span>
                    </div>
                    <span className="text-lg font-bold">
                      {events.filter(e => e.metadata?.team === selectedMatch.home_team?.name).length}
                    </span>
                  </div>
                )}
                {selectedMatch?.away_team && (
                  <div 
                    className="flex items-center justify-between rounded-lg p-3"
                    style={{ backgroundColor: (selectedMatch.away_team.primary_color === '#FFFFFF' ? '#00529F' : selectedMatch.away_team.primary_color) + '15' }}
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: selectedMatch.away_team.primary_color === '#FFFFFF' ? '#00529F' : selectedMatch.away_team.primary_color }}
                      />
                      <span className="font-medium">{selectedMatch.away_team.short_name}</span>
                    </div>
                    <span className="text-lg font-bold">
                      {events.filter(e => e.metadata?.team === selectedMatch.away_team?.name).length}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card variant="glow">
              <CardHeader>
                <CardTitle>Destaques</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {events
                  .filter(e => e.event_type === 'goal')
                  .slice(0, 4)
                  .map(event => (
                    <div key={event.id} className="flex items-center gap-3">
                      <Badge variant="success">Gol</Badge>
                      <span className="text-sm truncate">
                        {event.description || `${event.minute}'`}
                      </span>
                    </div>
                  ))}
                {events.filter(e => e.event_type === 'goal').length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum gol registrado</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Edit Dialog */}
        <EventEditDialog
          isOpen={!!editingEvent}
          onClose={() => {
            setEditingEvent(null);
            setIsCreatingEvent(false);
          }}
          event={editingEvent}
          homeTeam={selectedMatch?.home_team?.name}
          awayTeam={selectedMatch?.away_team?.name}
          matchVideo={matchVideo ? {
            file_url: matchVideo.file_url,
            start_minute: matchVideo.start_minute || 0
          } : null}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['match-events', currentMatchId] });
          }}
          isCreating={isCreatingEvent}
          matchId={currentMatchId}
        />

        {/* Video Player Modal */}
        <VideoPlayerModal
          isOpen={!!playingEvent}
          onClose={() => {
            setPlayingEvent(null);
            setShowVignette(true);
          }}
          clip={playingEvent ? {
            id: playingEvent.id,
            title: playingEvent.event_type.replace(/_/g, ' '),
            type: playingEvent.event_type,
            minute: playingEvent.minute || 0,
            second: playingEvent.second || 0,
            description: playingEvent.description || '',
            clipUrl: playingEvent.clip_url,
            // Priority: use 'second' field directly (user edited), fallback to metadata.videoSecond
            videoSecond: playingEvent.second !== undefined && playingEvent.second !== null 
              ? playingEvent.second 
              : (playingEvent.metadata?.videoSecond as number | undefined)
          } : null}
          thumbnail={playingEvent ? getEventThumbnail(playingEvent.id) : undefined}
          matchVideo={matchVideo}
          homeTeam={selectedMatch?.home_team?.name || 'Casa'}
          awayTeam={selectedMatch?.away_team?.name || 'Visitante'}
          homeScore={selectedMatch?.home_score ?? 0}
          awayScore={selectedMatch?.away_score ?? 0}
          showVignette={showVignette}
          onVignetteComplete={() => setShowVignette(false)}
        />
      </div>
    </AppLayout>
  );
}
