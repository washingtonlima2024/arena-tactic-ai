import { useState, useRef } from 'react';
import { MatchEvent, Team } from '@/types/arena';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TeamBadge } from '@/components/teams/TeamBadge';
import { Star, Pencil, Play, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getEventTeam, getEventTimeMs, formatEventTime } from '@/lib/eventHelpers';
import { apiClient } from '@/lib/apiClient';

interface EventTimelineProps {
  events: MatchEvent[];
  className?: string;
  onEditEvent?: (event: MatchEvent) => void;
  onPlayVideo?: (eventId: string, eventMinute: number) => void;
  hasVideo?: boolean;
  matchId?: string;
  homeTeam?: Team | { id: string; name: string; short_name?: string; logo_url?: string; primary_color?: string };
  awayTeam?: Team | { id: string; name: string; short_name?: string; logo_url?: string; primary_color?: string };
}

const eventIcons: Record<string, string> = {
  goal: '⚽',
  goal_home: '⚽',
  goal_away: '⚽',
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
  halftime: '⏸️',
  kickoff: '▶️',
  fulltime: '🏁',
};

const eventLabels: Record<string, string> = {
  goal: 'Gol',
  goal_home: 'Gol Casa',
  goal_away: 'Gol Fora',
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
  halftime: 'Intervalo',
  kickoff: 'Início',
  fulltime: 'Fim de Jogo',
};

const eventBadgeVariants: Record<string, any> = {
  goal: 'goal',
  goal_home: 'goal',
  goal_away: 'goal',
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

export function EventTimeline({ events, className, onEditEvent, onPlayVideo, hasVideo, matchId, homeTeam, awayTeam }: EventTimelineProps) {
  const { isAdmin } = useAuth();
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getTeam = (event: MatchEvent) => {
    const { team } = getEventTeam(
      { metadata: event.metadata as any, event_type: event.type },
      homeTeam ? { id: homeTeam.id, name: homeTeam.name, short_name: 'short_name' in homeTeam ? homeTeam.short_name : ('shortName' in homeTeam ? homeTeam.shortName : null), logo_url: 'logo_url' in homeTeam ? homeTeam.logo_url : ('logo' in homeTeam ? homeTeam.logo : null), primary_color: 'primary_color' in homeTeam ? homeTeam.primary_color : ('primaryColor' in homeTeam ? homeTeam.primaryColor : null) } : null,
      awayTeam ? { id: awayTeam.id, name: awayTeam.name, short_name: 'short_name' in awayTeam ? awayTeam.short_name : ('shortName' in awayTeam ? awayTeam.shortName : null), logo_url: 'logo_url' in awayTeam ? awayTeam.logo_url : ('logo' in awayTeam ? awayTeam.logo : null), primary_color: 'primary_color' in awayTeam ? awayTeam.primary_color : ('primaryColor' in awayTeam ? awayTeam.primaryColor : null) } : null
    );
    return team;
  };

  const isHighlightEvent = (eventType: string) => {
    return highlightEventTypes.includes(eventType);
  };

  // Format time from event for display
  const formatEventTimeDisplay = (event: MatchEvent) => {
    const totalMs = getEventTimeMs({ 
      minute: event.minute, 
      second: event.second, 
      metadata: event.metadata as any 
    });
    const videoSecond = (event.metadata as any)?.videoSecond;
    return {
      formatted: formatEventTime(totalMs),
      totalMs,
      totalSeconds: Math.floor(totalMs / 1000),
      videoSecond: videoSecond ?? Math.floor(totalMs / 1000)
    };
  };

  const handlePlayAudio = async (event: MatchEvent) => {
    const timeDisplay = formatEventTimeDisplay(event);
    
    // If already playing this event, stop it
    if (playingAudioId === event.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudioId(null);
      return;
    }
    
    // Stop any existing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    if (!matchId) return;
    
    setLoadingAudioId(event.id);
    
    try {
      // Extract audio for 15 seconds starting 5 seconds before the event
      const result = await apiClient.extractGoalAudio(matchId, timeDisplay.videoSecond, 15);
      
      if (result?.audioUrl) {
        const audio = new Audio(result.audioUrl);
        audioRef.current = audio;
        
        audio.onended = () => {
          setPlayingAudioId(null);
          audioRef.current = null;
        };
        
        audio.onerror = () => {
          setPlayingAudioId(null);
          audioRef.current = null;
        };
        
        await audio.play();
        setPlayingAudioId(event.id);
      }
    } catch (error) {
      console.error('Error extracting audio:', error);
    } finally {
      setLoadingAudioId(null);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {events.map((event, index) => {
        const team = getTeam(event);
        const isHighlight = isHighlightEvent(event.type);
        const timeDisplay = formatEventTimeDisplay(event);

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
            {/* Play Video Button */}
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

            {/* Play Audio Button - shows whenever matchId exists (doesn't require video) */}
            {matchId && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 shrink-0",
                  playingAudioId === event.id 
                    ? "bg-yellow-500/20 hover:bg-yellow-500/30" 
                    : "hover:bg-primary/20"
                )}
                onClick={() => handlePlayAudio(event)}
                title={playingAudioId === event.id ? "Pausar áudio" : "Ouvir narração"}
                disabled={loadingAudioId === event.id}
              >
                {loadingAudioId === event.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : playingAudioId === event.id ? (
                  <VolumeX className="h-4 w-4 text-yellow-500" />
                ) : (
                  <Volume2 className="h-4 w-4 text-muted-foreground hover:text-primary" />
                )}
              </Button>
            )}

            <div className="flex w-14 flex-col items-center">
              <span className={cn(
                "text-base font-bold font-mono",
                isHighlight ? "text-yellow-500" : "text-primary"
              )}>{timeDisplay.formatted}</span>
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
                      <TeamBadge team={team as any} size="xs" />
                      <span className="text-xs font-medium text-muted-foreground">
                        {team.short_name || team.name}
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
