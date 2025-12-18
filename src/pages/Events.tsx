import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  AlertCircle,
  Sparkles,
  RefreshCw,
  FileText,
  Film,
  StopCircle
} from 'lucide-react';
import { useMatchEvents } from '@/hooks/useMatchDetails';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { Link } from 'react-router-dom';
import { EventEditDialog } from '@/components/events/EventEditDialog';
import { ReanalyzeHalfDialog } from '@/components/events/ReanalyzeHalfDialog';
import { ResetMatchDialog } from '@/components/events/ResetMatchDialog';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { VideoPlayerModal } from '@/components/media/VideoPlayerModal';
import { useMatchAnalysis } from '@/hooks/useMatchAnalysis';
import { useClipGeneration } from '@/hooks/useClipGeneration';
import { TranscriptionAnalysisDialog } from '@/components/events/TranscriptionAnalysisDialog';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getEventTeam, getEventTimeMs as getEventTimeMsHelper, formatEventTime } from '@/lib/eventHelpers';

// EventRow component for rendering individual events
interface EventRowProps {
  event: any;
  matchVideo: any;
  isAdmin: boolean;
  getApprovalIcon: (status: string | null) => React.ReactNode;
  formatTimestamp: (ms: number) => string;
  getEventTimeMs: (event: any) => number;
  handleEventClick: (event: any) => void;
  handleEditClick: (e: React.MouseEvent, event: any) => void;
  homeTeam?: any;
  awayTeam?: any;
}

const EventRow = ({ 
  event, 
  matchVideo, 
  isAdmin, 
  getApprovalIcon, 
  formatTimestamp, 
  getEventTimeMs, 
  handleEventClick, 
  handleEditClick,
  homeTeam,
  awayTeam
}: EventRowProps) => {
  // Use centralized helper for team identification
  const { team: eventTeam, teamType } = getEventTeam(
    { metadata: event.metadata, event_type: event.event_type },
    homeTeam,
    awayTeam
  );
  
  const teamLogo = eventTeam?.logo_url || null;
  const teamName = eventTeam?.short_name || eventTeam?.name || null;

  return (
    <div 
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors group cursor-pointer ${
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
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary group-hover:bg-primary/30 transition-colors shrink-0">
          <Play className="h-4 w-4" />
        </div>
      )}

      {/* Team logo */}
      {teamLogo ? (
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={teamLogo} alt={teamName} className="object-contain" />
          <AvatarFallback className="text-xs">{teamName?.slice(0, 2)}</AvatarFallback>
        </Avatar>
      ) : (
        getApprovalIcon(event.approval_status)
      )}
      
      <Badge 
        variant={
          event.event_type === 'goal' ? 'success' :
          event.event_type.includes('card') ? 'destructive' :
          event.event_type === 'foul' ? 'warning' : 'outline'
        }
        className="min-w-[50px] justify-center font-mono text-xs shrink-0"
      >
        {event.minute || 0}'
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="font-medium capitalize truncate text-sm">
          {event.event_type.replace(/_/g, ' ')}
        </p>
        {event.description && (
          <p className="text-xs text-muted-foreground truncate">
            {event.description}
          </p>
        )}
      </div>
      {event.metadata?.edited && (
        <Badge variant="secondary" className="shrink-0 text-xs">
          Editado
        </Badge>
      )}
      {/* Clip badge */}
      {event.clip_url && (
        <Badge variant="secondary" className="shrink-0 text-xs gap-1 bg-primary/20 text-primary border-primary/30">
          <Film className="h-3 w-3" />
          Clip
        </Badge>
      )}
      {/* Video indicator - only show if no clip */}
      {matchVideo && !event.clip_url && (
        <Badge variant="outline" className="shrink-0 text-xs gap-1 hidden sm:flex">
          <Play className="h-3 w-3" />
          {formatTimestamp(getEventTimeMs(event))}
        </Badge>
      )}
      {/* Edit button - only for admin */}
      {isAdmin && (
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-7 w-7"
          onClick={(e) => handleEditClick(e, event)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

export default function Events() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { analyzeWithTranscription, isAnalyzing: isRefining } = useMatchAnalysis();
  const { 
    isGenerating, 
    progress: clipProgress, 
    generateAllClips, 
    cancel: cancelClipGeneration,
    reset: resetClipProgress 
  } = useClipGeneration();
  
  // Centralized match selection
  const { currentMatchId, selectedMatch, matches, isLoading: matchesLoading, setSelectedMatch } = useMatchSelection();
  
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [approvalFilter, setApprovalFilter] = useState<string>('all');
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [playingEvent, setPlayingEvent] = useState<any>(null);
  const [showVignette, setShowVignette] = useState(true);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [reanalyzeHalf, setReanalyzeHalf] = useState<'first' | 'second' | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  
  const { data: events = [], isLoading: eventsLoading, refetch: refetchEvents } = useMatchEvents(currentMatchId);

  // Handle refine events - simplified
  const handleRefineEvents = async () => {
    toast.info('Use o diálogo "Analisar Transcrição" para refinar eventos');
  };

  // Handle re-analyze match - now requires transcription
  const handleReanalyze = async () => {
    if (!currentMatchId || !selectedMatch) return;
    
    toast.info('Use o diálogo "Analisar Transcrição" para re-analisar a partida com uma transcrição.');
  };

  // Fetch match videos (may have multiple segments)
  const { data: matchVideos } = useQuery({
    queryKey: ['match-videos', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return [];
      const { data } = await supabase
        .from('videos')
        .select('*')
        .eq('match_id', currentMatchId)
        .order('start_minute', { ascending: true });
      return data || [];
    },
    enabled: !!currentMatchId
  });
  
  // Find correct video segment for a given event based on match_half (preferred) or game minute (fallback)
  const getVideoForEvent = (event: any) => {
    if (!matchVideos || matchVideos.length === 0) return null;
    
    // PREFERIR match_half ou metadata.half para selecionar o vídeo
    const eventHalf = event.match_half || event.metadata?.half;
    
    if (eventHalf) {
      // Mapear half do evento para video_type
      const videoType = eventHalf === 'first' ? 'first_half' : 'second_half';
      const video = matchVideos.find(v => v.video_type === videoType);
      if (video) return video;
    }
    
    // FALLBACK: usar minuto se não tiver half definido
    const eventMinute = event.minute || 0;
    const video = matchVideos.find(v => {
      const start = v.start_minute || 0;
      const end = v.end_minute || 90;
      return eventMinute >= start && eventMinute < end;
    });
    
    return video || matchVideos[0];
  };
  
  // Use first video as fallback for general display
  const matchVideo = matchVideos?.[0] || null;

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

  // Group events by half - use match_half field or metadata.half, fallback to minute-based
  const firstHalfEvents = filteredEvents.filter(e => {
    const matchHalf = (e as any).match_half;
    const metadataHalf = e.metadata?.half;
    
    // Para vídeos 'full', usar minuto para decidir o tempo
    if (matchHalf === 'full' || metadataHalf === 'full') {
      return (e.minute || 0) < 45;
    }
    
    // Prefer explicit half markers, fallback to minute-based
    if (matchHalf) return matchHalf === 'first';
    if (metadataHalf) return metadataHalf === 'first';
    return (e.minute || 0) < 45;
  });
  const secondHalfEvents = filteredEvents.filter(e => {
    const matchHalf = (e as any).match_half;
    const metadataHalf = e.metadata?.half;
    
    // Para vídeos 'full', usar minuto para decidir o tempo
    if (matchHalf === 'full' || metadataHalf === 'full') {
      return (e.minute || 0) >= 45;
    }
    
    // Prefer explicit half markers, fallback to minute-based
    if (matchHalf) return matchHalf === 'second';
    if (metadataHalf) return metadataHalf === 'second';
    return (e.minute || 0) >= 45;
  });

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
    // Check if videos are loaded
    if (!matchVideos || matchVideos.length === 0) {
      toast.error('Carregando vídeos... Tente novamente.');
      return;
    }
    
    const eventVideo = getVideoForEvent(event);
    
    if (!eventVideo && !event.clip_url) {
      toast.error('Nenhum vídeo vinculado a esta partida');
      return;
    }
    
    // Check if event is within video range (when we have duration info)
    const videoDuration = eventVideo?.duration_seconds;
    const eventVideoSecond = event.metadata?.videoSecond;
    const videoStartMinute = eventVideo?.start_minute ?? 0;
    const videoEndMinute = eventVideo?.end_minute ?? 90;
    
    // If event timestamp exceeds video duration, calculate proportional position
    if (videoDuration && eventVideoSecond && eventVideoSecond > videoDuration) {
      // Calculate proportional position based on event minute within video coverage
      const eventMinute = event.minute ?? 0;
      const videoCoverageMinutes = videoEndMinute - videoStartMinute;
      
      if (videoCoverageMinutes > 0 && eventMinute >= videoStartMinute && eventMinute <= videoEndMinute) {
        // Event is within video coverage - calculate proportional position
        const positionInCoverage = (eventMinute - videoStartMinute) / videoCoverageMinutes;
        const calculatedVideoSecond = Math.floor(positionInCoverage * videoDuration);
        console.log(`Calculando posição proporcional: minuto ${eventMinute} → ${calculatedVideoSecond}s do vídeo`);
        event = { ...event, metadata: { ...event.metadata, videoSecond: calculatedVideoSecond } };
      } else {
        // Event outside video coverage - start from beginning
        console.warn(`Evento (minuto ${eventMinute}) fora da cobertura do vídeo (${videoStartMinute}-${videoEndMinute})`);
        event = { ...event, metadata: { ...event.metadata, videoSecond: 0 } };
      }
    }
    
    console.log('Opening video for event:', {
      eventMinute: event.minute,
      videoSecond: event.metadata?.videoSecond,
      video: eventVideo?.file_url,
      videoStart: eventVideo?.start_minute,
      videoEnd: eventVideo?.end_minute
    });
    
    if (eventVideo || event.clip_url) {
      setShowVignette(false); // Skip vignette, go directly to video
      setPlayingEvent({ ...event, _video: eventVideo });
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

  // Handle clip generation
  const handleGenerateClips = async (mode: 'highlights' | 'all' | 'selected', limit: number = 20) => {
    if (!currentMatchId || !matchVideo) {
      toast.error('Nenhum vídeo disponível para esta partida');
      return;
    }

    // Check if video is direct MP4 (not embed)
    if (matchVideo.file_url.includes('embed') || matchVideo.file_url.includes('xtream.tech')) {
      toast.error('Extração de clips só funciona com vídeos MP4 diretos, não com embeds');
      return;
    }

    let eventsToProcess: typeof events;
    
    if (mode === 'highlights') {
      // Priority: goals, red cards, penalties, yellow cards
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
      toast.info('Todos os eventos já possuem clips extraídos');
      return;
    }

    const clipsCount = Math.min(eventsToProcess.length, limit);
    toast.info(`Iniciando extração de ${clipsCount} clips...`);

    // Calculate video start minute from events if needed
    const minEventMinute = Math.min(...eventsToProcess.map(e => e.minute || 0));
    const videoStartMinute = matchVideo.start_minute ?? 
      (minEventMinute > (matchVideo.duration_seconds ?? 0) / 60 ? minEventMinute - 5 : 0);
    
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

    // Refresh events to show updated clip_url
    refetchEvents();
    toast.success('Extração de clips concluída!');
  };

  // Count events with clips
  const eventsWithClips = events.filter(e => e.clip_url).length;
  const eventsWithoutClips = events.filter(e => !e.clip_url).length;

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
            {isAdmin && currentMatchId && (
              <>
                <Button variant="arena" onClick={handleCreateEvent}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Evento
                </Button>
                
                {/* Clip Generation Dropdown */}
                {matchVideo && !matchVideo.file_url.includes('embed') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="secondary" 
                        disabled={isGenerating || eventsWithoutClips === 0}
                      >
                        {isGenerating ? (
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

                <TranscriptionAnalysisDialog
                  matchId={currentMatchId}
                  homeTeamName={selectedMatch?.home_team?.name || 'Casa'}
                  awayTeamName={selectedMatch?.away_team?.name || 'Visitante'}
                  onAnalysisComplete={() => {
                    refetchEvents();
                    queryClient.invalidateQueries({ queryKey: ['match', currentMatchId] });
                  }}
                >
                  <Button variant="secondary">
                    <FileText className="mr-2 h-4 w-4" />
                    Analisar Áudio
                  </Button>
                </TranscriptionAnalysisDialog>
                <Button 
                  variant="arena-outline" 
                  onClick={handleRefineEvents}
                  disabled={isRefining || events.length === 0}
                >
                  {isRefining ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Refinar com IA
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => setShowResetDialog(true)}
                  disabled={!matchVideos || matchVideos.length === 0}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refazer Tudo
                </Button>
              </>
            )}
            <Button variant="arena-outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Clip Generation Progress */}
        {isGenerating && (
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
                  <div className="space-y-4">
                    {/* 1º Tempo */}
                    {firstHalfEvents.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-sm py-2 z-10">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                              1º Tempo
                            </Badge>
                            <span className="text-sm text-muted-foreground">{firstHalfEvents.length} eventos</span>
                          </div>
                          {isAdmin && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-xs"
                              onClick={() => setReanalyzeHalf('first')}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Re-analisar
                            </Button>
                          )}
                        </div>
                        {firstHalfEvents.map((event) => (
                          <EventRow 
                            key={event.id}
                            event={event}
                            matchVideo={getVideoForEvent(event)}
                            isAdmin={isAdmin}
                            getApprovalIcon={getApprovalIcon}
                            formatTimestamp={formatTimestamp}
                            getEventTimeMs={getEventTimeMs}
                            handleEventClick={handleEventClick}
                            handleEditClick={handleEditClick}
                            homeTeam={selectedMatch?.home_team}
                            awayTeam={selectedMatch?.away_team}
                          />
                        ))}
                      </div>
                    )}
                    
                    {/* Intervalo */}
                    {firstHalfEvents.length > 0 && secondHalfEvents.length > 0 && (
                      <div className="flex items-center gap-4 py-2">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground font-medium">INTERVALO</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    
                    {/* 2º Tempo */}
                    {secondHalfEvents.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-sm py-2 z-10">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30">
                              2º Tempo
                            </Badge>
                            <span className="text-sm text-muted-foreground">{secondHalfEvents.length} eventos</span>
                          </div>
                          {isAdmin && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-xs"
                              onClick={() => setReanalyzeHalf('second')}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Re-analisar
                            </Button>
                          )}
                        </div>
                        {secondHalfEvents.map((event) => (
                          <EventRow 
                            key={event.id}
                            event={event}
                            matchVideo={getVideoForEvent(event)}
                            isAdmin={isAdmin}
                            getApprovalIcon={getApprovalIcon}
                            formatTimestamp={formatTimestamp}
                            getEventTimeMs={getEventTimeMs}
                            handleEventClick={handleEventClick}
                            handleEditClick={handleEditClick}
                            homeTeam={selectedMatch?.home_team}
                            awayTeam={selectedMatch?.away_team}
                          />
                        ))}
                      </div>
                    )}
                    
                    {/* Caso não tenha eventos em nenhum tempo */}
                    {firstHalfEvents.length === 0 && secondHalfEvents.length === 0 && (
                      <div className="py-8 text-center text-muted-foreground">
                        Nenhum evento encontrado
                      </div>
                    )}
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
                    <div className="flex items-center gap-3">
                      {selectedMatch.home_team.logo_url ? (
                        <img 
                          src={selectedMatch.home_team.logo_url} 
                          alt={selectedMatch.home_team.name}
                          className="h-8 w-8 object-contain"
                        />
                      ) : (
                        <div 
                          className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: selectedMatch.home_team.primary_color, color: '#fff' }}
                        >
                          {selectedMatch.home_team.short_name?.slice(0, 2)}
                        </div>
                      )}
                      <span className="font-medium">{selectedMatch.home_team.short_name}</span>
                    </div>
                    <span className="text-lg font-bold">
                      {selectedMatch.home_score ?? 0}
                    </span>
                  </div>
                )}
                {selectedMatch?.away_team && (
                  <div 
                    className="flex items-center justify-between rounded-lg p-3"
                    style={{ backgroundColor: (selectedMatch.away_team.primary_color === '#FFFFFF' ? '#00529F' : selectedMatch.away_team.primary_color) + '15' }}
                  >
                    <div className="flex items-center gap-3">
                      {selectedMatch.away_team.logo_url ? (
                        <img 
                          src={selectedMatch.away_team.logo_url} 
                          alt={selectedMatch.away_team.name}
                          className="h-8 w-8 object-contain"
                        />
                      ) : (
                        <div 
                          className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: selectedMatch.away_team.primary_color === '#FFFFFF' ? '#00529F' : selectedMatch.away_team.primary_color, color: '#fff' }}
                        >
                          {selectedMatch.away_team.short_name?.slice(0, 2)}
                        </div>
                      )}
                      <span className="font-medium">{selectedMatch.away_team.short_name}</span>
                    </div>
                    <span className="text-lg font-bold">
                      {selectedMatch.away_score ?? 0}
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
            // Priority: use metadata.videoSecond for actual video position
            videoSecond: playingEvent.metadata?.videoSecond as number | undefined
          } : null}
          matchVideo={playingEvent?._video || matchVideo}
          thumbnail={playingEvent ? getEventThumbnail(playingEvent.id) : undefined}
          homeTeam={selectedMatch?.home_team?.name || 'Casa'}
          awayTeam={selectedMatch?.away_team?.name || 'Visitante'}
          homeScore={selectedMatch?.home_score ?? 0}
          awayScore={selectedMatch?.away_score ?? 0}
          showVignette={showVignette}
          onVignetteComplete={() => setShowVignette(false)}
        />

        {/* Re-analyze Half Dialog */}
        {reanalyzeHalf && currentMatchId && selectedMatch && (
          <ReanalyzeHalfDialog
            isOpen={!!reanalyzeHalf}
            onClose={() => setReanalyzeHalf(null)}
            matchId={currentMatchId}
            half={reanalyzeHalf}
            homeTeamId={selectedMatch.home_team_id || ''}
            awayTeamId={selectedMatch.away_team_id || ''}
            competition={selectedMatch.competition || undefined}
            onComplete={() => {
              refetchEvents();
              queryClient.invalidateQueries({ queryKey: ['match', currentMatchId] });
            }}
          />
        )}

        {/* Reset Match Dialog */}
        {currentMatchId && selectedMatch && matchVideos && (
          <ResetMatchDialog
            isOpen={showResetDialog}
            onClose={() => setShowResetDialog(false)}
            matchId={currentMatchId}
            videos={matchVideos}
            homeTeamId={selectedMatch.home_team_id}
            awayTeamId={selectedMatch.away_team_id}
            competition={selectedMatch.competition}
            onResetComplete={() => {
              refetchEvents();
              queryClient.invalidateQueries({ queryKey: ['match', currentMatchId] });
              queryClient.invalidateQueries({ queryKey: ['matches'] });
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}
