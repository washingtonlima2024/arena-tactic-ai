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
  Users
} from 'lucide-react';
import { mockMatches } from '@/data/mockData';
import { useState } from 'react';

export default function Audio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const match = mockMatches[0];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Podcast & Locução</h1>
            <p className="text-muted-foreground">
              Gere narrações, podcasts e análises em áudio
            </p>
          </div>
          <Button variant="arena">
            <Sparkles className="mr-2 h-4 w-4" />
            Gerar Novo Áudio
          </Button>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="narration" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="narration">
              <Mic className="mr-2 h-4 w-4" />
              Locução
            </TabsTrigger>
            <TabsTrigger value="podcast">
              <Radio className="mr-2 h-4 w-4" />
              Podcast
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
                        <CardTitle>Narração Completa da Partida</CardTitle>
                        <CardDescription>
                          {match.homeTeam.name} vs {match.awayTeam.name}
                        </CardDescription>
                      </div>
                      <Badge variant="success">Disponível</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Waveform Placeholder */}
                    <div className="relative h-24 rounded-lg bg-muted overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center gap-0.5">
                        {Array.from({ length: 100 }).map((_, i) => (
                          <div 
                            key={i}
                            className="w-1 rounded-full bg-primary/30"
                            style={{ 
                              height: `${20 + Math.random() * 60}%`,
                              opacity: i < 35 ? 1 : 0.3
                            }}
                          />
                        ))}
                      </div>
                      <div 
                        className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary/20 to-transparent"
                        style={{ width: '35%' }}
                      />
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-4">
                      <Button 
                        variant="arena" 
                        size="icon-lg"
                        onClick={() => setIsPlaying(!isPlaying)}
                      >
                        {isPlaying ? (
                          <Pause className="h-6 w-6" />
                        ) : (
                          <Play className="h-6 w-6 ml-1" />
                        )}
                      </Button>
                      <div className="flex-1">
                        <Progress value={35} className="h-2" />
                        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                          <span>32:15</span>
                          <span>1:32:45</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon">
                        <Volume2 className="h-5 w-5" />
                      </Button>
                      <Button variant="outline">
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </div>

                    {/* Info */}
                    <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold">1:32:45</p>
                        <p className="text-xs text-muted-foreground">Duração</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">PT-BR</p>
                        <p className="text-xs text-muted-foreground">Idioma</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">HD</p>
                        <p className="text-xs text-muted-foreground">Qualidade</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <Card variant="glass">
                  <CardHeader>
                    <CardTitle className="text-lg">Vozes Disponíveis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { name: 'Narrador Clássico', description: 'Estilo tradicional brasileiro' },
                      { name: 'Comentarista Técnico', description: 'Análise tática detalhada' },
                      { name: 'Locutor Dinâmico', description: 'Alta energia e emoção' },
                    ].map((voice, i) => (
                      <div 
                        key={i}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          i === 0 ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <Mic className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{voice.name}</p>
                          <p className="text-xs text-muted-foreground">{voice.description}</p>
                        </div>
                        {i === 0 && <Badge variant="arena">Ativo</Badge>}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card variant="glass">
                  <CardHeader>
                    <CardTitle className="text-lg">Highlights em Áudio</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { time: "23'", event: 'Gol de Lewandowski' },
                      { time: "41'", event: 'Defesa de Ter Stegen' },
                      { time: "56'", event: 'Gol de Bellingham' },
                      { time: "78'", event: 'Gol de Pedri' },
                    ].map((highlight, i) => (
                      <Button key={i} variant="ghost" className="w-full justify-start">
                        <Play className="mr-2 h-3 w-3" />
                        <span className="text-primary mr-2">{highlight.time}</span>
                        <span className="text-sm">{highlight.event}</span>
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Podcast Tab */}
          <TabsContent value="podcast" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                { 
                  title: 'Análise Tática Completa', 
                  description: 'Breakdown detalhado de formações, padrões e decisões táticas',
                  duration: '25:30',
                  status: 'ready'
                },
                { 
                  title: 'Resumo da Partida', 
                  description: 'Principais momentos e destaques do jogo',
                  duration: '8:45',
                  status: 'ready'
                },
                { 
                  title: 'Debate: Torcedores', 
                  description: 'Perspectiva de cada lado da torcida',
                  duration: '15:00',
                  status: 'generating'
                },
              ].map((podcast, i) => (
                <Card key={i} variant="glow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Radio className="h-6 w-6 text-primary" />
                      </div>
                      <Badge variant={podcast.status === 'ready' ? 'success' : 'arena'}>
                        {podcast.status === 'ready' ? 'Pronto' : 'Gerando...'}
                      </Badge>
                    </div>
                    <h3 className="font-display text-lg font-semibold">{podcast.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{podcast.description}</p>
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{podcast.duration}</span>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button 
                        variant="arena" 
                        size="sm" 
                        className="flex-1"
                        disabled={podcast.status !== 'ready'}
                      >
                        <Play className="mr-1 h-4 w-4" />
                        Ouvir
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        disabled={podcast.status !== 'ready'}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Chatbots Tab */}
          <TabsContent value="chatbots" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Team A Chatbot */}
              <Card variant="glow" className="overflow-hidden">
                <div 
                  className="h-2"
                  style={{ backgroundColor: match.homeTeam.primaryColor }}
                />
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div 
                      className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
                      style={{ backgroundColor: match.homeTeam.primaryColor + '20', color: match.homeTeam.primaryColor }}
                    >
                      {match.homeTeam.shortName.slice(0, 2)}
                    </div>
                    <div>
                      <CardTitle>Torcedor {match.homeTeam.name}</CardTitle>
                      <CardDescription>Chatbot com perspectiva do time</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 rounded-lg bg-muted/50 p-4 max-h-60 overflow-y-auto">
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-sm">Como foi a atuação do Lewandowski?</p>
                      </div>
                    </div>
                    <div className="flex gap-3 flex-row-reverse">
                      <div 
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={{ backgroundColor: match.homeTeam.primaryColor + '20', color: match.homeTeam.primaryColor }}
                      >
                        {match.homeTeam.shortName.slice(0, 2)}
                      </div>
                      <div 
                        className="rounded-lg p-3"
                        style={{ backgroundColor: match.homeTeam.primaryColor + '15' }}
                      >
                        <p className="text-sm">O Lewandowski estava em dia de gala! Marcou um golaço aos 23 minutos e criou várias oportunidades. Fundamental para a vitória!</p>
                      </div>
                    </div>
                  </div>
                  <Button variant="arena-outline" className="w-full">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Iniciar Conversa
                  </Button>
                </CardContent>
              </Card>

              {/* Team B Chatbot */}
              <Card variant="glow" className="overflow-hidden">
                <div 
                  className="h-2"
                  style={{ backgroundColor: match.awayTeam.primaryColor === '#FFFFFF' ? '#00529F' : match.awayTeam.primaryColor }}
                />
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div 
                      className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
                      style={{ 
                        backgroundColor: (match.awayTeam.primaryColor === '#FFFFFF' ? '#00529F' : match.awayTeam.primaryColor) + '20', 
                        color: match.awayTeam.primaryColor === '#FFFFFF' ? '#00529F' : match.awayTeam.primaryColor 
                      }}
                    >
                      {match.awayTeam.shortName.slice(0, 2)}
                    </div>
                    <div>
                      <CardTitle>Torcedor {match.awayTeam.name}</CardTitle>
                      <CardDescription>Chatbot com perspectiva do time</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 rounded-lg bg-muted/50 p-4 max-h-60 overflow-y-auto">
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-sm">O que faltou para o time ganhar?</p>
                      </div>
                    </div>
                    <div className="flex gap-3 flex-row-reverse">
                      <div 
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={{ 
                          backgroundColor: (match.awayTeam.primaryColor === '#FFFFFF' ? '#00529F' : match.awayTeam.primaryColor) + '20', 
                          color: match.awayTeam.primaryColor === '#FFFFFF' ? '#00529F' : match.awayTeam.primaryColor 
                        }}
                      >
                        {match.awayTeam.shortName.slice(0, 2)}
                      </div>
                      <div 
                        className="rounded-lg p-3"
                        style={{ backgroundColor: (match.awayTeam.primaryColor === '#FFFFFF' ? '#00529F' : match.awayTeam.primaryColor) + '15' }}
                      >
                        <p className="text-sm">Faltou um pouco de sorte no final! O Bellingham empatou bem, mas a defesa falhou no gol da virada. Merecíamos pelo menos o empate.</p>
                      </div>
                    </div>
                  </div>
                  <Button variant="arena-outline" className="w-full">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Iniciar Conversa
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
