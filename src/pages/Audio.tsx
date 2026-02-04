import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Mic, 
  Play, 
  Pause,
  Download, 
  Volume2,
  Radio,
  MessageSquare,
  Sparkles,
  Clock,
  AlertCircle,
  Loader2,
  Square,
  Settings2,
  VolumeX,
  Video
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMatchEvents, useMatchAnalysis } from '@/hooks/useMatchDetails';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { usePodcastGeneration, PodcastType } from '@/hooks/usePodcastGeneration';
import { TeamChatbotCard } from '@/components/audio/TeamChatbotCard';
import { useWebSpeechTTS } from '@/hooks/useWebSpeechTTS';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { calculateScoreFromEvents } from '@/hooks/useDynamicMatchStats';
import apiClient, { normalizeStorageUrl } from '@/lib/apiClient';
import { SyncedTranscription } from '@/components/audio/SyncedTranscription';

export default function Audio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Use centralized match selection hook
  const { currentMatchId, selectedMatch, isLoading: matchesLoading } = useMatchSelection();
  const matchId = currentMatchId || '';
  
  const { data: events } = useMatchEvents(matchId);
  const { data: analysis } = useMatchAnalysis(matchId);
  
  // Fetch videos for the match (for original audio)
  const { data: matchVideos, isLoading: videosLoading } = useQuery({
    queryKey: ['match-videos-audio', matchId],
    queryFn: async () => {
      if (!matchId) return [];
      try {
        return await apiClient.getVideos(matchId);
      } catch (e) {
        console.error('[Audio] Error fetching videos:', e);
        return [];
      }
    },
    enabled: !!matchId,
  });

  // Get the primary video URL for original audio
  const primaryVideo = matchVideos?.find((v: any) => v.file_url && v.file_url.length > 0);
  const originalAudioUrl = primaryVideo?.file_url ? normalizeStorageUrl(primaryVideo.file_url) : null;
  const videoDuration = primaryVideo?.duration_seconds || 0;

  const { 
    isGenerating: isPodcastGenerating, 
    generatingType: podcastGeneratingType,
    podcasts, 
    generatePodcast, 
    loadPodcasts,
    downloadPodcast 
  } = usePodcastGeneration();
  
  // State for podcast audio players
  const [playingPodcast, setPlayingPodcast] = useState<PodcastType | null>(null);
  const podcastAudioRef = useRef<HTMLAudioElement | null>(null);

  // Web Speech TTS (free, browser-based)
  const webTTS = useWebSpeechTTS();
  const [ttsText, setTtsText] = useState('');
  const [activeTab, setActiveTab] = useState('narration');

  // Get highlights from events (goals, saves, etc.)
  const highlights = events?.filter(e => 
    ['goal', 'shot_on_target', 'save', 'red_card'].includes(e.event_type)
  ).map(e => ({
    time: `${e.minute}'`,
    event: e.description || e.event_type
  })) || [];

  // Calculate score dynamically using the same function as ProjectSelector
  const homeTeamName = selectedMatch?.home_team?.name || 'Time Casa';
  const awayTeamName = selectedMatch?.away_team?.name || 'Time Fora';
  
  const dynamicScore = calculateScoreFromEvents(
    events || [],
    homeTeamName,
    awayTeamName
  );
  
  // Use dynamic score if there are events, otherwise fall back to DB values
  const displayScore = {
    home: (events?.length || 0) > 0 ? dynamicScore.home : (selectedMatch?.home_score || 0),
    away: (events?.length || 0) > 0 ? dynamicScore.away : (selectedMatch?.away_score || 0)
  };

  // Load saved podcasts when match changes
  useEffect(() => {
    if (matchId) {
      loadPodcasts(matchId);
    }
  }, [matchId]);

  // Audio player controls - recreate audio element when URL changes (using original video audio)
  useEffect(() => {
    // Clean up previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current = null;
    }
    
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    
    if (!originalAudioUrl) return;
    
    const audio = document.createElement('audio') as HTMLAudioElement;
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';
    
    const handleLoadedMetadata = () => {
      console.log('Original audio loaded, duration:', audio.duration);
      setDuration(audio.duration);
    };
    
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    
    const handleError = (e: Event) => {
      console.error('Audio load error:', audio.error, e);
    };
    
    const handleCanPlay = () => {
      console.log('Audio can play');
    };
    
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);
    
    audio.src = originalAudioUrl;
    audioRef.current = audio;
    
    // Use video duration if available
    if (videoDuration > 0) {
      setDuration(videoDuration);
    }
    
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.pause();
      audio.removeAttribute('src');
    };
  }, [originalAudioUrl, videoDuration]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    if (!originalAudioUrl) return;
    const filename = `audio-original-${selectedMatch?.home_team?.short_name || 'home'}-vs-${selectedMatch?.away_team?.short_name || 'away'}.mp4`;
    const link = document.createElement('a');
    link.href = originalAudioUrl;
    link.download = filename;
    link.target = '_blank';
    link.click();
  };

  const handleGeneratePodcast = async (podcastType: PodcastType) => {
    if (!selectedMatch || !events?.length) return;
    
    await generatePodcast(
      matchId,
      events,
      selectedMatch.home_team?.name || 'Time Casa',
      selectedMatch.away_team?.name || 'Time Fora',
      displayScore.home,
      displayScore.away,
      podcastType,
      analysis?.tacticalAnalysis
    );
  };

  const handlePlayPodcast = async (podcastType: PodcastType) => {
    const podcast = podcasts[podcastType];
    
    console.log('handlePlayPodcast called:', { podcastType, podcast, audioUrl: podcast?.audioUrl });
    
    if (!podcast?.audioUrl) {
      console.error('No audio URL for podcast:', podcastType);
      return;
    }

    // Stop any currently playing podcast
    if (podcastAudioRef.current) {
      podcastAudioRef.current.pause();
      podcastAudioRef.current.removeAttribute('src');
      podcastAudioRef.current = null;
    }

    if (playingPodcast === podcastType) {
      setPlayingPodcast(null);
      return;
    }

    try {
      const audio = document.createElement('audio') as HTMLAudioElement;
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      
      audio.addEventListener('ended', () => {
        console.log('Podcast audio ended');
        setPlayingPodcast(null);
      });
      
      audio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e, audio.error);
        setPlayingPodcast(null);
      });
      
      audio.addEventListener('canplaythrough', () => {
        console.log('Audio can play through');
      });

      // Set src before assigning ref
      audio.src = podcast.audioUrl;
      podcastAudioRef.current = audio;
      setPlayingPodcast(podcastType);
      
      await audio.play();
      console.log('Audio playback started successfully');
    } catch (error) {
      console.error('Error playing podcast:', error);
      setPlayingPodcast(null);
    }
  };

  const handleDownloadPodcast = (podcastType: PodcastType) => {
    const filename = `podcast-${podcastType}-${selectedMatch?.home_team?.short_name || 'home'}-vs-${selectedMatch?.away_team?.short_name || 'away'}.mp3`;
    downloadPodcast(podcastType, filename);
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

  if (!selectedMatch) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Nenhuma partida selecionada</p>
          <p className="text-sm text-muted-foreground">Selecione uma partida no menu principal</p>
        </div>
      </AppLayout>
    );
  }

  const homeTeamShort = selectedMatch?.home_team?.short_name || homeTeamName.slice(0, 3).toUpperCase();
  const awayTeamShort = selectedMatch?.away_team?.short_name || awayTeamName.slice(0, 3).toUpperCase();


  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Podcast & Locução</h1>
            <p className="text-muted-foreground">
              {selectedMatch.home_team?.name} vs {selectedMatch.away_team?.name} • Áudio original e podcasts da partida
            </p>
          </div>
        </div>

        {/* Match Info */}
        {selectedMatch && (
          <Card variant="glass">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="font-semibold">{homeTeamName}</p>
                    <p className="text-2xl font-bold">{displayScore.home}</p>
                  </div>
                  <span className="text-muted-foreground">vs</span>
                  <div className="text-center">
                    <p className="font-semibold">{awayTeamName}</p>
                    <p className="text-2xl font-bold">{displayScore.away}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="success">Análise Completa</Badge>
                  <Badge variant="outline">{events?.length || 0} eventos</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="narration">
              <Mic className="mr-2 h-4 w-4" />
              Locução
            </TabsTrigger>
            <TabsTrigger value="podcast">
              <Radio className="mr-2 h-4 w-4" />
              Podcast
            </TabsTrigger>
            <TabsTrigger value="free-tts">
              <Volume2 className="mr-2 h-4 w-4" />
              kakttus Voice
            </TabsTrigger>
            <TabsTrigger value="chatbots">
              <MessageSquare className="mr-2 h-4 w-4" />
              Chatbots
            </TabsTrigger>
          </TabsList>

          {/* Narration Tab */}
          <TabsContent value="narration" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Main Player */}
              <div className="lg:col-span-2">
                <Card variant="glow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Video className="h-5 w-5" />
                          Áudio Original da Transmissão
                        </CardTitle>
                        <CardDescription>
                          {homeTeamName} vs {awayTeamName} • Áudio extraído do vídeo do jogo
                        </CardDescription>
                      </div>
                      {originalAudioUrl ? (
                        <Badge variant="success">Disponível</Badge>
                      ) : videosLoading ? (
                        <Badge variant="arena">Carregando...</Badge>
                      ) : (
                        <Badge variant="destructive">Sem vídeo</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {!originalAudioUrl && !videosLoading && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Video className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Nenhum vídeo disponível para esta partida</p>
                        <p className="text-xs mt-1">Faça upload de um vídeo na página de Upload para ouvir o áudio original</p>
                      </div>
                    )}
                    
                    {originalAudioUrl && (
                      <>
                        {/* Waveform Placeholder */}
                        <div className="relative h-24 rounded-lg bg-muted overflow-hidden">
                          <div className="absolute inset-0 flex items-center justify-center gap-0.5">
                            {Array.from({ length: 100 }).map((_, i) => (
                              <div 
                                key={i}
                                className="w-1 rounded-full bg-primary/30"
                                style={{ 
                                  height: `${20 + Math.random() * 60}%`,
                                  opacity: duration > 0 && i < (currentTime / duration) * 100 ? 1 : 0.3
                                }}
                              />
                            ))}
                          </div>
                          {duration > 0 && (
                            <div 
                              className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary/20 to-transparent transition-all"
                              style={{ width: `${(currentTime / duration) * 100}%` }}
                            />
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-4">
                          <Button 
                            variant="arena" 
                            size="icon-lg"
                            onClick={togglePlay}
                            disabled={!originalAudioUrl}
                          >
                            {isPlaying ? (
                              <Pause className="h-6 w-6" />
                            ) : (
                              <Play className="h-6 w-6 ml-1" />
                            )}
                          </Button>
                          <div className="flex-1">
                            <Progress value={duration > 0 ? (currentTime / duration) * 100 : 0} className="h-2" />
                            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                              <span>{formatTime(currentTime)}</span>
                              <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" disabled={!originalAudioUrl}>
                            <Volume2 className="h-5 w-5" />
                          </Button>
                          <Button variant="outline" onClick={handleDownload} disabled={!originalAudioUrl}>
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        </div>
                        
                        {/* Synchronized Transcription Text */}
                        {analysis?.transcription && (
                          <SyncedTranscription
                            transcription={analysis.transcription}
                            currentTime={currentTime}
                            duration={duration}
                            isPlaying={isPlaying}
                          />
                        )}
                      </>
                    )}

                    {/* Info */}
                    <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{duration > 0 ? formatTime(duration) : '--:--'}</p>
                        <p className="text-xs text-muted-foreground">Duração</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">PT-BR</p>
                        <p className="text-xs text-muted-foreground">Idioma</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{highlights.length}</p>
                        <p className="text-xs text-muted-foreground">Highlights</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar - Highlights only */}
              <div className="space-y-4">
                <Card variant="glass">
                  <CardHeader>
                    <CardTitle className="text-lg">Highlights em Áudio</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {highlights.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum highlight detectado
                      </p>
                    ) : (
                      highlights.slice(0, 5).map((highlight, i) => (
                        <Button key={i} variant="ghost" className="w-full justify-start" disabled>
                          <Play className="mr-2 h-3 w-3" />
                          <span className="text-primary mr-2">{highlight.time}</span>
                          <span className="text-sm truncate">{highlight.event}</span>
                        </Button>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Podcast Tab */}
          <TabsContent value="podcast" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {([
                { 
                  type: 'tactical' as PodcastType,
                  title: 'Análise Tática Completa', 
                  description: `Breakdown detalhado de ${homeTeamName} vs ${awayTeamName}`,
                  hasData: !!analysis?.tacticalAnalysis || (events && events.length > 0)
                },
                { 
                  type: 'summary' as PodcastType,
                  title: 'Resumo da Partida', 
                  description: 'Principais momentos e destaques do jogo',
                  hasData: events && events.length > 0
                },
                { 
                  type: 'debate' as PodcastType,
                  title: 'Debate: Torcedores', 
                  description: `Perspectiva de ${homeTeamName} e ${awayTeamName}`,
                  hasData: events && events.length > 0
                },
              ]).map((podcast) => {
                const podcastData = podcasts[podcast.type];
                const isThisGenerating = isPodcastGenerating && podcastGeneratingType === podcast.type;
                const isReady = !!podcastData?.audioUrl;
                const isThisPlaying = playingPodcast === podcast.type;
                
                return (
                  <Card key={podcast.type} variant="glow">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                          <Radio className="h-6 w-6 text-primary" />
                        </div>
                        <Badge variant={isReady ? 'success' : podcast.hasData ? 'arena' : 'secondary'}>
                          {isReady ? 'Pronto' : podcast.hasData ? 'Dados disponíveis' : 'Sem dados'}
                        </Badge>
                      </div>
                      <h3 className="font-display text-lg font-semibold">{podcast.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{podcast.description}</p>
                      
                      {/* Script Preview */}
                      {podcastData?.script && (
                        <div className="mt-3 rounded-lg bg-muted/50 p-3 max-h-24 overflow-y-auto">
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {podcastData.script.slice(0, 200)}...
                          </p>
                        </div>
                      )}
                      
                      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{isReady ? 'Gerado' : '--:--'}</span>
                      </div>
                      <div className="mt-4 flex gap-2">
                        {isReady ? (
                          <>
                            <Button 
                              variant={isThisPlaying ? "outline" : "arena"}
                              size="sm" 
                              className="flex-1"
                              onClick={() => handlePlayPodcast(podcast.type)}
                            >
                              {isThisPlaying ? (
                                <>
                                  <Pause className="mr-1 h-4 w-4" />
                                  Pausar
                                </>
                              ) : (
                                <>
                                  <Play className="mr-1 h-4 w-4" />
                                  Ouvir
                                </>
                              )}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDownloadPodcast(podcast.type)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button 
                              variant="arena" 
                              size="sm" 
                              className="flex-1"
                              disabled={!podcast.hasData || isThisGenerating}
                              onClick={() => handleGeneratePodcast(podcast.type)}
                            >
                              {isThisGenerating ? (
                                <>
                                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                  Gerando...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="mr-1 h-4 w-4" />
                                  Gerar
                                </>
                              )}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              disabled
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Free TTS Tab */}
          <TabsContent value="free-tts" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Main TTS Panel */}
              <div className="lg:col-span-2">
                <Card variant="glow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Volume2 className="h-5 w-5" />
                          kakttus Voice
                        </CardTitle>
                        <CardDescription>
                          Converta texto em áudio usando vozes nativas - integrado ao sistema
                        </CardDescription>
                      </div>
                      {webTTS.isSupported ? (
                        <Badge variant="success">Disponível</Badge>
                      ) : (
                        <Badge variant="destructive">Não suportado</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!webTTS.isSupported ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <VolumeX className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Seu navegador não suporta a Web Speech API</p>
                        <p className="text-sm">Tente Chrome, Edge ou Safari</p>
                      </div>
                    ) : (
                      <>
                        {/* Text Input */}
                        <div>
                          <label className="text-sm font-medium mb-2 block">Texto para leitura:</label>
                          <Textarea
                            value={ttsText}
                            onChange={(e) => setTtsText(e.target.value)}
                            placeholder={`Cole aqui o texto que deseja ouvir...\n\nExemplo: "${homeTeamName} vence ${awayTeamName} por ${displayScore.home} a ${displayScore.away} em partida emocionante!"`}
                            className="min-h-[150px]"
                          />
                          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                            <span>{ttsText.length} caracteres</span>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0"
                              onClick={() => {
                                const summary = `${homeTeamName} enfrentou ${awayTeamName} em uma partida que terminou ${displayScore.home} a ${displayScore.away}. ` +
                                  `Foram ${events?.length || 0} eventos detectados durante o jogo. ` +
                                  (highlights.length > 0 
                                    ? `Os principais lances incluíram: ${highlights.slice(0, 3).map(h => `${h.event} aos ${h.time}`).join(', ')}.`
                                    : '');
                                setTtsText(summary);
                              }}
                            >
                              Gerar resumo automático
                            </Button>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        {webTTS.isSpeaking && (
                          <div className="space-y-2">
                            <Progress value={webTTS.progress} className="h-2" />
                            <p className="text-xs text-center text-muted-foreground">
                              {Math.round(webTTS.progress)}% concluído
                            </p>
                          </div>
                        )}

                        {/* Controls */}
                        <div className="flex items-center gap-3">
                          <Button
                            variant="arena"
                            size="icon-lg"
                            onClick={() => {
                              if (webTTS.isSpeaking && !webTTS.isPaused) {
                                webTTS.pause();
                              } else if (webTTS.isPaused) {
                                webTTS.resume();
                              } else {
                                webTTS.speak(ttsText);
                              }
                            }}
                            disabled={!ttsText.trim()}
                          >
                            {webTTS.isSpeaking && !webTTS.isPaused ? (
                              <Pause className="h-6 w-6" />
                            ) : (
                              <Play className="h-6 w-6 ml-1" />
                            )}
                          </Button>
                          
                          {webTTS.isSpeaking && (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => webTTS.stop()}
                            >
                              <Square className="h-4 w-4" />
                            </Button>
                          )}
                          
                          <div className="flex-1 text-sm text-muted-foreground">
                            {webTTS.isSpeaking ? (
                              webTTS.isPaused ? 'Pausado' : 'Reproduzindo...'
                            ) : (
                              'Pronto para ler'
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Settings Sidebar */}
              <div className="space-y-4">
                <Card variant="glass">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Configurações de Voz
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Voice Selection */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">Voz:</label>
                      <Select
                        value={webTTS.selectedVoice?.voiceURI || ''}
                        onValueChange={(uri) => {
                          const voice = webTTS.voices.find(v => v.voiceURI === uri);
                          if (voice) webTTS.setSelectedVoice(voice);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma voz" />
                        </SelectTrigger>
                        <SelectContent>
                          {webTTS.voices.map((voice) => (
                            <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                              {voice.name} ({voice.lang})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {webTTS.voices.filter(v => v.lang.startsWith('pt')).length} vozes em português disponíveis
                      </p>
                    </div>

                    {/* Speed */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Velocidade: {webTTS.rate.toFixed(1)}x
                      </label>
                      <Slider
                        value={[webTTS.rate]}
                        onValueChange={([val]) => webTTS.setRate(val)}
                        min={0.5}
                        max={2}
                        step={0.1}
                        className="w-full"
                      />
                    </div>

                    {/* Pitch */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Tom: {webTTS.pitch.toFixed(1)}
                      </label>
                      <Slider
                        value={[webTTS.pitch]}
                        onValueChange={([val]) => webTTS.setPitch(val)}
                        min={0.5}
                        max={2}
                        step={0.1}
                        className="w-full"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card variant="glass">
                  <CardHeader>
                    <CardTitle className="text-lg">💡 Dicas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>• As vozes disponíveis dependem do seu sistema operacional</p>
                    <p>• Vozes em português geralmente têm prefixo "pt-BR" ou "pt-PT"</p>
                    <p>• O áudio é gerado localmente, sem uso de API</p>
                    <p>• Use velocidade 1.0 para narração natural</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Chatbots Tab */}
          <TabsContent value="chatbots" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <TeamChatbotCard
                teamName={homeTeamName}
                teamShort={homeTeamShort}
                teamType="home"
                matchId={matchId}
                matchContext={{
                  homeTeam: homeTeamName,
                  awayTeam: awayTeamName,
                  homeScore: selectedMatch?.home_score || 0,
                  awayScore: selectedMatch?.away_score || 0,
                  events: events || [],
                  tacticalAnalysis: JSON.stringify(analysis?.tacticalAnalysis || {}),
                }}
              />
              <TeamChatbotCard
                teamName={awayTeamName}
                teamShort={awayTeamShort}
                teamType="away"
                matchId={matchId}
                matchContext={{
                  homeTeam: homeTeamName,
                  awayTeam: awayTeamName,
                  homeScore: selectedMatch?.home_score || 0,
                  awayScore: selectedMatch?.away_score || 0,
                  events: events || [],
                  tacticalAnalysis: JSON.stringify(analysis?.tacticalAnalysis || {}),
                }}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
