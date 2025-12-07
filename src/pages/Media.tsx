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
  Sparkles
} from 'lucide-react';
import { mockVideoClips, mockMatches } from '@/data/mockData';

export default function Media() {
  const match = mockMatches[0];

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
          <Button variant="arena">
            <Sparkles className="mr-2 h-4 w-4" />
            Gerar Cortes Automáticos
          </Button>
        </div>

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
                {mockVideoClips.length} cortes disponíveis
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Todos
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mockVideoClips.map(clip => (
                <Card key={clip.id} variant="glow" className="overflow-hidden">
                  {/* Video Preview */}
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
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: match.homeTeam.primaryColor }}
                        />
                        Playlist {match.homeTeam.name}
                      </CardTitle>
                      <CardDescription>Melhores momentos do time</CardDescription>
                    </div>
                    <Badge variant="arena">3 clipes</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {mockVideoClips.filter((_, i) => i < 2).map(clip => (
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
                  ))}
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
                        <div 
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: match.awayTeam.primaryColor === '#FFFFFF' ? '#00529F' : match.awayTeam.primaryColor }}
                        />
                        Playlist {match.awayTeam.name}
                      </CardTitle>
                      <CardDescription>Melhores momentos do time</CardDescription>
                    </div>
                    <Badge variant="arena">2 clipes</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {mockVideoClips.filter((_, i) => i >= 1).map(clip => (
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
                  ))}
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
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} variant="glass" className="overflow-hidden">
                  <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Image className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <CardContent className="pt-3">
                    <p className="text-sm font-medium">Thumbnail {i + 1}</p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        Download
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
                      Gere conteúdo otimizado para {platform} com legendas e efeitos automáticos.
                    </p>
                    <Button variant="arena-outline" className="w-full">
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
