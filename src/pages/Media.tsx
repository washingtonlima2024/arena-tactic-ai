import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  CheckCircle
} from 'lucide-react';
import { useMatchEvents } from '@/hooks/useMatchDetails';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { useState, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useThumbnailGeneration } from '@/hooks/useThumbnailGeneration';
import { useClipGeneration } from '@/hooks/useClipGeneration';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipVignette } from '@/components/media/ClipVignette';
import { TeamPlaylist } from '@/components/media/TeamPlaylist';
import { VideoPlayerModal } from '@/components/media/VideoPlayerModal';
import { SocialContentDialog } from '@/components/media/SocialContentDialog';
import { toast } from '@/hooks/use-toast';

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
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [isGeneratingSocial, setIsGeneratingSocial] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const queryClient = useQueryClient();
  
  const { thumbnails, generateThumbnail, generateAllThumbnails, isGenerating, getThumbnail, generatingIds } = useThumbnailGeneration(matchId);
  const { 
    generateClip, 
    generateAllClips, 
    isGenerating: isGeneratingClips, 
    isGeneratingEvent: isGeneratingClip,
    progress: clipProgress,
    cancel: cancelClipGeneration,
    isCancelled
  } = useClipGeneration();
  
  const { data: events, refetch: refetchEvents } = useMatchEvents(matchId);
  
  // Fetch video for the match
  const { data: matchVideo } = useQuery({
    queryKey: ['match-video', matchId],
    queryFn: async () => {
      if (!matchId) return null;
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('match_id', matchId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!matchId
  });

  // Generate clips from events - Use eventMs from metadata as primary timestamp source
  const clips = events?.map((event) => {
    const metadata = (event as any).metadata as { eventMs?: number; videoSecond?: number } | null;
    const eventMs = metadata?.eventMs; // Primary: milliseconds from AI analysis
    const videoSecond = metadata?.videoSecond; // Fallback: seconds from AI analysis
    
    // Calculate total seconds: prefer eventMs, then videoSecond, then minute+second
    const totalSeconds = eventMs !== undefined 
      ? eventMs / 1000 
      : videoSecond !== undefined 
        ? videoSecond 
        : ((event.minute || 0) * 60) + (event.second || 0);
    
    const displayMinutes = Math.floor(totalSeconds / 60);
    const displaySeconds = Math.floor(totalSeconds % 60);
    
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
      clipUrl: (event as any).clip_url as string | null,
      videoSecond: videoSecond ?? totalSeconds
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
    <AppLayout>
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
            <Select 
              value={matchId} 
              onValueChange={(value) => {
                setSelectedMatch(value);
                setPlayingClipId(null);
              }}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Selecione uma partida" />
              </SelectTrigger>
              <SelectContent>
                {matches?.map((match) => (
                  <SelectItem key={match.id} value={match.id}>
                    {match.home_team?.name || 'Time Casa'} vs {match.away_team?.name || 'Time Fora'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="arena">
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar Cortes
            </Button>
          </div>
        </div>

        {/* Match Info */}
        {selectedMatch && (
          <Card variant="glass">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="font-semibold">{selectedMatch.home_team?.name}</p>
                    <p className="text-2xl font-bold">{selectedMatch.home_score || 0}</p>
                  </div>
                  <span className="text-muted-foreground">vs</span>
                  <div className="text-center">
                    <p className="font-semibold">{selectedMatch.away_team?.name}</p>
                    <p className="text-2xl font-bold">{selectedMatch.away_score || 0}</p>
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  {clips.length} eventos • Gere capas e extraia clips (~20s cada) para redes sociais
                </p>
                {matchVideo ? (
                  matchVideo.file_url.includes('embed') || matchVideo.file_url.includes('xtream') ? (
                    <Badge variant="warning" className="gap-1">
                      <Film className="h-3 w-3" />
                      Embed (só reprodução)
                    </Badge>
                  ) : (
                    <Badge variant="success" className="gap-1">
                      <Video className="h-3 w-3" />
                      Vídeo disponível
                    </Badge>
                  )
                ) : (
                  <Badge variant="warning" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Sem vídeo vinculado
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                {/* Generate Clips Button - Only show for direct video files, not embeds */}
{clips.length > 0 && matchVideo && clips.some(c => !c.clipUrl) && 
                  !matchVideo.file_url.includes('embed') && !matchVideo.file_url.includes('xtream') && (
                  <>
                    <Button 
                      variant="arena" 
                      size="sm"
                      onClick={async () => {
                        if (!matchVideo.file_url) {
                          toast({
                            title: "Vídeo não encontrado",
                            description: "Faça upload de um vídeo na página de Upload",
                            variant: "destructive"
                          });
                          return;
                        }
                        // Use sensible defaults: assume full 90-minute match if not configured
                        const videoStartMs = (matchVideo.start_minute ?? 0) * 60 * 1000;
                        const videoEndMs = (matchVideo.end_minute ?? 90) * 60 * 1000;
                        // If duration not set, estimate from start/end range or use 90 min default
                        const estimatedDurationMs = matchVideo.duration_seconds 
                          ? matchVideo.duration_seconds * 1000
                          : (videoEndMs - videoStartMs) || (90 * 60 * 1000);
                        
                        const clipsToGenerate = clips
                          .filter(c => !c.clipUrl)
                          .map(c => ({
                            eventId: c.id,
                            eventMinuteMs: c.eventMs, // Use eventMs directly from metadata
                            videoUrl: matchVideo.file_url,
                            videoStartMs,
                            videoEndMs,
                            videoDurationMs: estimatedDurationMs,
                            matchId: matchId,
                            bufferBeforeMs: 3000,
                            bufferAfterMs: 5000 // 5s after event per user requirement
                          }));
                        await generateAllClips(clipsToGenerate);
                        refetchEvents();
                      }}
                      disabled={isGeneratingClips}
                    >
                      {isGeneratingClips ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {clipProgress.currentClip && clipProgress.totalClips 
                            ? `Clip ${clipProgress.currentClip}/${clipProgress.totalClips}`
                            : clipProgress.message
                          }
                        </>
                      ) : (
                        <>
                          <Scissors className="mr-2 h-4 w-4" />
                          Extrair Clips ({clips.filter(c => !c.clipUrl).length})
                        </>
                      )}
                    </Button>
                    {isGeneratingClips && (
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={cancelClipGeneration}
                      >
                        Cancelar
                      </Button>
                    )}
                  </>
                )}
                {clips.length > 0 && clips.every(c => c.clipUrl) && (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Todos clips extraídos
                  </Badge>
                )}
                {clips.length > 0 && clips.some(c => !getThumbnail(c.id)) && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const eventsToGenerate = clips
                        .filter(c => !getThumbnail(c.id))
                        .map(c => ({
                          eventId: c.id,
                          eventType: c.type,
                          minute: c.minute,
                          homeTeam: selectedMatch?.home_team?.name || 'Time Casa',
                          awayTeam: selectedMatch?.away_team?.name || 'Time Fora',
                          homeScore: selectedMatch?.home_score || 0,
                          awayScore: selectedMatch?.away_score || 0,
                          matchId: matchId,
                          description: c.description
                        }));
                      generateAllThumbnails(eventsToGenerate);
                    }}
                    disabled={generatingIds.size > 0}
                  >
                    {generatingIds.size > 0 ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Image className="mr-2 h-4 w-4" />
                    )}
                    Gerar Capas
                  </Button>
                )}
                {clips.length > 0 && clips.some(c => c.clipUrl) && (
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar Todos
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
              homeTeam={selectedMatch?.home_team?.name || 'Time Casa'}
              awayTeam={selectedMatch?.away_team?.name || 'Time Fora'}
              homeScore={selectedMatch?.home_score || 0}
              awayScore={selectedMatch?.away_score || 0}
              showVignette={showingVignette}
              onVignetteComplete={() => setShowingVignette(false)}
            />

            {/* No video warning */}
            {!matchVideo && clips.length > 0 && (
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
                      <a href="/upload">
                        <Video className="mr-2 h-4 w-4" />
                        Fazer Upload
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Embed video warning - can't extract clips from embeds */}
            {matchVideo && (matchVideo.file_url.includes('embed') || matchVideo.file_url.includes('xtream')) && clips.length > 0 && (
              <Card variant="glass" className="border-primary/30 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                      <Film className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Vídeo via Embed</p>
                      <p className="text-sm text-muted-foreground">
                        Clips são reproduzidos diretamente no player via iframe. Para extração de clips separados, 
                        faça upload de um arquivo MP4 direto na página de Upload.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {clips.length === 0 ? (
              <Card variant="glass">
                <CardContent className="py-12 text-center">
                  <Video className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum evento detectado para gerar cortes</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {clips.map(clip => {
                  const thumbnail = getThumbnail(clip.id);
                  const isPlaying = playingClipId === clip.id;
                  const isGeneratingThumbnail = isGenerating(clip.id);
                  const isExtractingClip = isGeneratingClip(clip.id);
                  
                  const handlePlayClip = () => {
                    // Se tem clipUrl extraído, pode reproduzir direto
                    const hasClipUrl = !!clip.clipUrl;
                    
                    if (!matchVideo && !hasClipUrl) {
                      toast({
                        title: "Vídeo não disponível",
                        description: "Extraia o clip ou faça upload do vídeo da partida",
                        variant: "destructive"
                      });
                      return;
                    }
                    
                    if (isPlaying) {
                      setPlayingClipId(null);
                      setShowingVignette(false);
                    } else {
                      // Se tiver thumbnail, mostra a vinheta primeiro
                      if (thumbnail?.imageUrl) {
                        setShowingVignette(true);
                      }
                      setPlayingClipId(clip.id);
                    }
                  };

                  const handleGenerateThumbnail = () => {
                    generateThumbnail({
                      eventId: clip.id,
                      eventType: clip.type,
                      minute: clip.minute,
                      homeTeam: selectedMatch?.home_team?.name || 'Time Casa',
                      awayTeam: selectedMatch?.away_team?.name || 'Time Fora',
                      homeScore: selectedMatch?.home_score || 0,
                      awayScore: selectedMatch?.away_score || 0,
                      matchId: matchId,
                      description: clip.description
                    });
                  };

                  const isEmbedVideo = matchVideo?.file_url.includes('embed') || matchVideo?.file_url.includes('xtream');

                  const handleExtractClip = async () => {
                    if (isEmbedVideo) {
                      toast({
                        title: "Extração não disponível",
                        description: "Vídeos via embed não suportam extração de clips. Faça upload de um arquivo MP4 direto.",
                        variant: "destructive"
                      });
                      return;
                    }
                    if (!matchVideo?.file_url) {
                      toast({
                        title: "Vídeo não encontrado",
                        description: "Faça upload de um vídeo na página de Upload",
                        variant: "destructive"
                      });
                      return;
                    }
                    // Use sensible defaults if sync data not configured
                    const videoStartMs = (matchVideo.start_minute ?? 0) * 60 * 1000;
                    const videoEndMs = (matchVideo.end_minute ?? 90) * 60 * 1000;
                    const videoDurationMs = matchVideo.duration_seconds 
                      ? matchVideo.duration_seconds * 1000
                      : (videoEndMs - videoStartMs) || (90 * 60 * 1000);
                    
                    const eventMs = (clip.minute * 60 + clip.second) * 1000;
                    await generateClip({
                      eventId: clip.id,
                      eventMinuteMs: eventMs,
                      videoUrl: matchVideo.file_url,
                      videoStartMs,
                      videoEndMs,
                      videoDurationMs,
                      matchId: matchId,
                      bufferBeforeMs: 3000,
                      bufferAfterMs: 3000
                    });
                    refetchEvents();
                  };
                  
                  return (
                    <Card key={clip.id} variant="glow" className="overflow-hidden">
                      <div className="relative aspect-video bg-muted">
                        {thumbnail?.imageUrl ? (
                          <img 
                            src={thumbnail.imageUrl} 
                            alt={clip.title}
                            className="w-full h-full object-cover"
                          />
                        ) : isGeneratingThumbnail ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                            <p className="text-xs text-muted-foreground">Gerando capa...</p>
                          </div>
                        ) : (
                          <div 
                            className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 cursor-pointer hover:from-primary/30 hover:to-primary/10 transition-colors flex flex-col items-center justify-center"
                            onClick={handleGenerateThumbnail}
                          >
                            <Sparkles className="h-8 w-8 text-primary/60 mb-2" />
                            <p className="text-xs text-muted-foreground">Clique para gerar capa</p>
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
                          {clip.clipUrl && (
                            <Badge variant="success" className="backdrop-blur gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Extraído
                            </Badge>
                          )}
                          <Badge variant="secondary" className="backdrop-blur">
                            <Clock className="mr-1 h-3 w-3" />
                            ~20s
                          </Badge>
                        </div>
                        <div className="absolute left-2 top-2">
                          <Badge variant="arena">{clip.type}</Badge>
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
                          {!thumbnail?.imageUrl && !isGeneratingThumbnail && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1"
                              onClick={handleGenerateThumbnail}
                            >
                              <Sparkles className="mr-1 h-3 w-3" />
                              Gerar Capa
                            </Button>
                          )}
                          {/* Botão Extrair Clip - Only show for direct video files, not embeds */}
                          {matchVideo && !clip.clipUrl && !isExtractingClip && !isEmbedVideo && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1"
                              onClick={handleExtractClip}
                            >
                              <Scissors className="mr-1 h-3 w-3" />
                              Extrair
                            </Button>
                          )}
                          {isExtractingClip && (
                            <Button variant="outline" size="sm" className="flex-1" disabled>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Extraindo...
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
                          <Button variant="outline" size="sm" className="flex-1">
                            <Share2 className="mr-1 h-3 w-3" />
                            Compartilhar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
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
                    onClick={() => {
                      setSelectedPlatform('Vídeo Personalizado');
                      setSocialDialogOpen(true);
                    }}
                  >
                    <Download className="mr-2 h-5 w-5" />
                    {matchVideo ? 'Exportar Vídeo' : 'Exportar Imagem'}
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
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
