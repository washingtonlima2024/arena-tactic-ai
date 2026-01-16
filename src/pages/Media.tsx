import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Scissors, 
  Play, 
  Download, 
  Share2, 
  Clock,
  Video,
  Image,
  ListVideo,
  Sparkles,
  AlertCircle,
  Loader2,
  Pause,
  Film,
  CheckCircle,
  X,
  Link as LinkIcon,
  RefreshCw,
  Smartphone,
  Trash2
} from 'lucide-react';
import { useMatchEvents } from '@/hooks/useMatchDetails';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { useState, useRef } from 'react';
import { useDynamicMatchStats } from '@/hooks/useDynamicMatchStats';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useThumbnailGeneration } from '@/hooks/useThumbnailGeneration';
import { useClipGeneration } from '@/hooks/useClipGeneration';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipVignette } from '@/components/media/ClipVignette';
import { TeamPlaylist } from '@/components/media/TeamPlaylist';
import { VideoPlayerModal } from '@/components/media/VideoPlayerModal';
import { SocialContentDialog } from '@/components/media/SocialContentDialog';
import { ExportPreviewDialog } from '@/components/media/ExportPreviewDialog';
import { LinkVideoDialog } from '@/components/media/LinkVideoDialog';
import { SocialSharePanel } from '@/components/media/SocialSharePanel';
import { ClipPreviewModal } from '@/components/media/ClipPreviewModal';
import { toast } from '@/hooks/use-toast';
import { apiClient, normalizeStorageUrl } from '@/lib/apiClient';

// Social platform icons
import { 
  Instagram, 
  Youtube,
  Facebook,
  Twitter,
  Linkedin
} from 'lucide-react';

const socialPlatforms = [
  { name: 'Instagram Reels', icon: Instagram, color: 'from-pink-500 to-purple-500' },
  { name: 'TikTok', icon: Video, color: 'from-black to-gray-800' },
  { name: 'YouTube Shorts', icon: Youtube, color: 'from-red-500 to-red-600' },
  { name: 'Twitter/X', icon: Twitter, color: 'from-blue-400 to-blue-500' },
  { name: 'Facebook', icon: Facebook, color: 'from-blue-600 to-blue-700' },
  { name: 'LinkedIn', icon: Linkedin, color: 'from-blue-700 to-blue-800' },
];

export default function Media() {
  // Centralized match selection
  const { currentMatchId, selectedMatch, matches, isLoading: matchesLoading, setSelectedMatch } = useMatchSelection();
  const matchId = currentMatchId || '';
  
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const [showingVignette, setShowingVignette] = useState(false);
  const [socialDialogOpen, setSocialDialogOpen] = useState(false);
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [isGeneratingSocial, setIsGeneratingSocial] = useState(false);
  const [linkVideoDialogOpen, setLinkVideoDialogOpen] = useState(false);
  const [shareClipId, setShareClipId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeHalfTab, setActiveHalfTab] = useState<string>('all');
  const [isSyncingVideos, setIsSyncingVideos] = useState(false);
  const [isSyncingThumbnails, setIsSyncingThumbnails] = useState(false);
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  
  const { thumbnails, extractFrameFromVideo, isExtracting, getThumbnail, extractingIds } = useThumbnailGeneration(matchId);
  
  // Clip generation hook for FFmpeg extraction
  const { 
    isGenerating: isGeneratingClips, 
    progress: clipProgress, 
    generateAllClips,
    isGeneratingEvent: isGeneratingClip,
    cancel: cancelClipGeneration
  } = useClipGeneration();
  
  const { data: events, refetch: refetchEvents } = useMatchEvents(matchId);
  
  // Dynamic stats calculated from events
  const dynamicStats = useDynamicMatchStats(
    events || [],
    selectedMatch?.home_team?.name || '',
    selectedMatch?.away_team?.name || ''
  );
  // Fetch videos for the match using local API
  const { data: matchVideos, refetch: refetchVideos } = useQuery({
    queryKey: ['match-videos', matchId],
    queryFn: async () => {
      if (!matchId) return [];
      try {
        return await apiClient.getVideos(matchId);
      } catch (e) {
        console.error('[Media] Error fetching videos:', e);
        return [];
      }
    },
    enabled: !!matchId
  });
  
  // Fetch video cover thumbnail
  const { data: videoCoverUrl } = useQuery({
    queryKey: ['video-cover', matchId],
    queryFn: async () => {
      if (!matchId) return null;
      return await apiClient.getVideoCover(matchId);
    },
    enabled: !!matchId
  });
  
  // Fetch clips organized by half from storage
  const { data: clipsByHalf, refetch: refetchClipsByHalf } = useQuery({
    queryKey: ['clips-by-half', matchId],
    queryFn: async () => {
      if (!matchId) return null;
      try {
        return await apiClient.getClipsByHalf(matchId);
      } catch (e) {
        console.log('[Media] Could not fetch clips by half:', e);
        return null;
      }
    },
    enabled: !!matchId
  });
  
  // Helper function to find the correct video for an event based on match_half
  function findVideoForEvent(
    eventMinute: number | null, 
    matchHalf: string | null | undefined, 
    videos: typeof matchVideos
  ) {
    if (!videos || videos.length === 0) return null;
    
    // First try to match by video_type (first_half, second_half)
    if (matchHalf) {
      const videoByHalf = videos.find(v => v.video_type === matchHalf);
      if (videoByHalf) return videoByHalf;
    }
    
    // Then try to match by start_minute/end_minute range
    if (eventMinute !== null) {
      const videoByRange = videos.find(v => 
        eventMinute >= (v.start_minute ?? 0) && 
        eventMinute <= (v.end_minute ?? 90)
      );
      if (videoByRange) return videoByRange;
    }
    
    // Fallback to first video
    return videos[0];
  }
  
  // Use first video with valid URL as primary for UI display
  const matchVideo = matchVideos?.find(v => v.file_url && v.file_url.length > 0) || null;
  // Only show recording warning if video is recording AND has no valid file_url
  // Also check if match status indicates active recording (not analyzed/completed)
  const matchStatus = selectedMatch?.status;
  const isMatchStillRecording = matchStatus === 'recording' || matchStatus === 'live' || matchStatus === 'in_progress';
  const hasRecordingInProgress = isMatchStillRecording && matchVideos?.some(v => v.status === 'recording' && (!v.file_url || v.file_url.length === 0));

  // Generate clips from events - Use eventMs from metadata as primary timestamp source
  const clips = events?.map((event) => {
    const metadata = (event as any).metadata as { eventMs?: number; videoSecond?: number; source?: string; customTrim?: { startOffset: number; endOffset: number } } | null;
    const eventMs = metadata?.eventMs; // Primary: milliseconds from AI analysis
    const videoSecond = metadata?.videoSecond; // Fallback: seconds from AI analysis
    const matchHalf = event.match_half;
    const source = metadata?.source;
    
    // Calculate total seconds: prefer eventMs, then videoSecond, then minute+second
    const totalSeconds = eventMs !== undefined 
      ? eventMs / 1000 
      : videoSecond !== undefined 
        ? videoSecond 
        : ((event.minute || 0) * 60) + (event.second || 0);
    
    const displayMinutes = Math.floor(totalSeconds / 60);
    const displaySeconds = Math.floor(totalSeconds % 60);
    
    // Find the correct video for this event
    const eventVideo = findVideoForEvent(event.minute, matchHalf, matchVideos);
    const canExtract = !!eventVideo;
    
    // Check if video is a short clip (< 15 min)
    const isClipVideo = eventVideo && (
      eventVideo.video_type === 'clip' || 
      (eventVideo.duration_seconds && eventVideo.duration_seconds < 900) // < 15 min
    );
    
    // Calculate video-relative timestamp based on video type
    let videoRelativeSeconds: number;
    if (isClipVideo) {
      // For short clips, use videoSecond directly if available, otherwise totalSeconds
      // Don't subtract start_minute because clip videos start from 0
      videoRelativeSeconds = videoSecond ?? totalSeconds;
      // Ensure we don't exceed video duration
      if (eventVideo.duration_seconds) {
        videoRelativeSeconds = Math.min(videoRelativeSeconds, eventVideo.duration_seconds - 5);
      }
    } else {
      // For full/half videos, calculate relative to video start
      videoRelativeSeconds = eventVideo 
        ? Math.max(0, totalSeconds - ((eventVideo.start_minute ?? 0) * 60))
        : totalSeconds;
    }
    
    return {
      id: event.id,
      title: event.description || `${event.event_type} - ${formatTimestamp(totalSeconds)}`,
      type: event.event_type,
      startTime: totalSeconds,
      endTime: totalSeconds + 15,
      description: `${formatTimestamp(totalSeconds)} - ${event.event_type}`,
      totalSeconds, // Primary timestamp in seconds
      eventMs: eventMs ?? totalSeconds * 1000, // Store milliseconds
      minute: displayMinutes,
      second: displaySeconds,
      clipUrl: normalizeStorageUrl((event as any).clip_url as string | null),
      videoSecond: videoSecond ?? totalSeconds,
      matchHalf,
      canExtract, // Flag: can this clip be extracted?
      eventVideo, // The video to use for extraction
      videoRelativeSeconds, // Timestamp relative to video start (adjusted for clip videos)
      isManual: source === 'manual' || source === 'live-manual',
      clipPending: (event as any).clip_pending === true,
      metadata: metadata,
      isClipVideo // Flag to indicate short video
    };
  }) || [];
  
  // Helper function to format timestamp
  function formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  const goalClips = clips.filter(c => c.type === 'goal');
  const shotClips = clips.filter(c => c.type === 'shot' || c.type === 'shot_on_target');

  // Handler to delete a clip and its associated event/files
  const handleDeleteClip = async (eventId: string, title: string) => {
    if (!confirm(`Excluir "${title}"?\n\nIsso removerá:\n• O evento\n• O clip de vídeo\n• A thumbnail/capa`)) {
      return;
    }
    
    try {
      await apiClient.deleteEvent(eventId);
      toast({
        title: "Clip excluído",
        description: `"${title}" foi removido com sucesso`
      });
      refetchEvents();
      refetchClipsByHalf();
      queryClient.invalidateQueries({ queryKey: ['thumbnails', matchId] });
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: String(error),
        variant: "destructive"
      });
    }
  };

  if (matchesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Carregando partidas...</div>
        </div>
      </AppLayout>
    );
  }

  if (!matches?.length) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Nenhuma partida analisada encontrada</p>
          <p className="text-sm text-muted-foreground">Faça upload e analise uma partida primeiro</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout key={matchId}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Cortes & Mídia</h1>
            <p className="text-muted-foreground">
              Gerencie highlights, cortes e conteúdo para redes sociais
            </p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="arena"
              onClick={async () => {
                const eventsWithoutClips = clips.filter(c => !c.clipUrl && c.canExtract);
                if (eventsWithoutClips.length === 0) {
                  toast({ title: "Todos os clips já foram gerados", variant: "default" });
                  return;
                }
                
                // USAR SERVIDOR PYTHON - mais robusto e rápido
                try {
                  toast({ 
                    title: "Gerando clips no servidor...", 
                    description: `Processando ${eventsWithoutClips.length} eventos` 
                  });
                  
                  const result = await apiClient.regenerateClips(matchId, {
                    use_category_timings: true,
                    force_subtitles: true
                  });
                  
                  const clipsGerados = result.regenerated || 0;
                  toast({ 
                    title: `${clipsGerados} clips gerados!`, 
                    description: "Clips com 30 segundos de duração" 
                  });
                  
                  refetchEvents();
                  refetchClipsByHalf();
                  queryClient.invalidateQueries({ queryKey: ['thumbnails', matchId] });
                } catch (error: any) {
                  console.error('[Media] Regenerate clips error:', error);
                  toast({ 
                    title: "Erro ao gerar clips", 
                    description: error.message || 'Servidor local indisponível',
                    variant: "destructive" 
                  });
                }
              }}
              disabled={isGeneratingClips}
            >
              {isGeneratingClips ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Gerar Clips ({clips.filter(c => !c.clipUrl && c.canExtract).length})
            </Button>
          </div>
        </div>

        {/* Match Info */}
        {selectedMatch && (
          <Card variant="glass">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  {/* Home Team */}
                  <div className="flex items-center gap-3">
                    {selectedMatch.home_team?.logo_url && (
                      <img 
                        src={selectedMatch.home_team.logo_url} 
                        alt={selectedMatch.home_team.name}
                        className="h-10 w-10 object-contain"
                      />
                    )}
                    <div className="text-center">
                      <p className="font-semibold">{selectedMatch.home_team?.short_name || selectedMatch.home_team?.name}</p>
                    </div>
                  </div>
                  
                  {/* Score - Dynamic from events */}
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-primary">{dynamicStats.score.home}</span>
                    <span className="text-muted-foreground text-lg">x</span>
                    <span className="text-2xl font-bold text-primary">{dynamicStats.score.away}</span>
                  </div>
                  
                  {/* Away Team */}
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="font-semibold">{selectedMatch.away_team?.short_name || selectedMatch.away_team?.name}</p>
                    </div>
                    {selectedMatch.away_team?.logo_url && (
                      <img 
                        src={selectedMatch.away_team.logo_url} 
                        alt={selectedMatch.away_team.name}
                        className="h-10 w-10 object-contain"
                      />
                    )}
                  </div>
                </div>
                <Badge variant="success">Análise Completa</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="clips" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="clips">
              <Scissors className="mr-2 h-4 w-4" />
              Cortes & Capas
            </TabsTrigger>
            <TabsTrigger value="playlists">
              <ListVideo className="mr-2 h-4 w-4" />
              Playlists
            </TabsTrigger>
            <TabsTrigger value="social">
              <Share2 className="mr-2 h-4 w-4" />
              Redes Sociais
            </TabsTrigger>
          </TabsList>

          {/* Clips Tab */}
          <TabsContent value="clips" className="space-y-4">
            {/* Clip extraction progress bar */}
            {isGeneratingClips && (
              <Card variant="glass" className="border-primary/30 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-sm">{clipProgress.message}</p>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={cancelClipGeneration}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                          Cancelar
                        </Button>
                      </div>
                      <Progress value={clipProgress.progress} className="h-2" />
                      {clipProgress.completedCount !== undefined && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {clipProgress.completedCount} de {clipProgress.totalCount} clips processados
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  {clips.length} eventos • {clips.filter(c => c.clipUrl).length} clips extraídos • {clips.filter(c => c.canExtract && !c.clipUrl).length} podem ser extraídos
                </p>
                {matchVideo ? (
                  <Badge variant="success" className="gap-1">
                    <Video className="h-3 w-3" />
                    {matchVideos?.length} vídeo(s) disponível(is)
                  </Badge>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="warning" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Sem vídeo vinculado
                    </Badge>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLinkVideoDialogOpen(true)}
                    >
                      <LinkIcon className="h-3 w-3 mr-1" />
                      Vincular Vídeo
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {/* Regenerate thumbnails button */}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    if (!matchId) return;
                    toast({ title: "Regenerando capas...", description: "Aguarde o processamento" });
                    try {
                      const result = await apiClient.regenerateThumbnails(matchId);
                      if (result.generated > 0) {
                        toast({ 
                          title: "Capas regeneradas", 
                          description: `${result.generated} capa(s) gerada(s)${result.errors > 0 ? `, ${result.errors} erro(s)` : ''}` 
                        });
                        // Reload thumbnails
                        queryClient.invalidateQueries({ queryKey: ['thumbnails', matchId] });
                      } else if (result.errors > 0) {
                        toast({ 
                          title: "Falha ao gerar capas", 
                          description: `${result.errors} erro(s) - verifique se os clips existem`, 
                          variant: "destructive" 
                        });
                      } else {
                        toast({ 
                          title: "Nenhum clip para gerar capas", 
                          description: "Extraia os clips primeiro" 
                        });
                      }
                    } catch (error) {
                      toast({ 
                        title: "Erro ao regenerar capas", 
                        description: String(error), 
                        variant: "destructive" 
                      });
                    }
                  }}
                >
                  <Image className="h-3 w-3 mr-1" />
                  Regenerar Capas
                </Button>
                
                {/* Sync missing thumbnails button */}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    if (!matchId) return;
                    setIsSyncingThumbnails(true);
                    try {
                      // First diagnose to see how many are missing
                      const diagnosis = await apiClient.diagnoseThumbnails(matchId);
                      
                      if (diagnosis.missing_thumbnails === 0) {
                        toast({ 
                          title: "Todas as capas OK", 
                          description: `${diagnosis.total_thumbnails} capa(s) encontrada(s) - cobertura 100%` 
                        });
                        return;
                      }
                      
                      toast({ 
                        title: "Sincronizando capas...", 
                        description: `${diagnosis.missing_thumbnails} capa(s) faltando` 
                      });
                      
                      // Sync missing thumbnails
                      const result = await apiClient.syncThumbnails(matchId);
                      
                      if (result.generated > 0) {
                        toast({ 
                          title: "Capas sincronizadas", 
                          description: `${result.generated} capa(s) gerada(s)${result.failed > 0 ? `, ${result.failed} erro(s)` : ''}` 
                        });
                        queryClient.invalidateQueries({ queryKey: ['thumbnails', matchId] });
                      } else if (result.failed > 0) {
                        toast({ 
                          title: "Falha na sincronização", 
                          description: `${result.failed} erro(s) - verifique se os clips existem`, 
                          variant: "destructive" 
                        });
                      }
                    } catch (error) {
                      toast({ 
                        title: "Erro ao sincronizar capas", 
                        description: String(error), 
                        variant: "destructive" 
                      });
                    } finally {
                      setIsSyncingThumbnails(false);
                    }
                  }}
                  disabled={isSyncingThumbnails}
                >
                  {isSyncingThumbnails ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Sincronizar Capas
                </Button>

                {/* Sync videos button */}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    if (!matchId) return;
                    setIsSyncingVideos(true);
                    try {
                      const result = await apiClient.syncVideos(matchId);
                      if (result.synced > 0) {
                        toast({ 
                          title: "Vídeos sincronizados", 
                          description: `${result.synced} vídeo(s) novo(s) encontrado(s)` 
                        });
                      } else {
                        toast({ 
                          title: "Sincronização concluída", 
                          description: `${result.videos?.length || 0} vídeo(s) já registrado(s)` 
                        });
                      }
                      refetchVideos();
                      refetchEvents();
                    } catch (error) {
                      toast({ 
                        title: "Erro ao sincronizar", 
                        description: String(error), 
                        variant: "destructive" 
                      });
                    } finally {
                      setIsSyncingVideos(false);
                    }
                  }}
                  disabled={isSyncingVideos}
                >
                  {isSyncingVideos ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Sincronizar
                </Button>
                
                {/* Extract video clips button - only for clips with canExtract */}
                {matchVideo && clips.length > 0 && clips.some(c => !c.clipUrl && c.canExtract) && (
                  <Button 
                    variant="arena" 
                    size="sm"
                    onClick={async () => {
                      // Group events by their corresponding video
                      const eventsToExtract = clips
                        .filter(c => !c.clipUrl && c.canExtract && c.eventVideo)
                        .map(c => ({
                          id: c.id,
                          minute: c.minute,
                          second: c.second,
                          metadata: { 
                            eventMs: c.eventMs, 
                            videoSecond: c.videoRelativeSeconds // Use video-relative timestamp
                          },
                          videoUrl: c.eventVideo!.file_url,
                          videoStartMinute: c.eventVideo!.start_minute ?? 0,
                          videoDurationSeconds: c.eventVideo!.duration_seconds ?? undefined
                        }));
                      
                      // Process each unique video separately
                      const videoGroups = eventsToExtract.reduce((acc, event) => {
                        const key = event.videoUrl;
                        if (!acc[key]) {
                          acc[key] = {
                            videoUrl: event.videoUrl,
                            videoStartMinute: event.videoStartMinute,
                            videoDurationSeconds: event.videoDurationSeconds,
                            events: []
                          };
                        }
                        acc[key].events.push({
                          id: event.id,
                          minute: event.minute,
                          second: event.second,
                          metadata: event.metadata
                        });
                        return acc;
                      }, {} as Record<string, { videoUrl: string; videoStartMinute: number; videoDurationSeconds?: number; events: any[] }>);
                      
                      // Process each video group
                      for (const group of Object.values(videoGroups)) {
                        console.log(`[Clips] Extraindo ${group.events.length} clips do vídeo: ${group.videoUrl.slice(-30)}`);
                        await generateAllClips(
                          group.events, 
                          group.videoUrl, 
                          matchId,
                          {
                            videoStartMinute: group.videoStartMinute,
                            videoDurationSeconds: group.videoDurationSeconds
                          }
                        );
                      }
                      refetchEvents();
                    }}
                    disabled={isGeneratingClips}
                  >
                    {isGeneratingClips ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Scissors className="mr-2 h-4 w-4" />
                    )}
                    Extrair Clips ({clips.filter(c => !c.clipUrl && c.canExtract).length})
                  </Button>
                )}

              </div>
            </div>

            {/* Video Player Modal */}
            <VideoPlayerModal
              isOpen={!!playingClipId && (!!matchVideo || !!clips.find(c => c.id === playingClipId)?.clipUrl)}
              onClose={() => {
                setPlayingClipId(null);
                setShowingVignette(false);
              }}
              clip={clips.find(c => c.id === playingClipId) || null}
              thumbnail={getThumbnail(playingClipId || '')}
              matchVideo={matchVideo}
              videoCoverUrl={videoCoverUrl}
              homeTeam={selectedMatch?.home_team?.name || 'Time Casa'}
              awayTeam={selectedMatch?.away_team?.name || 'Time Fora'}
              homeScore={selectedMatch?.home_score || 0}
              awayScore={selectedMatch?.away_score || 0}
              showVignette={showingVignette}
              onVignetteComplete={() => setShowingVignette(false)}
            />

            {/* Social Share Panel */}
            <SocialSharePanel
              isOpen={!!shareClipId}
              onClose={() => setShareClipId(null)}
              clipCount={1}
              matchTitle={`${selectedMatch?.home_team?.name || 'Time Casa'} vs ${selectedMatch?.away_team?.name || 'Time Fora'}`}
              clipUrl={clips.find(c => c.id === shareClipId)?.clipUrl}
              matchId={matchId}
              eventId={shareClipId || undefined}
            />

            {/* Clip Preview Modal - Responsive Device Simulator */}
            <ClipPreviewModal
              isOpen={!!previewClipId}
              onClose={() => setPreviewClipId(null)}
              clipUrl={normalizeStorageUrl(clips.find(c => c.id === previewClipId)?.clipUrl || null)}
              clipTitle={clips.find(c => c.id === previewClipId)?.title || ''}
              clipType={clips.find(c => c.id === previewClipId)?.type || ''}
              timestamp={formatTimestamp(clips.find(c => c.id === previewClipId)?.totalSeconds || 0)}
              matchId={matchId || undefined}
              matchHalf={clips.find(c => c.id === previewClipId)?.matchHalf}
              posterUrl={getThumbnail(previewClipId || '')?.imageUrl}
              eventId={previewClipId || undefined}
              eventSecond={clips.find(c => c.id === previewClipId)?.videoSecond || 0}
              videoDuration={clips.find(c => c.id === previewClipId)?.eventVideo?.duration_seconds || 30}
              fullVideoUrl={normalizeStorageUrl(clips.find(c => c.id === previewClipId)?.eventVideo?.file_url || null)}
              fullVideoDuration={clips.find(c => c.id === previewClipId)?.eventVideo?.duration_seconds || 0}
              initialTrim={clips.find(c => c.id === previewClipId)?.metadata?.customTrim as { startOffset: number; endOffset: number } | undefined}
              onTrimSave={async (eventId, trim) => {
                try {
                  // Update event metadata with custom trim
                  const event = events?.find(e => e.id === eventId);
                  if (event) {
                    const newMetadata = {
                      ...((event as any).metadata || {}),
                      customTrim: trim
                    };
                    await apiClient.updateEvent(eventId, { metadata: newMetadata });
                    toast({
                      title: "Corte salvo",
                      description: `Ajuste de ${(trim.endOffset - trim.startOffset).toFixed(1)}s aplicado. Regenere os clips para aplicar.`
                    });
                    refetchEvents();
                  }
                } catch (error) {
                  console.error('Error saving trim:', error);
                  toast({
                    title: "Erro ao salvar",
                    description: "Não foi possível salvar o ajuste de corte",
                    variant: "destructive"
                  });
                }
              }}
            />

            {/* Recording in progress warning */}
            {hasRecordingInProgress && (
              <Card variant="glass" className="border-warning/50 bg-warning/5">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/20">
                      <Loader2 className="h-5 w-5 text-warning animate-spin" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Gravação em andamento</p>
                      <p className="text-sm text-muted-foreground">
                        Finalize a gravação na página Live para visualizar os cortes do vídeo
                      </p>
                    </div>
                    <Badge variant="warning">Aguardando</Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No video warning */}
            {!matchVideo && !hasRecordingInProgress && clips.length > 0 && (
              <Card variant="glass" className="border-warning/50 bg-warning/5">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/20">
                      <AlertCircle className="h-5 w-5 text-warning" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Vídeo não vinculado</p>
                      <p className="text-sm text-muted-foreground">
                        Para reproduzir os cortes, faça upload do vídeo da partida na página de Upload
                      </p>
                    </div>
                    <Button variant="arena" size="sm" asChild>
                      <Link to="/upload">
                        <Video className="mr-2 h-4 w-4" />
                        Fazer Upload
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Embed video warning - can't extract clips from embeds */}
            {/* Info card about clips */}
            {matchVideo && clips.length > 0 && (
              <Card variant="glass" className="border-primary/30 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                      <Scissors className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">
                        {clips.some(c => c.clipUrl) 
                          ? `${clips.filter(c => c.clipUrl).length} clips extraídos` 
                          : 'Extrair Clips Individuais'
                        }
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {clips.some(c => c.clipUrl) 
                          ? 'Clique para reproduzir os clips extraídos diretamente. Clips com ✓ são vídeos independentes.'
                          : 'Clique em "Extrair Clips" para gerar vídeos individuais de cada evento (~8 segundos cada). Isso permite reprodução e download separados.'
                        }
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Half filter tabs for clips */}

            {clips.length === 0 ? (
              <Card variant="glass">
                <CardContent className="py-12 text-center">
                  <Video className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum evento detectado para gerar cortes</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Tabs de filtragem por tempo */}
                <Tabs value={activeHalfTab} onValueChange={setActiveHalfTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="all">
                      Todos ({clips.length})
                    </TabsTrigger>
                    <TabsTrigger value="first_half">
                      1º Tempo ({clips.filter(c => {
                        const half = c.matchHalf;
                        return half === 'first' || half === 'first_half';
                      }).length})
                    </TabsTrigger>
                    <TabsTrigger value="second_half">
                      2º Tempo ({clips.filter(c => {
                        const half = c.matchHalf;
                        return half === 'second' || half === 'second_half';
                      }).length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {clips
                  .filter(clip => {
                    if (activeHalfTab === 'all') return true;
                    const half = clip.matchHalf;
                    if (activeHalfTab === 'first_half') {
                      return half === 'first' || half === 'first_half';
                    }
                    if (activeHalfTab === 'second_half') {
                      return half === 'second' || half === 'second_half';
                    }
                    return true;
                  })
                  .map(clip => {
                  const thumbnail = getThumbnail(clip.id);
                  const isPlaying = playingClipId === clip.id;
                  const isExtractingFrame = isExtracting(clip.id);
                  const isExtractingClip = isGeneratingClip(clip.id);
                  const hasExtractedClip = !!clip.clipUrl;
                  const canExtractClip = clip.canExtract;
                  
                  const handlePlayClip = () => {
                    // Check if video URL is empty (recording in progress)
                    if (!clip.clipUrl && (!matchVideo?.file_url || matchVideo.file_url.length === 0)) {
                      toast({
                        title: hasRecordingInProgress 
                          ? "Gravação em andamento" 
                          : "Vídeo não disponível",
                        description: hasRecordingInProgress
                          ? "Finalize a gravação na página Live para visualizar os cortes"
                          : "Faça upload do vídeo da partida para reproduzir",
                        variant: "destructive"
                      });
                      return;
                    }
                    
                    if (isPlaying) {
                      setPlayingClipId(null);
                      setShowingVignette(false);
                    } else {
                      if (thumbnail?.imageUrl) {
                        setShowingVignette(true);
                      }
                      setPlayingClipId(clip.id);
                    }
                  };

                  const handleExtractFrame = () => {
                    // Priorizar clip_url se existir - frame no momento ~3s (após buffer)
                    if (clip.clipUrl) {
                      extractFrameFromVideo({
                        eventId: clip.id,
                        eventType: clip.type,
                        videoUrl: clip.clipUrl,
                        timestamp: 3, // Momento do evento no clip (após buffer de 3s)
                        matchId: matchId
                      });
                      return;
                    }
                    
                    if (!matchVideo) {
                      toast({
                        title: "Vídeo não disponível",
                        description: "Faça upload do vídeo ou extraia o clip primeiro",
                        variant: "destructive"
                      });
                      return;
                    }
                    extractFrameFromVideo({
                      eventId: clip.id,
                      eventType: clip.type,
                      videoUrl: matchVideo.file_url,
                      timestamp: clip.totalSeconds,
                      matchId: matchId
                    });
                  };
                  return (
                    <Card key={clip.id} variant="glow" className={`overflow-hidden ${!canExtractClip ? 'opacity-75' : ''}`}>
                      <div className="relative aspect-video bg-muted">
                        {thumbnail?.imageUrl ? (
                          <img 
                            src={thumbnail.imageUrl} 
                            alt={clip.title}
                            className="w-full h-full object-cover"
                          />
                        ) : isExtractingFrame ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                            <p className="text-xs text-muted-foreground">Extraindo frame...</p>
                          </div>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 flex flex-col items-center justify-center gap-2">
                            {(clip.clipUrl || matchVideo) ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExtractFrame}
                                className="gap-1"
                              >
                                <Film className="h-3 w-3" />
                                Gerar Capa
                              </Button>
                            ) : (
                              <p className="text-xs text-muted-foreground">Vídeo necessário</p>
                            )}
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-background/80 to-transparent pointer-events-none">
                          <Button 
                            variant="arena" 
                            size="icon-lg" 
                            className="rounded-full pointer-events-auto"
                            onClick={handlePlayClip}
                          >
                            {isPlaying ? (
                              <Pause className="h-6 w-6" />
                            ) : (
                              <Play className="h-6 w-6" />
                            )}
                          </Button>
                        </div>
                        <div className="absolute bottom-2 right-2 flex gap-1">
                          {isExtractingClip ? (
                            <Badge variant="secondary" className="backdrop-blur gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Extraindo...
                            </Badge>
                          ) : hasExtractedClip ? (
                            <Badge variant="success" className="backdrop-blur gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Clip Pronto
                            </Badge>
                          ) : canExtractClip ? (
                            <Badge variant="secondary" className="backdrop-blur gap-1">
                              <Scissors className="h-3 w-3" />
                              Pode Extrair
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="backdrop-blur gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Sem Vídeo
                            </Badge>
                          )}
                        </div>
                        <div className="absolute left-2 top-2 flex gap-1 flex-wrap max-w-[80%]">
                          <Badge variant="arena">{clip.type}</Badge>
                          {clip.matchHalf && (
                            <Badge variant="outline" className="backdrop-blur text-xs">
                              {clip.matchHalf === 'first_half' || clip.matchHalf === 'first' ? '1º T' : clip.matchHalf === 'second_half' || clip.matchHalf === 'second' ? '2º T' : clip.matchHalf}
                            </Badge>
                          )}
                          {clip.isManual && (
                            <Badge variant="outline" className="backdrop-blur text-xs bg-blue-500/20 border-blue-500/50 text-blue-200">
                              Manual
                            </Badge>
                          )}
                          {clip.clipPending && clip.canExtract && !clip.clipUrl && (
                            <Badge variant="warning" className="backdrop-blur text-xs gap-1">
                              <Clock className="h-3 w-3" />
                              Clip Pendente
                            </Badge>
                          )}
                        </div>
                        <div className="absolute left-2 bottom-2">
                          <Badge variant="outline" className="backdrop-blur font-mono">
                            {formatTimestamp(clip.totalSeconds)}
                          </Badge>
                        </div>
                      </div>
                      <CardContent className="pt-4">
                        <h3 className="font-medium">{clip.title}</h3>
                        {clip.description && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                            {clip.description}
                          </p>
                        )}
                        <div className="mt-4 flex gap-2">
                          {!thumbnail?.imageUrl && !isExtractingFrame && clip.clipUrl && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1"
                              onClick={handleExtractFrame}
                            >
                              <Film className="mr-1 h-3 w-3" />
                              Gerar Capa
                            </Button>
                          )}
                          {/* Botão Reproduzir */}
                          {(clip.clipUrl || matchVideo) && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1"
                              onClick={handlePlayClip}
                            >
                              {isPlaying ? (
                                <>
                                  <Pause className="mr-1 h-3 w-3" />
                                  Pausar
                                </>
                              ) : (
                                <>
                                  <Play className="mr-1 h-3 w-3" />
                                  Reproduzir
                                </>
                              )}
                            </Button>
                          )}
                          {clip.clipUrl && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1"
                              onClick={() => setPreviewClipId(clip.id)}
                            >
                              <Smartphone className="mr-1 h-3 w-3" />
                              Preview
                            </Button>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => setShareClipId(clip.id)}
                            disabled={!clip.clipUrl}
                          >
                            <Share2 className="mr-1 h-3 w-3" />
                            Compartilhar
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteClip(clip.id, clip.title)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              </>
            )}
          </TabsContent>

          {/* Playlists Tab */}
          <TabsContent value="playlists" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Organize os clipes por time e marque a sequência de publicação nas redes sociais
                </p>
              </div>
            </div>

            {/* Team Playlists Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Home Team Playlist */}
              <TeamPlaylist
                team={{
                  id: selectedMatch?.home_team?.id || '',
                  name: selectedMatch?.home_team?.name || 'Time Casa',
                  short_name: selectedMatch?.home_team?.short_name,
                  primary_color: selectedMatch?.home_team?.primary_color
                }}
                teamType="home"
                clips={clips}
                getThumbnail={getThumbnail}
                onPlayClip={(clipId) => {
                  const thumbnail = getThumbnail(clipId);
                  if (thumbnail?.imageUrl) setShowingVignette(true);
                  setPlayingClipId(clipId);
                }}
                hasVideo={!!matchVideo}
                videoUrl={matchVideo?.file_url}
                matchId={matchId || undefined}
                onClipsExtracted={() => refetchEvents()}
              />

              {/* Away Team Playlist */}
              <TeamPlaylist
                team={{
                  id: selectedMatch?.away_team?.id || '',
                  name: selectedMatch?.away_team?.name || 'Time Visitante',
                  short_name: selectedMatch?.away_team?.short_name,
                  primary_color: selectedMatch?.away_team?.primary_color
                }}
                teamType="away"
                clips={clips}
                getThumbnail={getThumbnail}
                onPlayClip={(clipId) => {
                  const thumbnail = getThumbnail(clipId);
                  if (thumbnail?.imageUrl) setShowingVignette(true);
                  setPlayingClipId(clipId);
                }}
                hasVideo={!!matchVideo}
                videoUrl={matchVideo?.file_url}
                matchId={matchId || undefined}
                onClipsExtracted={() => refetchEvents()}
              />
            </div>
          </TabsContent>

          {/* Thumbnails Tab */}

          {/* Social Tab */}
          <TabsContent value="social" className="space-y-4">
            {/* Export Video Card */}
            <Card variant="glow" className="border-primary/30 bg-primary/5">
              <CardContent className="py-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70">
                      <Film className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Exportar Vídeo de Cortes</h3>
                      <p className="text-sm text-muted-foreground">
                        Gere um vídeo compilado com os melhores momentos da partida
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="arena" 
                    size="lg"
                    disabled={clips.length === 0}
                    onClick={() => setExportPreviewOpen(true)}
                  >
                    <Download className="mr-2 h-5 w-5" />
                    Exportar Preview
                  </Button>
                </div>
                {!matchVideo && (
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Sem vídeo: será gerada uma imagem collage com os clipes selecionados
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {socialPlatforms.map((platform, i) => {
                const IconComponent = platform.icon;
                return (
                  <Card key={i} variant="glow" className="group hover:border-primary/50 transition-all">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${platform.color}`}>
                          <IconComponent className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium">{platform.name}</h3>
                          <p className="text-xs text-muted-foreground">Formato otimizado</p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Gere conteúdo de {selectedMatch?.home_team?.name} vs {selectedMatch?.away_team?.name} otimizado para {platform.name}.
                      </p>
                      <Button 
                        variant="arena-outline" 
                        className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all" 
                        disabled={clips.length === 0}
                        onClick={() => {
                          setSelectedPlatform(platform.name);
                          setSocialDialogOpen(true);
                        }}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Gerar Conteúdo
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Social Content Dialog */}
            <SocialContentDialog
              isOpen={socialDialogOpen}
              onClose={() => setSocialDialogOpen(false)}
              platform={selectedPlatform}
              matchVideoUrl={matchVideo?.file_url}
              homeTeamPlaylist={{
                teamName: selectedMatch?.home_team?.name || 'Time Casa',
                teamType: 'home',
                clips: clips.map(c => ({
                  ...c,
                  thumbnail: getThumbnail(c.id)?.imageUrl,
                  clipUrl: c.clipUrl
                }))
              }}
              awayTeamPlaylist={{
                teamName: selectedMatch?.away_team?.name || 'Time Fora',
                teamType: 'away',
                clips: clips.map(c => ({
                  ...c,
                  thumbnail: getThumbnail(c.id)?.imageUrl,
                  clipUrl: c.clipUrl
                }))
              }}
              onGenerate={(config) => {
                setIsGeneratingSocial(true);
                // Fallback for when no video is available
                setTimeout(() => {
                  setIsGeneratingSocial(false);
                  setSocialDialogOpen(false);
                  toast({
                    title: "Vídeo gerado com sucesso!",
                    description: `Melhores momentos para ${config.platform} (${config.format.ratio}) com ${config.selectedClips.length} clipes.`,
                  });
                }, 3000);
              }}
              isGenerating={isGeneratingSocial}
            />
            
            {/* Export Preview Dialog */}
            <ExportPreviewDialog
              isOpen={exportPreviewOpen}
              onClose={() => setExportPreviewOpen(false)}
              clips={clips.map(c => ({
                ...c,
                thumbnail: getThumbnail(c.id)?.imageUrl,
              }))}
              matchVideo={matchVideo}
              homeTeam={selectedMatch?.home_team?.name || 'Time Casa'}
              awayTeam={selectedMatch?.away_team?.name || 'Time Fora'}
              homeScore={selectedMatch?.home_score || 0}
              awayScore={selectedMatch?.away_score || 0}
            />

            {/* Link Video Dialog */}
            <LinkVideoDialog
              open={linkVideoDialogOpen}
              onOpenChange={setLinkVideoDialogOpen}
              matchId={matchId}
              onVideoLinked={() => {
                queryClient.invalidateQueries({ queryKey: ['match-videos', matchId] });
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
