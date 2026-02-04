import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  RefreshCw,
  FileText,
  Film,
  StopCircle,
  Radio,
  Cog,
  AlertCircle,
  CloudOff,
  Cloud,
  CloudUpload,
  Server,
  Stethoscope,
  Brain
} from 'lucide-react';
import { useMatchEvents } from '@/hooks/useMatchDetails';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { getEventLabel } from '@/lib/eventLabels';
import { Link } from 'react-router-dom';
import { EventEditDialog } from '@/components/events/EventEditDialog';
import { ReanalyzeHalfDialog } from '@/components/events/ReanalyzeHalfDialog';
import { ResetMatchDialog } from '@/components/events/ResetMatchDialog';
import { useQueryClient, useQuery } from '@tanstack/react-query';
// Modo 100% Local - sem dependências de Supabase
import { useAuth } from '@/hooks/useAuth';
import { VideoPlayerModal } from '@/components/media/VideoPlayerModal';
import { useMatchAnalysis } from '@/hooks/useMatchAnalysis';
import { useClipGeneration } from '@/hooks/useClipGeneration';
import { TranscriptionAnalysisDialog } from '@/components/events/TranscriptionAnalysisDialog';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getEventTeam, getEventTimeMs as getEventTimeMsHelper, formatEventTime } from '@/lib/eventHelpers';
import { useLiveBroadcastContext } from '@/contexts/LiveBroadcastContext';
import { VideoUploadCard } from '@/components/events/VideoUploadCard';
import { apiClient, normalizeStorageUrl } from '@/lib/apiClient';
import { useDynamicMatchStats } from '@/hooks/useDynamicMatchStats';

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
  thumbnailUrl?: string | null;
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
  awayTeam,
  thumbnailUrl
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
      {/* Thumbnail do evento */}
      {thumbnailUrl ? (
        <div className="relative w-16 h-10 rounded overflow-hidden shrink-0 group-hover:ring-2 ring-primary/50 transition-all">
          <img 
            src={thumbnailUrl} 
            alt={`${event.event_type} ${event.minute}'`}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="h-4 w-4 text-white" />
          </div>
        </div>
      ) : (matchVideo || event.clip_url) ? (
        <div className="flex h-10 w-16 items-center justify-center rounded bg-muted/50 text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors shrink-0">
          <Play className="h-5 w-5" />
        </div>
      ) : null}

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
          {getEventLabel(event.event_type)}
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

// Sync to Cloud button - DISABLED in local mode
// Sistema opera 100% local, dados armazenados no SQLite
interface SyncToCloudButtonProps {
  matchId: string;
  eventsCount: number;
}

const SyncToCloudButton = ({ matchId, eventsCount }: SyncToCloudButtonProps) => {
  const handleSync = () => {
    toast.info('Sistema em modo local. Dados armazenados no SQLite.');
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={eventsCount === 0}
      className="gap-2 opacity-60"
      title="Modo local - dados armazenados no SQLite"
    >
      <CloudUpload className="h-4 w-4" />
      <span className="hidden sm:inline">Local</span>
    </Button>
  );
};

export default function Events() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { analyzeWithTranscription, isAnalyzing: isRefining, ensureMatchSynced } = useMatchAnalysis();
  const { 
    isGenerating, 
    progress: clipProgress, 
    generateAllClips, 
    cancel: cancelClipGeneration,
    reset: resetClipProgress 
  } = useClipGeneration();
  
  // Live broadcast context for realtime updates
  const { isRecording, currentMatchId: liveMatchId } = useLiveBroadcastContext();
  
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
  const [isProcessingMatch, setIsProcessingMatch] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [isRegeneratingClips, setIsRegeneratingClips] = useState(false);
  const [isSyncingMatch, setIsSyncingMatch] = useState(false);
  const [matchSyncStatus, setMatchSyncStatus] = useState<'unknown' | 'synced' | 'local_only' | 'error'>('unknown');
  const [isDiagnosingClips, setIsDiagnosingClips] = useState(false);
  const [clipDiagnosis, setClipDiagnosis] = useState<any>(null);
  const [forceAnalysis, setForceAnalysis] = useState(false);
  const [showDiagnosisDialog, setShowDiagnosisDialog] = useState(false);
  const [isAnalyzingTranscription, setIsAnalyzingTranscription] = useState(false);
  
  const { data: events = [], isLoading: eventsLoading, refetch: refetchEvents } = useMatchEvents(currentMatchId);

  // Polling para atualizar eventos durante live (modo local)
  useEffect(() => {
    if (!currentMatchId) return;
    
    const isLiveMatch = isRecording && liveMatchId === currentMatchId;
    if (!isLiveMatch) return;
    
    // Polling a cada 5 segundos durante transmissão ao vivo
    const interval = setInterval(() => {
      refetchEvents();
    }, 5000);

    return () => clearInterval(interval);
  }, [currentMatchId, refetchEvents, isRecording, liveMatchId]);

  // Check if match has transcription available (SRT files in storage)
  const { data: availableTranscription } = useQuery({
    queryKey: ['match-transcription', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return null;
      try {
        // Check for existing SRT files via local server
        const result = await apiClient.listMatchFiles(currentMatchId);
        const srtFiles = result?.folders?.srt || [];
        
        if (srtFiles.length > 0) {
          // Fetch the first SRT file content via storage endpoint
          const srtFile = srtFiles[0];
          // Use apiClient.get to ensure correct base URL
          try {
            const srtContent = await apiClient.get<string>(`/api/storage/${currentMatchId}/srt/${srtFile.name}`);
          
            return {
              hasTranscription: !!srtContent,
              files: srtFiles,
              content: typeof srtContent === 'string' ? srtContent : null,
              fileName: srtFile.name
            };
          } catch {
            return { hasTranscription: false, files: srtFiles, content: null, fileName: srtFile.name };
          }
        }
        return { hasTranscription: false, files: [], content: null, fileName: null };
      } catch {
        return { hasTranscription: false, files: [], content: null, fileName: null };
      }
    },
    enabled: !!currentMatchId && events.length === 0, // Only check when no events
    staleTime: 60000, // 1 minute
  });

  // Handle analyzing existing transcription
  const handleAnalyzeExistingTranscription = async () => {
    if (!currentMatchId || !selectedMatch || !availableTranscription?.content) {
      toast.error('Nenhuma transcrição disponível para analisar');
      return;
    }

    setIsAnalyzingTranscription(true);
    try {
      const homeTeam = selectedMatch.home_team?.name || 'Casa';
      const awayTeam = selectedMatch.away_team?.name || 'Visitante';
      
      // Determine half type from file name
      const fileName = availableTranscription.fileName || '';
      const halfType = fileName.includes('second') ? 'second' : 'first';
      const startMinute = halfType === 'second' ? 45 : 0;
      const endMinute = halfType === 'second' ? 90 : 45;
      
      console.log('[Events] Analisando transcrição existente:', {
        matchId: currentMatchId,
        halfType,
        contentLength: availableTranscription.content.length
      });
      
      const result = await apiClient.analyzeMatch({
        matchId: currentMatchId,
        transcription: availableTranscription.content,
        homeTeam,
        awayTeam,
        gameStartMinute: startMinute,
        gameEndMinute: endMinute,
        halfType,
        autoClip: true,
        includeSubtitles: true,
        skipValidation: forceAnalysis
      });
      
      if (result?.success) {
        toast.success(`Análise concluída! ${result.events?.length || 0} eventos detectados.`);
        refetchEvents();
        queryClient.invalidateQueries({ queryKey: ['match', currentMatchId] });
      } else {
        toast.error('Análise não retornou eventos');
      }
    } catch (error: any) {
      console.error('[Events] Erro ao analisar transcrição:', error);
      toast.error(`Erro na análise: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsAnalyzingTranscription(false);
    }
  };

  // Handle refine events - simplified
  const handleRefineEvents = async () => {
    toast.info('Use o diálogo "Analisar Transcrição" para refinar eventos');
  };

  // Handle clear all events for match
  const handleClearEvents = async () => {
    if (!currentMatchId) return;
    
    const confirmed = window.confirm(
      'Tem certeza que deseja LIMPAR TODOS os eventos desta partida?\n\nIsso removerá permanentemente todos os eventos detectados.'
    );
    
    if (!confirmed) return;
    
    try {
      const result = await apiClient.delete(`/matches/${currentMatchId}/events`);
      toast.success(`${result.deleted_count || 0} eventos removidos com sucesso`);
      refetchEvents();
      queryClient.invalidateQueries({ queryKey: ['match', currentMatchId] });
    } catch (error) {
      console.error('Erro ao limpar eventos:', error);
      toast.error('Erro ao limpar eventos');
    }
  };

  // Handle manual sync to Cloud
  const handleSyncToCloud = async () => {
    if (!currentMatchId) return;
    
    setIsSyncingMatch(true);
    try {
      const result = await ensureMatchSynced(currentMatchId);
      if (result) {
        setMatchSyncStatus('synced');
        toast.success('Partida sincronizada com Cloud!');
        // Refetch para pegar dados do Cloud
        refetchEvents();
        queryClient.invalidateQueries({ queryKey: ['match', currentMatchId] });
      } else {
        setMatchSyncStatus('error');
        toast.error('Falha ao sincronizar com Cloud');
      }
    } catch (error: any) {
      setMatchSyncStatus('error');
      toast.error(`Erro de sincronização: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsSyncingMatch(false);
    }
  };

  // Handle diagnose clips
  const handleDiagnoseClips = async () => {
    if (!currentMatchId) return;
    setIsDiagnosingClips(true);
    try {
      const result = await apiClient.diagnoseClips(currentMatchId);
      setClipDiagnosis(result);
      setShowDiagnosisDialog(true);
    } catch (error: any) {
      toast.error('Erro ao diagnosticar clips: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsDiagnosingClips(false);
    }
  };

  // Handle regenerate clips via server
  const handleRegenerateClips = async () => {
    if (!currentMatchId) return;
    setIsRegeneratingClips(true);
    try {
      await apiClient.regenerateClips(currentMatchId);
      toast.success('Clips regenerados com sucesso!');
      refetchEvents();
      queryClient.invalidateQueries({ queryKey: ['clips', currentMatchId] });
      queryClient.invalidateQueries({ queryKey: ['thumbnails', currentMatchId] });
    } catch (error: any) {
      console.error('Regenerate clips error:', error);
      toast.error(`Erro ao regenerar clips: ${error.message || 'Servidor local indisponível'}`);
    } finally {
      setIsRegeneratingClips(false);
    }
  };

  // Handle re-analyze match - now requires transcription
  const handleReanalyze = async () => {
    if (!currentMatchId || !selectedMatch) return;
    
    toast.info('Use o diálogo "Analisar Transcrição" para re-analisar a partida com uma transcrição.');
  };

  // Fetch match videos (may have multiple segments) - Modo Local
  const { data: matchVideos } = useQuery({
    queryKey: ['match-videos', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return [];
      try {
        const videos = await apiClient.getVideos(currentMatchId);
        return videos || [];
      } catch {
        return [];
      }
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

  // Fetch thumbnails for events - Modo Local
  const { data: thumbnails = [] } = useQuery({
    queryKey: ['event-thumbnails', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return [];
      try {
        const data = await apiClient.getThumbnails(currentMatchId);
        return data || [];
      } catch {
        return [];
      }
    },
    enabled: !!currentMatchId
  });

  // Check if match is from live recording (to hide VideoUploadCard) - Modo Local
  const { data: analysisJobSource } = useQuery({
    queryKey: ['analysis-job-source', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return null;
      try {
        const jobs = await apiClient.getAnalysisJobs(currentMatchId);
        if (jobs && jobs.length > 0) {
          return jobs[0]; // Retorna o job mais recente
        }
        return null;
      } catch {
        return null;
      }
    },
    enabled: !!currentMatchId
  });

  const isLiveRecordedMatch = (analysisJobSource?.result as any)?.source === 'live';

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

  // Calculate score dynamically using unified hook
  const dynamicStats = useDynamicMatchStats(
    events,
    selectedMatch?.home_team?.name || '',
    selectedMatch?.away_team?.name || ''
  );
  const calculatedScore = dynamicStats.score;

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

  // Group events by half - use minute as PRIMARY criteria, match_half as secondary
  // This ensures events are correctly grouped even if match_half field is wrong
  // Helper to check if event is first half (handles both 'first' and 'first_half' formats)
  const isFirstHalf = (halfValue: string | null | undefined): boolean => {
    if (!halfValue) return false;
    return halfValue === 'first' || halfValue === 'first_half';
  };
  
  const isSecondHalf = (halfValue: string | null | undefined): boolean => {
    if (!halfValue) return false;
    return halfValue === 'second' || halfValue === 'second_half';
  };
  
  const firstHalfEvents = filteredEvents.filter(e => {
    const minute = e.minute || 0;
    const matchHalf = (e as any).match_half;
    const metadataHalf = e.metadata?.half;
    
    // PRIMARY: use minute (most reliable)
    // Events before 45 minutes are first half
    if (minute < 45) return true;
    
    // For minute 45+, check if explicitly marked as first half (stoppage time)
    if (isFirstHalf(matchHalf) || isFirstHalf(metadataHalf)) {
      // Only trust this if minute is close to 45 (stoppage time scenario)
      if (minute >= 45 && minute <= 50) return true;
    }
    
    return false;
  });
  
  const secondHalfEvents = filteredEvents.filter(e => {
    const minute = e.minute || 0;
    const matchHalf = (e as any).match_half;
    const metadataHalf = e.metadata?.half;
    
    // PRIMARY: use minute (most reliable)
    // Events at/after 45 minutes are second half (unless stoppage time)
    if (minute >= 45) {
      // Check if this might be first half stoppage time
      if ((isFirstHalf(matchHalf) || isFirstHalf(metadataHalf)) && minute <= 50) {
        return false; // Stoppage time, keep in first half
      }
      return true;
    }
    
    // Explicitly marked as second half
    if (isSecondHalf(matchHalf) || isSecondHalf(metadataHalf)) return true;
    
    return false;
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
    
    // Calculate the correct video timestamp
    const videoDuration = eventVideo?.duration_seconds;
    const eventVideoSecond = event.metadata?.videoSecond;
    const videoStartMinute = eventVideo?.start_minute ?? 0;
    const eventMinute = event.minute ?? 0;
    
    // Calculate actual video coverage based on duration
    // end_minute from DB might be wrong, use duration_seconds for accuracy
    const videoDurationMinutes = videoDuration ? videoDuration / 60 : 44; // default 44 min for half
    const actualVideoEndMinute = videoStartMinute + videoDurationMinutes;
    
    // Prepare event with calculated videoSecond for the modal
    let processedEvent = { ...event };
    
    // Calculate video-relative position
    // PRIORIDADE 1: Usar videoSecond do metadata se estiver dentro do range do vídeo
    // PRIORIDADE 2: Recalcular apenas se videoSecond não existir ou estiver fora do range
    if (videoDuration) {
      // Se o backend já corrigiu o videoSecond e está dentro da duração do vídeo, usar direto
      if (eventVideoSecond !== undefined && eventVideoSecond !== null && eventVideoSecond <= videoDuration) {
        console.log(`[PLAYER] Usando videoSecond do metadata: ${eventVideoSecond}s (dentro do range de ${videoDuration}s)`);
        processedEvent = { 
          ...processedEvent, 
          metadata: { ...processedEvent.metadata, videoSecond: eventVideoSecond } 
        };
      } 
      // Caso contrário, calcular baseado no minuto do evento
      else {
        console.log(`[PLAYER] videoSecond ausente ou fora do range (${eventVideoSecond}s > ${videoDuration}s), recalculando...`);
        
        if (eventMinute >= videoStartMinute && eventMinute <= actualVideoEndMinute) {
          // Event is within video coverage - calculate offset in seconds
          const offsetSeconds = (eventMinute - videoStartMinute) * 60;
          const calculatedVideoSecond = Math.min(offsetSeconds, videoDuration - 1);
          console.log(`[PLAYER] Calculando offset: minuto ${eventMinute} - start ${videoStartMinute} = ${calculatedVideoSecond}s do vídeo`);
          processedEvent = { 
            ...processedEvent, 
            metadata: { ...processedEvent.metadata, videoSecond: calculatedVideoSecond } 
          };
        } else if (eventMinute < videoStartMinute) {
          // Event before video coverage - start from beginning
          console.warn(`[PLAYER] Evento (minuto ${eventMinute}) antes da cobertura do vídeo (${videoStartMinute})`);
          processedEvent = { 
            ...processedEvent, 
            metadata: { ...processedEvent.metadata, videoSecond: 0 } 
          };
        } else {
          // Event after video coverage - go to end
          console.warn(`[PLAYER] Evento (minuto ${eventMinute}) após da cobertura do vídeo (${actualVideoEndMinute})`);
          processedEvent = { 
            ...processedEvent, 
            metadata: { ...processedEvent.metadata, videoSecond: Math.max(0, videoDuration - 5) } 
          };
        }
      }
    }
    
    console.log('Opening video for event:', {
      eventMinute: processedEvent.minute,
      calculatedVideoSecond: processedEvent.metadata?.videoSecond,
      originalVideoSecond: eventVideoSecond,
      video: eventVideo?.file_url,
      videoStart: videoStartMinute,
      videoEnd: actualVideoEndMinute,
      videoDuration
    });
    
    if (eventVideo || event.clip_url) {
      setShowVignette(false); // Skip vignette, go directly to video
      setPlayingEvent({ ...processedEvent, _video: eventVideo });
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

  // Handle full match processing (transcription + analysis)
  const handleProcessMatch = async () => {
    if (!currentMatchId || !selectedMatch || !matchVideos || matchVideos.length === 0) {
      toast.error('Nenhum vídeo disponível para processar');
      return;
    }

    setIsProcessingMatch(true);
    
    try {
      const homeTeam = selectedMatch.home_team?.name || 'Casa';
      const awayTeam = selectedMatch.away_team?.name || 'Visitante';
      
      for (const video of matchVideos) {
        const videoType = video.video_type || 'full';
        const halfLabel = videoType === 'first_half' ? '1º tempo' : 
                          videoType === 'second_half' ? '2º tempo' : 'vídeo';
        
        // Step 1: Transcribe
        setProcessingStep(`Transcrevendo ${halfLabel}...`);
        console.log(`[ProcessMatch] Transcribing ${videoType}:`, video.file_url);
        
        const transcription = await apiClient.transcribeLargeVideo({
          videoUrl: video.file_url,
          matchId: currentMatchId,
          language: 'pt'
        });
        
        if (!transcription?.text) {
          console.warn(`[ProcessMatch] No transcription for ${videoType}`);
          continue;
        }
        
        console.log(`[ProcessMatch] Transcription received, length: ${transcription.text.length}`);
        
        // Step 2: Analyze
        setProcessingStep(`Analisando ${halfLabel}...`);
        
        const halfType = videoType === 'first_half' ? 'first' : 
                         videoType === 'second_half' ? 'second' : 'first';
        const startMinute = video.start_minute ?? (halfType === 'second' ? 45 : 0);
        const endMinute = video.end_minute ?? (halfType === 'second' ? 90 : 45);
        
        await apiClient.analyzeMatch({
          matchId: currentMatchId,
          transcription: transcription.text,
          homeTeam,
          awayTeam,
          gameStartMinute: startMinute,
          gameEndMinute: endMinute,
          halfType: halfType as 'first' | 'second',
          autoClip: false,
          includeSubtitles: true,
          skipValidation: forceAnalysis
        });
        
        console.log(`[ProcessMatch] Analysis complete for ${videoType}`);
      }
      
      toast.success('Partida processada com sucesso!');
      refetchEvents();
      queryClient.invalidateQueries({ queryKey: ['match', currentMatchId] });
      
    } catch (error: any) {
      console.error('[ProcessMatch] Error:', error);
      toast.error(`Erro no processamento: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsProcessingMatch(false);
      setProcessingStep('');
    }
  };
  const getEventThumbnail = (eventId: string) => {
    const thumb = thumbnails.find(t => t.event_id === eventId);
    return thumb ? { imageUrl: normalizeStorageUrl(thumb.image_url) } : undefined;
  };

  // Handle clip generation - supports multiple videos (first_half, second_half)
  const handleGenerateClips = async (mode: 'highlights' | 'all' | 'selected', limit: number = 20) => {
    if (!currentMatchId || !matchVideos || matchVideos.length === 0) {
      toast.error('Nenhum vídeo disponível para esta partida');
      return;
    }

    // Check if any video is a direct file (not embed)
    const directVideos = matchVideos.filter(v => 
      !v.file_url.includes('embed') && !v.file_url.includes('xtream.tech')
    );
    
    if (directVideos.length === 0) {
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

    // Group events by video (based on match_half or minute)
    const firstHalfVideo = directVideos.find(v => v.video_type === 'first_half') || directVideos[0];
    const secondHalfVideo = directVideos.find(v => v.video_type === 'second_half') || directVideos[0];
    
    // Process first half events
    const firstHalfEventsToProcess = eventsToProcess.filter(e => {
      const eventHalf = (e as any).match_half || e.metadata?.half;
      if (eventHalf) return eventHalf === 'first';
      return (e.minute || 0) < 45;
    }).slice(0, limit);
    
    // Process second half events
    const secondHalfEventsToProcess = eventsToProcess.filter(e => {
      const eventHalf = (e as any).match_half || e.metadata?.half;
      if (eventHalf) return eventHalf === 'second';
      return (e.minute || 0) >= 45;
    }).slice(0, limit);

    // Generate clips for first half
    if (firstHalfEventsToProcess.length > 0 && firstHalfVideo) {
      console.log(`Generating ${firstHalfEventsToProcess.length} clips for first half from video:`, firstHalfVideo.file_url);
      await generateAllClips(
        firstHalfEventsToProcess,
        firstHalfVideo.file_url,
        currentMatchId,
        {
          limit,
          videoStartMinute: firstHalfVideo.start_minute ?? 0,
          videoDurationSeconds: firstHalfVideo.duration_seconds ?? undefined
        }
      );
    }

    // Generate clips for second half
    if (secondHalfEventsToProcess.length > 0 && secondHalfVideo) {
      console.log(`Generating ${secondHalfEventsToProcess.length} clips for second half from video:`, secondHalfVideo.file_url);
      await generateAllClips(
        secondHalfEventsToProcess,
        secondHalfVideo.file_url,
        currentMatchId,
        {
          limit,
          videoStartMinute: secondHalfVideo.start_minute ?? 45, // Second half starts at 45'
          videoDurationSeconds: secondHalfVideo.duration_seconds ?? undefined
        }
      );
    }

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
                <Link to="/upload?mode=new">
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
    <AppLayout key={currentMatchId}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold">Eventos da Partida</h1>
            {/* Data origin indicator */}
            {events.length > 0 && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Server className="h-3 w-3" />
                Servidor Local
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Sync to Cloud button */}
            <SyncToCloudButton matchId={currentMatchId} eventsCount={events.length} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchEvents()}
              title="Atualizar eventos"
              className="h-9 w-9"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Scoreboard Card - formato profissional */}
        {selectedMatch && (
          <Card variant="glass" className="border-primary/20 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 pointer-events-none" />
            <CardContent className="relative py-6">
              <div className="flex items-center justify-between gap-4">
                {/* Home Team */}
                <div className="flex-1 flex flex-col items-center gap-3">
                  <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-lg ring-2 ring-primary/10">
                    <AvatarImage src={selectedMatch.home_team?.logo_url || ''} className="object-contain p-1" />
                    <AvatarFallback className="text-xl font-bold bg-primary/10">
                      {selectedMatch.home_team?.short_name?.slice(0, 2) || 'H'}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-semibold text-center text-sm truncate max-w-[120px]">
                    {selectedMatch.home_team?.name || 'Time Casa'}
                  </p>
                </div>

                {/* Score Display - Calculated from events */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-4">
                    <span className="text-5xl font-black tabular-nums w-14 text-center text-primary">
                      {calculatedScore.home}
                    </span>
                    <span className="text-xl font-bold text-muted-foreground">vs</span>
                    <span className="text-5xl font-black tabular-nums w-14 text-center text-primary">
                      {calculatedScore.away}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedMatch.match_date && (
                      <Badge variant="outline" className="text-xs border-muted-foreground/30">
                        {new Date(selectedMatch.match_date).toLocaleDateString('pt-BR')}
                      </Badge>
                    )}
                    <Badge 
                      variant={selectedMatch.status === 'live' ? 'destructive' : 'success'} 
                      className={selectedMatch.status === 'live' ? 'animate-pulse gap-1' : ''}
                    >
                      {selectedMatch.status === 'live' && <Radio className="h-3 w-3" />}
                      {selectedMatch.status === 'completed' ? 'Finalizado' : 
                       selectedMatch.status === 'live' ? 'AO VIVO' : 
                       selectedMatch.status || 'Em análise'}
                    </Badge>
                  </div>
                </div>

                {/* Away Team */}
                <div className="flex-1 flex flex-col items-center gap-3">
                  <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-lg ring-2 ring-primary/10">
                    <AvatarImage src={selectedMatch.away_team?.logo_url || ''} className="object-contain p-1" />
                    <AvatarFallback className="text-xl font-bold bg-primary/10">
                      {selectedMatch.away_team?.short_name?.slice(0, 2) || 'V'}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-semibold text-center text-sm truncate max-w-[120px]">
                    {selectedMatch.away_team?.name || 'Time Visitante'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons - Clean and organized */}
        {isAdmin && currentMatchId && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Sync Status Indicator & Button */}
            {matchSyncStatus === 'local_only' || matchSyncStatus === 'error' ? (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSyncToCloud}
                disabled={isSyncingMatch}
                className="border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10"
              >
                {isSyncingMatch ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CloudOff className="mr-2 h-4 w-4" />
                )}
                Sincronizar Cloud
              </Button>
            ) : matchSyncStatus === 'synced' ? (
              <Badge variant="outline" className="border-green-500/30 text-green-600 gap-1">
                <Cloud className="h-3 w-3" />
                Sincronizado
              </Badge>
            ) : null}

            {/* Process Match Button - only when no events */}
            {events.length === 0 && matchVideos && matchVideos.length > 0 && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="arena" 
                  onClick={handleProcessMatch}
                  disabled={isProcessingMatch}
                >
                  {isProcessingMatch ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {processingStep || 'Processando...'}
                    </>
                  ) : (
                    <>
                      <Cog className="mr-2 h-4 w-4" />
                      Processar Partida
                    </>
                  )}
                </Button>
                
                {/* Force Analysis Toggle */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant={forceAnalysis ? "secondary" : "ghost"} 
                      size="icon"
                      className={forceAnalysis ? "bg-yellow-500/20 border-yellow-500/50" : ""}
                      title="Opções de análise"
                    >
                      <AlertCircle className={`h-4 w-4 ${forceAnalysis ? "text-yellow-500" : ""}`} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      onClick={() => setForceAnalysis(!forceAnalysis)}
                      className="gap-2"
                    >
                      {forceAnalysis ? (
                        <CheckCircle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>Ignorar validação de times</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* New Event Button */}
            <Button variant="arena" size="sm" onClick={handleCreateEvent}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Evento
            </Button>

            {/* Clips Dropdown - Main clip actions */}
            {matchVideo && !matchVideo.file_url.includes('embed') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" disabled={isGenerating}>
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
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => handleGenerateClips('highlights', 10)}>
                    <Target className="mr-2 h-4 w-4" />
                    Highlights (gols, cartões)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleGenerateClips('all', 20)}>
                    <Film className="mr-2 h-4 w-4" />
                    Todos (máx 20)
                  </DropdownMenuItem>
                  {eventsWithoutClips > 0 && (
                    <DropdownMenuItem onClick={() => handleGenerateClips('all', eventsWithoutClips)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerar ({eventsWithoutClips} sem clip)
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem 
                    onClick={async () => {
                      if (!currentMatchId) return;
                      setIsRegeneratingClips(true);
                      try {
                        const result = await apiClient.regenerateClips(currentMatchId, {
                          use_category_timings: true,
                          force_subtitles: true
                        });
                        toast.success(
                          `${result.regenerated} clips regenerados com novos tempos por categoria`,
                          { description: `Gols: 35s, Defesas: 20s, Faltas: 13s...` }
                        );
                        refetchEvents();
                        queryClient.invalidateQueries({ queryKey: ['clips', currentMatchId] });
                      } catch (error: any) {
                        toast.error(`Erro ao regenerar clips: ${error.message || 'Erro desconhecido'}`);
                      } finally {
                        setIsRegeneratingClips(false);
                      }
                    }}
                    disabled={isRegeneratingClips}
                  >
                    {isRegeneratingClips ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Cog className="mr-2 h-4 w-4" />
                    )}
                    Regenerar (30s por categoria)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Regenerate Clips Button - Always visible when there are pending clips */}
            {eventsWithoutClips > 0 && (
              <Button 
                variant="secondary" 
                size="sm"
                onClick={async () => {
                  if (!currentMatchId) return;
                  setIsRegeneratingClips(true);
                  try {
                    toast.info('Regenerando clips no servidor local...', { duration: 3000 });
                    const result = await apiClient.regenerateClips(currentMatchId, {
                      use_category_timings: true,
                      force_subtitles: true
                    });
                    toast.success(
                      `${result.regenerated} clips gerados com sucesso!`,
                      { description: `Todos os clips com 30 segundos de duração` }
                    );
                    refetchEvents();
                    queryClient.invalidateQueries({ queryKey: ['clips', currentMatchId] });
                    queryClient.invalidateQueries({ queryKey: ['thumbnails', currentMatchId] });
                  } catch (error: any) {
                    console.error('Regenerate clips error:', error);
                    toast.error(`Erro ao regenerar clips: ${error.message || 'Servidor local indisponível'}`);
                  } finally {
                    setIsRegeneratingClips(false);
                  }
                }}
                disabled={isRegeneratingClips}
                className="bg-primary/10 border-primary/30 hover:bg-primary/20"
              >
                {isRegeneratingClips ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Film className="mr-2 h-4 w-4" />
                )}
                Gerar Clips ({eventsWithoutClips})
              </Button>
            )}

            {/* Diagnose Clips */}
            {events.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleDiagnoseClips}
                disabled={isDiagnosingClips}
              >
                {isDiagnosingClips ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Stethoscope className="mr-2 h-4 w-4" />
                )}
                Diagnosticar
              </Button>
            )}

            {/* Analyze Audio */}
            <TranscriptionAnalysisDialog
              matchId={currentMatchId}
              homeTeamName={selectedMatch?.home_team?.name || 'Casa'}
              awayTeamName={selectedMatch?.away_team?.name || 'Visitante'}
              onAnalysisComplete={() => {
                refetchEvents();
                queryClient.invalidateQueries({ queryKey: ['match', currentMatchId] });
              }}
            >
              <Button variant="secondary" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Analisar Áudio
              </Button>
            </TranscriptionAnalysisDialog>

            {/* Reset All - Danger action */}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowResetDialog(true)}
              disabled={!matchVideos || matchVideos.length === 0}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refazer
            </Button>

            {/* Clear Events */}
            {events.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleClearEvents}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Limpar
              </Button>
            )}
          </div>
        )}

        {/* Alert: Transcription available but no events detected */}
        {events.length === 0 && availableTranscription?.hasTranscription && currentMatchId && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-yellow-500/10">
                  <FileText className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="font-medium text-yellow-600">Transcrição disponível</p>
                  <p className="text-sm text-muted-foreground">
                    {availableTranscription.files?.length || 1} arquivo(s) SRT encontrado(s). Clique para analisar e detectar eventos automaticamente.
                  </p>
                </div>
              </div>
              <Button 
                onClick={handleAnalyzeExistingTranscription}
                disabled={isAnalyzingTranscription}
                className="shrink-0"
              >
                {isAnalyzingTranscription ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Brain className="mr-2 h-4 w-4" />
                    Analisar com IA
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

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

        {/* Server Clip Regeneration Progress */}
        {isRegeneratingClips && (
          <Card variant="glass" className="border-primary/30 animate-pulse">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Gerando clips no servidor local...</p>
                  <p className="text-xs text-muted-foreground">
                    {eventsWithoutClips} eventos sendo processados com clips de 30 segundos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Stats Overview - Compact */}
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          <Card variant="glow" className="py-2">
            <CardContent className="flex items-center gap-3 py-2 px-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                <Target className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gols</p>
                <p className="font-display text-xl font-bold">{eventCounts.goals}</p>
              </div>
            </CardContent>
          </Card>

          <Card variant="glow" className="py-2">
            <CardContent className="flex items-center gap-3 py-2 px-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10">
                <Zap className="h-4 w-4 text-yellow-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Finalizações</p>
                <p className="font-display text-xl font-bold">{eventCounts.shots}</p>
              </div>
            </CardContent>
          </Card>

          <Card variant="glow" className="py-2">
            <CardContent className="flex items-center gap-3 py-2 px-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Faltas</p>
                <p className="font-display text-xl font-bold">{eventCounts.fouls}</p>
              </div>
            </CardContent>
          </Card>

          <Card variant="glow" className="py-2">
            <CardContent className="flex items-center gap-3 py-2 px-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Táticos</p>
                <p className="font-display text-xl font-bold">{eventCounts.tactical}</p>
              </div>
            </CardContent>
          </Card>

          {/* Admin: Pending approval count */}
          {isAdmin && (
            <>
              <Card variant="glow" className="py-2 border-yellow-500/30">
                <CardContent className="flex items-center gap-3 py-2 px-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10">
                    <Clock className="h-4 w-4 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pendentes</p>
                    <p className="font-display text-xl font-bold">{eventCounts.pending}</p>
                  </div>
                </CardContent>
              </Card>

              <Card variant="glow" className="py-2 border-green-500/30">
                <CardContent className="flex items-center gap-3 py-2 px-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Aprovados</p>
                    <p className="font-display text-xl font-bold">{eventCounts.approved}</p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Video Upload Card - Show only for non-live matches without videos */}
        {currentMatchId && (!matchVideos || matchVideos.length === 0) && events.length > 0 && !isLiveRecordedMatch && (
          <VideoUploadCard
            matchId={currentMatchId}
            eventsCount={events.length}
            onVideoUploaded={() => {
              queryClient.invalidateQueries({ queryKey: ['match-videos', currentMatchId] });
              refetchEvents();
              toast.success('Vídeo vinculado aos eventos!');
            }}
          />
        )}
        
        {/* Info card for live-recorded matches without clips */}
        {currentMatchId && isLiveRecordedMatch && (!matchVideos || matchVideos.length === 0) && events.length > 0 && (
          <Card variant="glass" className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="flex items-center gap-3 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Radio className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="font-medium text-blue-400">Partida Gravada ao Vivo</p>
                <p className="text-sm text-muted-foreground">
                  Os clips são gerados automaticamente durante a transmissão.
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
                            thumbnailUrl={getEventThumbnail(event.id)?.imageUrl}
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
                            thumbnailUrl={getEventThumbnail(event.id)?.imageUrl}
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

            {/* Videos Info Card */}
            {matchVideos && matchVideos.length > 0 && (
              <Card variant="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5 text-primary" />
                    Vídeos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {matchVideos.map((video, index) => (
                    <div key={video.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {video.video_type === 'first_half' ? '1º Tempo' : 
                         video.video_type === 'second_half' ? '2º Tempo' : 
                         `Vídeo ${index + 1}`}
                      </span>
                      <Badge variant="outline">
                        {video.duration_seconds ? `${Math.floor(video.duration_seconds / 60)}min` : 'N/A'}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Clip Status Summary */}
            {events.length > 0 && (
              <Card variant="glass" className={eventsWithoutClips > 0 ? 'border-yellow-500/30' : 'border-green-500/30'}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Film className="h-5 w-5 text-primary" />
                    Clips
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Com clip</span>
                    </div>
                    <Badge variant="success">{eventsWithClips}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">Sem clip</span>
                    </div>
                    <Badge variant="warning">{eventsWithoutClips}</Badge>
                  </div>
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div 
                        className="h-full bg-gradient-to-r from-green-500 to-primary transition-all" 
                        style={{ 
                          width: `${events.length > 0 ? (eventsWithClips / events.length) * 100 : 0}%` 
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      {events.length > 0 ? Math.round((eventsWithClips / events.length) * 100) : 0}% completo
                    </p>
                  </div>
                  {eventsWithoutClips > 0 && matchVideo && !matchVideo.file_url.includes('embed') && (
                    <Button
                      variant="arena"
                      size="sm"
                      className="w-full"
                      onClick={() => handleGenerateClips('all', eventsWithoutClips)}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Scissors className="h-4 w-4 mr-2" />
                      )}
                      Gerar {eventsWithoutClips} clips
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
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
            clipUrl: normalizeStorageUrl(playingEvent.clip_url),
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

        {/* Clip Diagnosis Dialog */}
        <Dialog open={showDiagnosisDialog} onOpenChange={setShowDiagnosisDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Diagnóstico de Clips
              </DialogTitle>
            </DialogHeader>
            
            {clipDiagnosis && (
              <div className="space-y-4">
                {/* Health Score */}
                <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                  <div className={`text-4xl font-bold ${
                    clipDiagnosis.summary.health_score >= 80 ? 'text-green-500' :
                    clipDiagnosis.summary.health_score >= 50 ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {clipDiagnosis.summary.health_score}%
                  </div>
                  <div className="flex-1">
                    <Progress value={clipDiagnosis.summary.health_score} />
                    <p className="text-sm text-muted-foreground mt-1">
                      Score de Saúde da Partida
                    </p>
                  </div>
                </div>
                
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-green-500/10 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-500">
                      {clipDiagnosis.summary.valid_clips}
                    </div>
                    <div className="text-xs text-muted-foreground">Clips OK</div>
                  </div>
                  <div className="p-3 bg-yellow-500/10 rounded-lg text-center">
                    <div className="text-2xl font-bold text-yellow-500">
                      {clipDiagnosis.summary.missing_clips}
                    </div>
                    <div className="text-xs text-muted-foreground">Faltando</div>
                  </div>
                  <div className="p-3 bg-red-500/10 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-500">
                      {clipDiagnosis.summary.corrupted_clips}
                    </div>
                    <div className="text-xs text-muted-foreground">Corrompidos</div>
                  </div>
                </div>
                
                {/* Recommendations */}
                {clipDiagnosis.recommendations?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold">Recomendações</h4>
                    {clipDiagnosis.recommendations.map((rec: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-muted rounded text-sm">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Events without clips */}
                {clipDiagnosis.events_without_clips?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-yellow-500">
                      Eventos sem Clip ({clipDiagnosis.events_without_clips.length})
                    </h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {clipDiagnosis.events_without_clips.map((evt: any) => (
                        <div key={evt.id} className="text-sm p-2 bg-muted rounded flex justify-between">
                          <span>{evt.minute}' - {evt.event_type}</span>
                          <span className="text-muted-foreground truncate max-w-[200px]">
                            {evt.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Corrupted clips */}
                {clipDiagnosis.corrupted_clips?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-red-500">
                      Clips Corrompidos ({clipDiagnosis.corrupted_clips.length})
                    </h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {clipDiagnosis.corrupted_clips.map((evt: any) => (
                        <div key={evt.id} className="text-sm p-2 bg-muted rounded flex justify-between">
                          <span>{evt.minute}' - {evt.event_type}</span>
                          <span className="text-red-400 text-xs">{evt.issue}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Regenerate button */}
                {(clipDiagnosis.summary.missing_clips > 0 || clipDiagnosis.summary.corrupted_clips > 0) && (
                  <Button 
                    onClick={() => {
                      setShowDiagnosisDialog(false);
                      handleRegenerateClips();
                    }}
                    className="w-full"
                    variant="arena"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerar Clips ({clipDiagnosis.summary.missing_clips + clipDiagnosis.summary.corrupted_clips})
                  </Button>
                )}

                {/* All OK message */}
                {clipDiagnosis.summary.missing_clips === 0 && clipDiagnosis.summary.corrupted_clips === 0 && (
                  <div className="p-4 bg-green-500/10 rounded-lg text-center">
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <p className="text-green-500 font-medium">Todos os clips estão OK!</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
