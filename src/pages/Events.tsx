import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EventTimeline } from '@/components/events/EventTimeline';
import { 
  Filter, 
  Download, 
  Calendar,
  Target,
  Shield,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { mockEvents, mockMatches } from '@/data/mockData';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Events() {
  const match = mockMatches[0];

  const eventCounts = {
    goals: mockEvents.filter(e => e.type === 'goal').length,
    shots: mockEvents.filter(e => e.type.includes('shot')).length,
    fouls: mockEvents.filter(e => e.type === 'foul' || e.type.includes('card')).length,
    tactical: mockEvents.filter(e => ['high_press', 'transition', 'ball_recovery'].includes(e.type)).length,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Eventos da Partida</h1>
            <p className="text-muted-foreground">
              {match.homeTeam.name} {match.score.home} - {match.score.away} {match.awayTeam.name}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filtrar
            </Button>
            <Button variant="arena-outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
                <p className="text-sm text-muted-foreground">Faltas/Cartões</p>
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
                <p className="text-sm text-muted-foreground">Eventos Táticos</p>
                <p className="font-display text-3xl font-bold">{eventCounts.tactical}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Timeline */}
          <div className="lg:col-span-2">
            <Card variant="glass">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Timeline Completa</CardTitle>
                <div className="flex gap-2">
                  <Select defaultValue="all">
                    <SelectTrigger className="w-32">
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
                  <Select defaultValue="all">
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="home">{match.homeTeam.shortName}</SelectItem>
                      <SelectItem value="away">{match.awayTeam.shortName}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <EventTimeline events={mockEvents} />
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
                    <span className="font-medium">5 eventos</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/2 bg-gradient-arena" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>2º Tempo</span>
                    <span className="font-medium">5 eventos</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/2 bg-gradient-arena" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <CardTitle>Por Time</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div 
                  className="flex items-center justify-between rounded-lg p-3"
                  style={{ backgroundColor: match.homeTeam.primaryColor + '15' }}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: match.homeTeam.primaryColor }}
                    />
                    <span className="font-medium">{match.homeTeam.shortName}</span>
                  </div>
                  <span className="text-lg font-bold">6</span>
                </div>
                <div 
                  className="flex items-center justify-between rounded-lg p-3"
                  style={{ backgroundColor: match.awayTeam.primaryColor === '#FFFFFF' ? '#00529F15' : match.awayTeam.primaryColor + '15' }}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: match.awayTeam.primaryColor === '#FFFFFF' ? '#00529F' : match.awayTeam.primaryColor }}
                    />
                    <span className="font-medium">{match.awayTeam.shortName}</span>
                  </div>
                  <span className="text-lg font-bold">4</span>
                </div>
              </CardContent>
            </Card>

            <Card variant="glow">
              <CardHeader>
                <CardTitle>Destaques</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge variant="goal">Gol</Badge>
                  <span className="text-sm">Lewandowski 23'</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="goal">Gol</Badge>
                  <span className="text-sm">Bellingham 56'</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="goal">Gol</Badge>
                  <span className="text-sm">Pedri 78'</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="save">Defesa</Badge>
                  <span className="text-sm">Ter Stegen 41'</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
