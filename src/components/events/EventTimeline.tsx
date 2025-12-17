import { MatchEvent, Team } from '@/types/arena';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TeamBadge } from '@/components/teams/TeamBadge';
import { Star, Pencil, Play } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface EventTimelineProps {
  events: MatchEvent[];
  className?: string;
  onEditEvent?: (event: MatchEvent) => void;
  onPlayVideo?: (eventId: string, eventMinute: number) => void;
  hasVideo?: boolean;
  homeTeam?: Team | { id: string; name: string; short_name?: string; logo_url?: string; primary_color?: string };
  awayTeam?: Team | { id: string; name: string; short_name?: string; logo_url?: string; primary_color?: string };
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

export function EventTimeline({ events, className, onEditEvent, onPlayVideo, hasVideo, homeTeam, awayTeam }: EventTimelineProps) {
  const { isAdmin } = useAuth();

  const getTeam = (event: MatchEvent) => {
    // Try to get team from metadata first
    const metadata = event.metadata as { team?: string; teamName?: string } | null;
    
    if (metadata?.team === 'home' && homeTeam) return homeTeam;
    if (metadata?.team === 'away' && awayTeam) return awayTeam;
    if (metadata?.teamName === homeTeam?.name && homeTeam) return homeTeam;
    if (metadata?.teamName === awayTeam?.name && awayTeam) return awayTeam;
    
    // Fallback to teamId matching
    if (event.teamId === homeTeam?.id) return homeTeam;
    if (event.teamId === awayTeam?.id) return awayTeam;
    
    return null;
  };

  const isHighlightEvent = (eventType: string) => {
    return highlightEventTypes.includes(eventType);
  };

  // Get event time from metadata.eventMs (milliseconds) as primary source
  const getEventTimeMs = (event: MatchEvent): number => {
    const metadata = event.metadata as { eventMs?: number; videoSecond?: number } | null;
    
    // Priority: eventMs (ms) > videoSecond (s) > minute+second
    if (metadata?.eventMs !== undefined) {
      return metadata.eventMs;
    }
    if (metadata?.videoSecond !== undefined) {
      return metadata.videoSecond * 1000;
    }
    return ((event.minute || 0) * 60 + (event.second || 0)) * 1000;
  };

  // Format time from milliseconds to MM:SS display
  const formatEventTime = (event: MatchEvent) => {
    const totalMs = getEventTimeMs(event);
    const totalSeconds = Math.floor(totalMs / 1000);
    const displayMinutes = Math.floor(totalSeconds / 60);
    const displaySeconds = totalSeconds % 60;
    return {
      minutes: displayMinutes.toString().padStart(2, '0'),
      seconds: displaySeconds.toString().padStart(2, '0'),
      totalMs,
      totalSeconds
    };
  };

  return (
    <div className={cn("space-y-3", className)}>
      {events.map((event, index) => {
        const team = getTeam(event);
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
                    <div className="flex items-center gap-1.5">
                      <TeamBadge team={team} size="xs" />
                      <span className="text-xs font-medium text-muted-foreground">
                        {'short_name' in team ? team.short_name : 'shortName' in team ? team.shortName : team.name}
                      </span>
                    </div>
                  )}
                </div>
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
