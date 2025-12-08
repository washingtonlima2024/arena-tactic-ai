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
  Loader2
} from 'lucide-react';
import { useAllCompletedMatches, useMatchEvents } from '@/hooks/useMatchDetails';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useThumbnailGeneration } from '@/hooks/useThumbnailGeneration';

export default function Media() {
  const { data: matches, isLoading: matchesLoading } = useAllCompletedMatches();
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const { thumbnails, generateThumbnail, generateAllThumbnails, isGenerating, getThumbnail, generatingIds } = useThumbnailGeneration();
  
  const selectedMatch = matches?.find(m => m.id === selectedMatchId) || matches?.[0];
  const matchId = selectedMatch?.id || '';
  
  const { data: events } = useMatchEvents(matchId);

  // Generate clips from events
  const clips = events?.map((event, index) => ({
    id: event.id,
    title: event.description || `${event.event_type} - ${event.minute}'`,
    type: event.event_type,
    startTime: (event.minute || 0) * 60,
    endTime: ((event.minute || 0) * 60) + 15,
    description: `Minuto ${event.minute}' - ${event.event_type}`
  })) || [];

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
            <Select value={matchId} onValueChange={setSelectedMatchId}>
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="clips">
              <Scissors className="mr-2 h-4 w-4" />
              Cortes
            </TabsTrigger>
            <TabsTrigger value="playlists">
              <ListVideo className="mr-2 h-4 w-4" />
              Playlists
            </TabsTrigger>
            <TabsTrigger value="thumbnails">
              <Image className="mr-2 h-4 w-4" />
              Thumbnails
            </TabsTrigger>
            <TabsTrigger value="social">
              <Share2 className="mr-2 h-4 w-4" />
              Redes Sociais
            </TabsTrigger>
          </TabsList>

          {/* Clips Tab */}
          <TabsContent value="clips" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {clips.length} cortes disponíveis baseados nos eventos detectados
              </p>
              {clips.length > 0 && (
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Todos
                </Button>
              )}
            </div>

            {clips.length === 0 ? (
              <Card variant="glass">
                <CardContent className="py-12 text-center">
                  <Video className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum evento detectado para gerar cortes</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {clips.map(clip => (
                  <Card key={clip.id} variant="glow" className="overflow-hidden">
                    <div className="relative aspect-video bg-muted">
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-background/80 to-transparent">
                        <Button variant="arena" size="icon-lg" className="rounded-full">
                          <Play className="h-6 w-6" />
                        </Button>
                      </div>
                      <div className="absolute bottom-2 right-2">
                        <Badge variant="secondary" className="backdrop-blur">
                          <Clock className="mr-1 h-3 w-3" />
                          {Math.round((clip.endTime - clip.startTime))}s
                        </Badge>
                      </div>
                      <div className="absolute left-2 top-2">
                        <Badge variant="arena">{clip.type}</Badge>
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
                        <Button variant="outline" size="sm" className="flex-1">
                          <Download className="mr-1 h-3 w-3" />
                          Download
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1">
                          <Share2 className="mr-1 h-3 w-3" />
                          Compartilhar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Playlists Tab */}
          <TabsContent value="playlists" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card variant="glow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <div 
                          className="h-4 w-4 rounded-full bg-primary"
                        />
                        Playlist {selectedMatch?.home_team?.name || 'Time Casa'}
                      </CardTitle>
                      <CardDescription>Melhores momentos do time</CardDescription>
                    </div>
                    <Badge variant="arena">{goalClips.length} gols</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {goalClips.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhum gol registrado</p>
                  ) : (
                    goalClips.slice(0, 3).map(clip => (
                      <div key={clip.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                        <div className="flex h-12 w-16 items-center justify-center rounded bg-muted">
                          <Video className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">{clip.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round((clip.endTime - clip.startTime))} segundos
                          </p>
                        </div>
                        <Button variant="ghost" size="icon-sm">
                          <Play className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                  <Button variant="arena-outline" className="w-full">
                    <Download className="mr-2 h-4 w-4" />
                    Exportar Playlist
                  </Button>
                </CardContent>
              </Card>

              <Card variant="glow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-full bg-secondary" />
                        Playlist {selectedMatch?.away_team?.name || 'Time Fora'}
                      </CardTitle>
                      <CardDescription>Melhores momentos do time</CardDescription>
                    </div>
                    <Badge variant="arena">{shotClips.length} finalizações</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {shotClips.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma finalização registrada</p>
                  ) : (
                    shotClips.slice(0, 3).map(clip => (
                      <div key={clip.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                        <div className="flex h-12 w-16 items-center justify-center rounded bg-muted">
                          <Video className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">{clip.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round((clip.endTime - clip.startTime))} segundos
                          </p>
                        </div>
                        <Button variant="ghost" size="icon-sm">
                          <Play className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                  <Button variant="arena-outline" className="w-full">
                    <Download className="mr-2 h-4 w-4" />
                    Exportar Playlist
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Thumbnails Tab */}
          <TabsContent value="thumbnails" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Gere thumbnails personalizadas baseadas nos eventos da partida
              </p>
              {clips.length > 0 && (
                <Button 
                  variant="arena" 
                  size="sm"
                  disabled={generatingIds.size > 0}
                  onClick={() => {
                    const thumbnailParams = clips.slice(0, 6).map(clip => ({
                      eventId: clip.id,
                      eventType: clip.type,
                      minute: Math.floor(clip.startTime / 60),
                      homeTeam: selectedMatch?.home_team?.name || 'Time Casa',
                      awayTeam: selectedMatch?.away_team?.name || 'Time Fora',
                      homeScore: selectedMatch?.home_score || 0,
                      awayScore: selectedMatch?.away_score || 0,
                      description: clip.description
                    }));
                    generateAllThumbnails(thumbnailParams);
                  }}
                >
                  {generatingIds.size > 0 ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Gerar Todas
                    </>
                  )}
                </Button>
              )}
            </div>
            
            {clips.length === 0 ? (
              <Card variant="glass">
                <CardContent className="py-12 text-center">
                  <Image className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum evento para gerar thumbnails</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                {clips.slice(0, 8).map((clip) => {
                  const thumbnail = getThumbnail(clip.id);
                  const generating = isGenerating(clip.id);
                  
                  return (
                    <Card key={clip.id} variant="glass" className="overflow-hidden">
                      <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative">
                        {thumbnail?.imageUrl ? (
                          <img 
                            src={thumbnail.imageUrl} 
                            alt={clip.title}
                            className="w-full h-full object-cover"
                          />
                        ) : generating ? (
                          <div className="text-center">
                            <Loader2 className="h-8 w-8 text-primary mx-auto mb-2 animate-spin" />
                            <p className="text-xs text-muted-foreground">Gerando...</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <Image className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <Badge variant="outline" className="text-xs">{clip.type}</Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {Math.floor(clip.startTime / 60)}'
                            </p>
                          </div>
                        )}
                      </div>
                      <CardContent className="pt-3">
                        <p className="text-sm font-medium truncate">{clip.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {selectedMatch?.home_team?.name} vs {selectedMatch?.away_team?.name}
                        </p>
                        <div className="mt-2 flex gap-2">
                          {thumbnail?.imageUrl ? (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1"
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = thumbnail.imageUrl;
                                link.download = `thumbnail-${clip.type}-${clip.id}.png`;
                                link.click();
                              }}
                            >
                              <Download className="mr-1 h-3 w-3" />
                              Download
                            </Button>
                          ) : (
                            <Button 
                              variant="arena-outline" 
                              size="sm" 
                              className="flex-1"
                              disabled={generating}
                              onClick={() => generateThumbnail({
                                eventId: clip.id,
                                eventType: clip.type,
                                minute: Math.floor(clip.startTime / 60),
                                homeTeam: selectedMatch?.home_team?.name || 'Time Casa',
                                awayTeam: selectedMatch?.away_team?.name || 'Time Fora',
                                homeScore: selectedMatch?.home_score || 0,
                                awayScore: selectedMatch?.away_score || 0,
                                description: clip.description
                              })}
                            >
                              {generating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Sparkles className="mr-1 h-3 w-3" />
                                  Gerar
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Social Tab */}
          <TabsContent value="social" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {['Instagram Reels', 'TikTok', 'YouTube Shorts', 'Twitter/X', 'Facebook'].map((platform, i) => (
                <Card key={i} variant="glow">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Share2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{platform}</h3>
                        <p className="text-xs text-muted-foreground">Formato otimizado</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Gere conteúdo de {selectedMatch?.home_team?.name} vs {selectedMatch?.away_team?.name} otimizado para {platform}.
                    </p>
                    <Button variant="arena-outline" className="w-full" disabled={clips.length === 0}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Gerar Conteúdo
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
