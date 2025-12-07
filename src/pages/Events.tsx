import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Filter, 
  Download, 
  Target,
  Shield,
  AlertTriangle,
  Zap,
  Loader2,
  Video,
  Plus
} from 'lucide-react';
import { useAllCompletedMatches, useMatchEvents } from '@/hooks/useMatchDetails';
import { Link } from 'react-router-dom';

export default function Events() {
  const { data: matches = [], isLoading: matchesLoading } = useAllCompletedMatches();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Auto-select first match if none selected
  const currentMatchId = selectedMatchId || matches[0]?.id || null;
  const selectedMatch = matches.find(m => m.id === currentMatchId);
  
  const { data: events = [], isLoading: eventsLoading } = useMatchEvents(currentMatchId);

  // Filter events by type
  const filteredEvents = events.filter(event => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'goals') return event.event_type === 'goal';
    if (typeFilter === 'shots') return event.event_type.includes('shot');
    if (typeFilter === 'fouls') return event.event_type === 'foul' || event.event_type.includes('card');
    if (typeFilter === 'tactical') return ['high_press', 'transition', 'ball_recovery', 'substitution'].includes(event.event_type);
    return true;
  });

  // Calculate counts
  const eventCounts = {
    goals: events.filter(e => e.event_type === 'goal').length,
    shots: events.filter(e => e.event_type.includes('shot')).length,
    fouls: events.filter(e => e.event_type === 'foul' || e.event_type.includes('card')).length,
    tactical: events.filter(e => ['high_press', 'transition', 'ball_recovery', 'substitution'].includes(e.event_type)).length,
  };

  // Group events by half
  const firstHalfEvents = filteredEvents.filter(e => (e.minute || 0) <= 45);
  const secondHalfEvents = filteredEvents.filter(e => (e.minute || 0) > 45);

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
          <div className="flex gap-2">
            <Select value={currentMatchId || ''} onValueChange={setSelectedMatchId}>
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
                <CardTitle>Timeline de Eventos ({filteredEvents.length})</CardTitle>
                <div className="flex gap-2">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-40">
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
                  <div className="space-y-3">
                    {filteredEvents.map((event) => (
                      <div 
                        key={event.id}
                        className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-3 hover:bg-muted/50 transition-colors"
                      >
                        <Badge 
                          variant={
                            event.event_type === 'goal' ? 'success' :
                            event.event_type.includes('card') ? 'destructive' :
                            event.event_type === 'foul' ? 'warning' : 'outline'
                          }
                          className="min-w-[50px] justify-center"
                        >
                          {event.minute ? `${event.minute}'` : '—'}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium capitalize truncate">
                            {event.event_type.replace(/_/g, ' ')}
                          </p>
                          {event.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {event.description}
                            </p>
                          )}
                        </div>
                        {event.metadata?.team && (
                          <Badge variant="outline" className="shrink-0">
                            {event.metadata.team}
                          </Badge>
                        )}
                      </div>
                    ))}
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
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: selectedMatch.home_team.primary_color }}
                      />
                      <span className="font-medium">{selectedMatch.home_team.short_name}</span>
                    </div>
                    <span className="text-lg font-bold">
                      {events.filter(e => e.metadata?.team === selectedMatch.home_team?.name).length}
                    </span>
                  </div>
                )}
                {selectedMatch?.away_team && (
                  <div 
                    className="flex items-center justify-between rounded-lg p-3"
                    style={{ backgroundColor: (selectedMatch.away_team.primary_color === '#FFFFFF' ? '#00529F' : selectedMatch.away_team.primary_color) + '15' }}
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: selectedMatch.away_team.primary_color === '#FFFFFF' ? '#00529F' : selectedMatch.away_team.primary_color }}
                      />
                      <span className="font-medium">{selectedMatch.away_team.short_name}</span>
                    </div>
                    <span className="text-lg font-bold">
                      {events.filter(e => e.metadata?.team === selectedMatch.away_team?.name).length}
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
      </div>
    </AppLayout>
  );
}
