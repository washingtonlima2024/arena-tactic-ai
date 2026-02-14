import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Clock,
  Play,
  Film,
  ExternalLink,
  Copy,
  Download,
  List,
} from 'lucide-react';
import { getEventLabel } from '@/lib/eventLabels';
import { toast } from '@/hooks/use-toast';

interface MatchEvent {
  id: string;
  event_type: string;
  minute: number | null;
  second: number | null;
  description: string | null;
  clip_url: string | null;
  is_highlight: boolean | null;
  metadata: Record<string, any> | null;
  match_half?: string | null;
}

interface AnalysisEventTimelineProps {
  events: MatchEvent[];
  homeTeamName: string;
  awayTeamName: string;
  onPlayEvent?: (eventId: string) => void;
  getThumbnail?: (eventId: string) => { imageUrl: string } | null;
  onPlayClip?: (clipUrl: string) => void;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  goal: 'bg-green-500/20 text-green-400 border-green-500/30',
  shot: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  shot_on_target: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  save: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  yellow_card: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  red_card: 'bg-red-500/20 text-red-400 border-red-500/30',
  penalty: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  corner: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  foul: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  high_press: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  transition: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  ball_recovery: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

export function AnalysisEventTimeline({
  events,
  homeTeamName,
  awayTeamName,
  onPlayEvent,
  getThumbnail,
  onPlayClip,
}: AnalysisEventTimelineProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterTeam, setFilterTeam] = useState<string>('all');

  const eventTypes = useMemo(() => {
    const types = new Set(events.map(e => e.event_type));
    return Array.from(types).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    let result = [...events];

    if (filterType !== 'all') {
      result = result.filter(e => e.event_type === filterType);
    }

    if (filterTeam !== 'all') {
      result = result.filter(e => {
        const meta = e.metadata as { team?: string } | null;
        const team = meta?.team || '';
        const desc = (e.description || '').toLowerCase();

        if (filterTeam === 'home') {
          return team === 'home' || team === 'casa' || desc.includes(homeTeamName.toLowerCase().slice(0, 4));
        }
        return team === 'away' || team === 'visitante' || team === 'fora' || desc.includes(awayTeamName.toLowerCase().slice(0, 4));
      });
    }

    return result.sort((a, b) => (a.minute || 0) - (b.minute || 0));
  }, [events, filterType, filterTeam, homeTeamName, awayTeamName]);

  if (events.length === 0) return null;

  return (
    <Card variant="glass" className="animate-fade-in">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <List className="h-5 w-5 text-primary" />
            Timeline de Eventos ({filteredEvents.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {eventTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {getEventLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ambos</SelectItem>
                <SelectItem value="home">{homeTeamName}</SelectItem>
                <SelectItem value="away">{awayTeamName}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-2">
            {(() => {
              let lastPhase = '';
              
              const getPhaseLabel = (event: MatchEvent) => {
                const min = event.minute || 0;
                const half = (event.metadata as any)?.half || event.match_half;
                
                if (half === 'first_half' || half === 'first') {
                  return min > 45 ? 'Acréscimos 1T' : '1º Tempo';
                }
                if (half === 'second_half' || half === 'second') {
                  return min > 90 ? 'Acréscimos 2T' : '2º Tempo';
                }
                if (min <= 45) return '1º Tempo';
                if (min <= 50) return 'Acréscimos 1T';
                if (min <= 90) return '2º Tempo';
                return 'Acréscimos 2T';
              };

              return filteredEvents.map(event => {
                const thumbnail = getThumbnail?.(event.id);
                const colorClass = EVENT_TYPE_COLORS[event.event_type] || 'bg-muted';
                const phase = getPhaseLabel(event);
                const showSeparator = phase !== lastPhase;
                lastPhase = phase;

                return (
                  <div key={event.id}>
                    {/* Phase separator */}
                    {showSeparator && (
                      <div className="flex items-center gap-2 py-2 mb-1">
                        <div className="flex-1 h-px bg-border" />
                        <Badge variant="outline" className="text-xs font-medium text-muted-foreground shrink-0">
                          {phase}
                        </Badge>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}

                    <div
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/10 p-3 hover:border-primary/30 transition-colors"
                    >
                      {/* Minute badge */}
                      <Badge variant="outline" className={`shrink-0 font-mono text-xs ${colorClass}`}>
                        <Clock className="h-3 w-3 mr-1" />
                        {event.minute != null ? `${event.minute}'` : '--'}
                      </Badge>

                      {/* Thumbnail */}
                      {thumbnail && (
                        <img
                          src={thumbnail.imageUrl}
                          alt={event.event_type}
                          className="w-14 h-9 object-cover rounded shrink-0"
                        />
                      )}

                      {/* Event info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className={`text-xs ${colorClass}`}>
                            {getEventLabel(event.event_type)}
                          </Badge>
                          {event.match_half && (
                            <span className="text-xs text-muted-foreground">
                              {event.match_half === 'first' ? '1T' : '2T'}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {event.description}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {onPlayEvent && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onPlayEvent(event.id)}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {event.clip_url && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="secondary" size="sm" className="h-7 gap-1 text-xs">
                                <Film className="h-3 w-3" />
                                Clip
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                if (onPlayClip) {
                                  onPlayClip(event.clip_url!);
                                } else {
                                  window.open(event.clip_url!, '_blank');
                                }
                              }}>
                                <Play className="mr-2 h-4 w-4" />
                                Assistir
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                navigator.clipboard.writeText(event.clip_url!);
                                toast({ title: 'Link copiado!' });
                              }}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copiar Link
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a href={event.clip_url} download target="_blank" rel="noopener noreferrer">
                                  <Download className="mr-2 h-4 w-4" />
                                  Download
                                </a>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
