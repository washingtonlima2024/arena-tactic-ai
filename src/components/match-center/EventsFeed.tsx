import { useState } from 'react';
import { normalizeStorageUrl } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, Sparkles, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEventLabel, getEventIcon } from '@/lib/eventLabels';
import { groupEventsByPhase } from '@/lib/matchPhases';
import { getEventTeam } from '@/lib/eventHelpers';

interface EventsFeedProps {
  events: any[];
  thumbnails?: any[];
  selectedEventId?: string | null;
  onSelectEvent: (event: any) => void;
  isGeneratingComments?: boolean;
  onGenerateComments?: () => void;
  homeTeam?: { id: string; name: string; short_name?: string | null };
  awayTeam?: { id: string; name: string; short_name?: string | null };
}

const EVENT_BG: Record<string, string> = {
  goal: 'bg-emerald-500/15',
  yellow_card: 'bg-yellow-500/15',
  red_card: 'bg-red-500/15',
  penalty: 'bg-purple-500/15',
  save: 'bg-blue-500/15',
  foul: 'bg-orange-500/15',
  corner: 'bg-cyan-500/15',
  shot: 'bg-pink-500/15',
};

const EVENT_TEXT: Record<string, string> = {
  goal: 'text-emerald-400',
  yellow_card: 'text-yellow-400',
  red_card: 'text-red-400',
  penalty: 'text-purple-400',
  save: 'text-blue-400',
  foul: 'text-orange-400',
  corner: 'text-cyan-400',
  shot: 'text-pink-400',
};

export function EventsFeed({ events, thumbnails = [], selectedEventId, onSelectEvent, isGeneratingComments, onGenerateComments, homeTeam, awayTeam }: EventsFeedProps) {
  const [filter, setFilter] = useState<string>('all');

  const getThumbnail = (eventId: string) => {
    const thumb = thumbnails.find((t: any) => t.event_id === eventId);
    return thumb?.image_url ? normalizeStorageUrl(thumb.image_url) : null;
  };

  const filtered = filter === 'all' ? events : events.filter((e: any) => e.event_type === filter);

  const hasAnyComment = events.some((e: any) => e.metadata?.ai_comment);
  const needsComments = events.length > 0 && !hasAnyComment;

  const getTeamType = (event: any) => {
    const { teamType } = getEventTeam(
      { metadata: event.metadata, event_type: event.event_type },
      homeTeam || null,
      awayTeam || null
    );
    return teamType;
  };

  const phaseGroups = groupEventsByPhase(filtered, getTeamType);

  const homeShort = (homeTeam?.short_name || homeTeam?.name?.slice(0, 3) || 'CAS').toUpperCase();
  const awayShort = (awayTeam?.short_name || awayTeam?.name?.slice(0, 3) || 'VIS').toUpperCase();

  return (
    <Card className="overflow-hidden border-primary/20 flex flex-col h-full max-h-full">
      <CardHeader className="pb-2 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Linha do Tempo
          </CardTitle>
          <div className="flex gap-1 flex-wrap">
            {['all', 'goal', 'yellow_card', 'foul'].map(f => (
              <Button key={f} variant={filter === f ? 'default' : 'ghost'} size="sm" className="h-7 text-xs px-2"
                onClick={() => setFilter(f)}>
                {f === 'all' ? 'Todos' : getEventLabel(f)}
              </Button>
            ))}
          </div>
        </div>
        {needsComments && onGenerateComments && (
          <Button variant="outline" size="sm" className="mt-2 gap-2 text-xs" onClick={onGenerateComments} disabled={isGeneratingComments}>
            {isGeneratingComments ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isGeneratingComments ? 'Gerando comentários...' : 'Gerar Comentários IA'}
          </Button>
        )}
      </CardHeader>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-3 space-y-1">
          {phaseGroups.length > 0 ? phaseGroups.map((group) => (
            <div key={group.phase}>
              {group.phase === 'Intervalo' ? (
                <div className="flex items-center gap-3 py-4 my-2">
                  <div className="flex-1 h-0.5 bg-border" />
                  <div className="flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-full bg-muted/50 border border-border">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Intervalo</span>
                  </div>
                  <div className="flex-1 h-0.5 bg-border" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 py-2 my-1">
                    <div className="flex-1 h-px bg-border" />
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs font-semibold text-muted-foreground">
                        {group.phase}
                      </Badge>
                      <span className="text-xs font-mono font-bold text-primary">
                        {homeShort} {group.homeGoals} × {group.awayGoals} {awayShort}
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="space-y-2">
                    {group.events.map((event: any) => {
                      const aiComment = (event.metadata as any)?.ai_comment;
                      return (
                        <div
                          key={event.id}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-all hover:border-primary/40",
                            selectedEventId === event.id ? "border-primary bg-primary/5" : "border-border"
                          )}
                          onClick={() => onSelectEvent(event)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden", EVENT_BG[event.event_type] || 'bg-muted')}>
                              {(() => {
                                const thumb = getThumbnail(event.id);
                                return thumb ? (
                                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-lg">{getEventIcon(event.event_type)}</span>
                                );
                              })()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn("font-semibold text-sm", EVENT_TEXT[event.event_type] || 'text-foreground')}>
                                  {getEventLabel(event.event_type)}
                                </span>
                                <Badge variant="secondary" className="text-[10px] h-5">{event.minute}'</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {event.description || 'Lance da partida'}
                              </p>
                              {aiComment && (
                                <div className="mt-2 p-2.5 rounded-md bg-gradient-to-r from-primary/5 to-transparent border-l-2 border-primary/50">
                                  <div className="flex items-start gap-2">
                                    <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                                    <p className="text-sm leading-relaxed text-muted-foreground">{aiComment}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Activity className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Nenhum evento encontrado</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
