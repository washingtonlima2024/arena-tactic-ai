import { MatchEvent } from '@/types/arena';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mockPlayers, mockTeams } from '@/data/mockData';
import { Star, Pencil, Play } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface EventTimelineProps {
  events: MatchEvent[];
  className?: string;
  onEditEvent?: (event: MatchEvent) => void;
  onPlayVideo?: (eventId: string, eventMinute: number) => void;
  hasVideo?: boolean;
}

const eventIcons: Record<string, string> = {
  goal: '⚽',
  assist: '👟',
  shot: '🎯',
  shot_on_target: '🎯',
  save: '🧤',
  foul: '⚠️',
  yellow_card: '🟨',
  red_card: '🟥',
  offside: '🚩',
  corner: '📐',
  free_kick: '🦵',
  penalty: '⭕',
  substitution: '🔄',
  high_press: '⚡',
  transition: '💨',
  ball_recovery: '🔃',
};

const eventLabels: Record<string, string> = {
  goal: 'Gol',
  assist: 'Assistência',
  shot: 'Finalização',
  shot_on_target: 'Finalização no Gol',
  save: 'Defesa',
  foul: 'Falta',
  yellow_card: 'Cartão Amarelo',
  red_card: 'Cartão Vermelho',
  offside: 'Impedimento',
  corner: 'Escanteio',
  free_kick: 'Falta',
  penalty: 'Pênalti',
  substitution: 'Substituição',
  high_press: 'Pressão Alta',
  transition: 'Transição',
  ball_recovery: 'Recuperação',
};

const eventBadgeVariants: Record<string, any> = {
  goal: 'goal',
  assist: 'assist',
  shot: 'shot',
  shot_on_target: 'shot',
  save: 'save',
  foul: 'foul',
  yellow_card: 'card-yellow',
  red_card: 'card-red',
  offside: 'offside',
};

// Events that should be highlighted
const highlightEventTypes = ['goal', 'penalty'];

export function EventTimeline({ events, className, onEditEvent, onPlayVideo, hasVideo }: EventTimelineProps) {
  const { isAdmin } = useAuth();

  const getPlayer = (playerId?: string) => {
    if (!playerId) return null;
    return mockPlayers.find(p => p.id === playerId);
  };

  const getTeam = (teamId: string) => {
    return mockTeams.find(t => t.id === teamId);
  };

  const isHighlightEvent = (eventType: string) => {
    return highlightEventTypes.includes(eventType);
  };

  // Format time from seconds or minute:second to display format
  const formatEventTime = (event: MatchEvent) => {
    // If we have second, calculate total seconds and format as MM:SS
    const totalSeconds = (event.minute * 60) + (event.second || 0);
    const displayMinutes = Math.floor(totalSeconds / 60);
    const displaySeconds = totalSeconds % 60;
    return {
      minutes: displayMinutes.toString().padStart(2, '0'),
      seconds: displaySeconds.toString().padStart(2, '0')
    };
  };

  return (
    <div className={cn("space-y-3", className)}>
      {events.map((event, index) => {
        const player = getPlayer(event.playerId);
        const team = getTeam(event.teamId);
        const isHighlight = isHighlightEvent(event.type);
        const timeDisplay = formatEventTime(event);

        return (
          <div 
            key={event.id}
            className={cn(
              "group flex items-start gap-3 rounded-lg p-3 transition-all",
              isHighlight 
                ? "border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-transparent shadow-[0_0_20px_rgba(234,179,8,0.1)]" 
                : "hover:bg-muted/50"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Play Button */}
            {hasVideo && onPlayVideo && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 hover:bg-primary/20"
                onClick={() => onPlayVideo(event.id, event.minute)}
                title="Reproduzir vídeo"
              >
                <Play className="h-4 w-4 text-primary" />
              </Button>
            )}

            {/* Time */}
            <div className="flex w-14 flex-col items-center">
              <span className={cn(
                "text-base font-bold font-mono",
                isHighlight ? "text-yellow-500" : "text-primary"
              )}>{timeDisplay.minutes}:{timeDisplay.seconds}</span>
            </div>

            {/* Line */}
            <div className="relative flex flex-col items-center">
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-lg",
                isHighlight 
                  ? "bg-yellow-500/20 ring-2 ring-yellow-500/50" 
                  : "bg-muted group-hover:bg-primary/20"
              )}>
                {eventIcons[event.type] || '•'}
              </div>
              {index < events.length - 1 && (
                <div className="h-full w-px flex-1 bg-border" />
              )}
            </div>

            {/* Content */}
            <div className="flex flex-1 items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {isHighlight && (
                    <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  )}
                  <Badge variant={isHighlight ? 'highlight' : (eventBadgeVariants[event.type] || 'secondary')}>
                    {eventLabels[event.type] || event.type}
                  </Badge>
                  {team && (
                    <span 
                      className="rounded px-1.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: team.primaryColor + '20', color: team.primaryColor }}
                    >
                      {team.shortName}
                    </span>
                  )}
                </div>
                {player && (
                  <p className="text-sm">
                    <span className="font-medium">{player.name}</span>
                    <span className="text-muted-foreground"> #{player.number}</span>
                  </p>
                )}
                {event.description && (
                  <p className="text-xs text-muted-foreground">{event.description}</p>
                )}
              </div>

              {/* Admin Edit Button */}
              {isAdmin && onEditEvent && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onEditEvent(event)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
