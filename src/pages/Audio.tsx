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
  Users,
  AlertCircle
} from 'lucide-react';
import { useState } from 'react';
import { useAllCompletedMatches, useMatchEvents, useMatchAnalysis } from '@/hooks/useMatchDetails';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Audio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const { data: matches, isLoading: matchesLoading } = useAllCompletedMatches();
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  
  const selectedMatch = matches?.find(m => m.id === selectedMatchId) || matches?.[0];
  const matchId = selectedMatch?.id || '';
  
  const { data: events } = useMatchEvents(matchId);
  const { data: analysis } = useMatchAnalysis(matchId);

  // Get highlights from events (goals, saves, etc.)
  const highlights = events?.filter(e => 
    ['goal', 'shot_on_target', 'save', 'red_card'].includes(e.event_type)
  ).map(e => ({
    time: `${e.minute}'`,
    event: e.description || e.event_type
  })) || [];

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

  const homeTeamName = selectedMatch?.home_team?.name || 'Time Casa';
  const awayTeamName = selectedMatch?.away_team?.name || 'Time Fora';
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
              Gere narrações, podcasts e análises em áudio
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
              Gerar Áudio
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
                    <p className="font-semibold">{homeTeamName}</p>
                    <p className="text-2xl font-bold">{selectedMatch.home_score || 0}</p>
                  </div>
                  <span className="text-muted-foreground">vs</span>
                  <div className="text-center">
                    <p className="font-semibold">{awayTeamName}</p>
                    <p className="text-2xl font-bold">{selectedMatch.away_score || 0}</p>
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
                          {homeTeamName} vs {awayTeamName}
                        </CardDescription>
                      </div>
                      <Badge variant="arena">Em breve</Badge>
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
                        disabled
                      >
                        {isPlaying ? (
                          <Pause className="h-6 w-6" />
                        ) : (
                          <Play className="h-6 w-6 ml-1" />
                        )}
                      </Button>
                      <div className="flex-1">
                        <Progress value={0} className="h-2" />
                        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                          <span>00:00</span>
                          <span>--:--</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" disabled>
                        <Volume2 className="h-5 w-5" />
                      </Button>
                      <Button variant="outline" disabled>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </div>

                    {/* Info */}
                    <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold">--:--</p>
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
              {[
                { 
                  title: 'Análise Tática Completa', 
                  description: `Breakdown detalhado de ${homeTeamName} vs ${awayTeamName}`,
                  duration: '--:--',
                  status: 'pending',
                  hasData: !!analysis?.tacticalAnalysis
                },
                { 
                  title: 'Resumo da Partida', 
                  description: 'Principais momentos e destaques do jogo',
                  duration: '--:--',
                  status: 'pending',
                  hasData: events && events.length > 0
                },
                { 
                  title: 'Debate: Torcedores', 
                  description: `Perspectiva de ${homeTeamName} e ${awayTeamName}`,
                  duration: '--:--',
                  status: 'pending',
                  hasData: false
                },
              ].map((podcast, i) => (
                <Card key={i} variant="glow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Radio className="h-6 w-6 text-primary" />
                      </div>
                      <Badge variant={podcast.hasData ? 'arena' : 'secondary'}>
                        {podcast.hasData ? 'Dados disponíveis' : 'Sem dados'}
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
                        disabled={!podcast.hasData}
                      >
                        <Sparkles className="mr-1 h-4 w-4" />
                        Gerar
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        disabled
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
                <div className="h-2 bg-primary" />
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
                      {homeTeamShort.slice(0, 2)}
                    </div>
                    <div>
                      <CardTitle>Torcedor {homeTeamName}</CardTitle>
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
                        <p className="text-sm">Como foi a partida do {homeTeamName}?</p>
                      </div>
                    </div>
                    <div className="flex gap-3 flex-row-reverse">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                        {homeTeamShort.slice(0, 2)}
                      </div>
                      <div className="rounded-lg p-3 bg-primary/10">
                        <p className="text-sm">
                          {analysis?.tacticalAnalysis?.insights?.[0] || 
                            `A partida contra ${awayTeamName} teve ${events?.length || 0} eventos registrados. ` +
                            `O placar final foi ${selectedMatch?.home_score || 0} x ${selectedMatch?.away_score || 0}.`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button variant="arena-outline" className="w-full" disabled>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Iniciar Conversa (Em breve)
                  </Button>
                </CardContent>
              </Card>

              {/* Team B Chatbot */}
              <Card variant="glow" className="overflow-hidden">
                <div className="h-2 bg-secondary" />
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/20 text-lg font-bold text-secondary-foreground">
                      {awayTeamShort.slice(0, 2)}
                    </div>
                    <div>
                      <CardTitle>Torcedor {awayTeamName}</CardTitle>
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
                        <p className="text-sm">O que aconteceu no jogo?</p>
                      </div>
                    </div>
                    <div className="flex gap-3 flex-row-reverse">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-xs font-bold">
                        {awayTeamShort.slice(0, 2)}
                      </div>
                      <div className="rounded-lg p-3 bg-secondary/10">
                        <p className="text-sm">
                          {analysis?.tacticalAnalysis?.patterns?.[0]?.description || 
                            `Jogamos contra ${homeTeamName} e o resultado foi ${selectedMatch?.away_score || 0} x ${selectedMatch?.home_score || 0}. ` +
                            `Foram ${events?.length || 0} eventos durante a partida.`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button variant="arena-outline" className="w-full" disabled>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Iniciar Conversa (Em breve)
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
