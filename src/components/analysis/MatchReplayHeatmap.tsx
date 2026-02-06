import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { OfficialFootballField } from '@/components/tactical/OfficialFootballField';
import { metersToSvg } from '@/constants/fieldDimensions';
import { getEventLabel } from '@/lib/eventLabels';
import { Play, Pause, RotateCcw, MapPin, Film } from 'lucide-react';

interface MatchEvent {
  id: string;
  event_type: string;
  minute: number | null;
  second: number | null;
  description: string | null;
  position_x: number | null;
  position_y: number | null;
  clip_url: string | null;
  metadata: Record<string, any> | null;
}

interface MatchReplayHeatmapProps {
  events: MatchEvent[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeamColor: string;
  awayTeamColor: string;
  onPlayClip?: (clipUrl: string) => void;
}

// Assign a fallback position if missing
function getEventPosition(event: MatchEvent, isHome: boolean): { x: number; y: number } {
  if (event.position_x != null && event.position_y != null) {
    return { x: event.position_x, y: event.position_y };
  }

  const type = event.event_type;
  const rand = () => Math.random();

  if (['goal', 'shot', 'shot_on_target', 'penalty'].includes(type)) {
    return { x: isHome ? 85 + rand() * 10 : 5 + rand() * 10, y: 25 + rand() * 18 };
  }
  if (['corner', 'cross'].includes(type)) {
    return { x: isHome ? 92 + rand() * 5 : 3 + rand() * 5, y: rand() > 0.5 ? 5 + rand() * 10 : 53 + rand() * 10 };
  }
  if (type === 'save') {
    return { x: isHome ? 3 + rand() * 5 : 92 + rand() * 5, y: 28 + rand() * 12 };
  }
  if (['high_press', 'ball_recovery'].includes(type)) {
    return { x: isHome ? 55 + rand() * 25 : 20 + rand() * 25, y: 15 + rand() * 38 };
  }
  return { x: 30 + rand() * 45, y: 15 + rand() * 38 };
}

function getTeamFromEvent(event: MatchEvent, homeName: string): 'home' | 'away' {
  const meta = event.metadata as { team?: string } | null;
  if (meta?.team === 'home' || meta?.team === 'casa') return 'home';
  if (meta?.team === 'away' || meta?.team === 'visitante' || meta?.team === 'fora') return 'away';

  const desc = (event.description || '').toLowerCase();
  if (homeName && desc.includes(homeName.toLowerCase().slice(0, 4))) return 'home';
  return 'away';
}

const SPEEDS = [1, 2, 4] as const;

export function MatchReplayHeatmap({
  events,
  homeTeamName,
  awayTeamName,
  homeTeamColor,
  awayTeamColor,
  onPlayClip,
}: MatchReplayHeatmapProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMinute, setCurrentMinute] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maxMinute = useMemo(() => {
    const minutes = events.map(e => e.minute || 0);
    return Math.max(90, ...minutes);
  }, [events]);

  // Events up to current minute
  const visibleEvents = useMemo(
    () => events.filter(e => (e.minute || 0) <= currentMinute),
    [events, currentMinute]
  );

  // Recent events (within last 3 minutes) get pulsing effect
  const recentEvents = useMemo(
    () => events.filter(e => {
      const m = e.minute || 0;
      return m <= currentMinute && m >= currentMinute - 3;
    }),
    [events, currentMinute]
  );

  const recentIds = useMemo(() => new Set(recentEvents.map(e => e.id)), [recentEvents]);

  // Playback
  const speed = SPEEDS[speedIndex];

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    stopPlayback();
    setIsPlaying(true);
    intervalRef.current = setInterval(() => {
      setCurrentMinute(prev => {
        if (prev >= maxMinute) {
          stopPlayback();
          return maxMinute;
        }
        return prev + 1;
      });
    }, 1000 / speed);
  }, [speed, maxMinute, stopPlayback]);

  useEffect(() => {
    if (isPlaying) {
      startPlayback();
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  const handlePlayPause = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      if (currentMinute >= maxMinute) setCurrentMinute(0);
      startPlayback();
    }
  };

  const handleReset = () => {
    stopPlayback();
    setCurrentMinute(0);
  };

  const handleSliderChange = (value: number[]) => {
    setCurrentMinute(value[0]);
  };

  const handleCycleSpeed = () => {
    setSpeedIndex(prev => (prev + 1) % SPEEDS.length);
  };

  if (events.length === 0) return null;

  return (
    <Card variant="glow" className="animate-fade-in">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Mapa de Calor - Replay do Jogo
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              {currentMinute}'
            </Badge>
            <span>{visibleEvents.length} de {events.length} eventos</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Field with events overlay */}
        <div className="w-full rounded-lg overflow-visible border border-border/30" style={{ minHeight: 400 }}>
          <OfficialFootballField theme="grass" showMeasurements={false} showGrid={false}>
            {/* Past events as faded heat blobs */}
            <g className="past-events" style={{ mixBlendMode: 'screen' }}>
              {visibleEvents.map(event => {
                const team = getTeamFromEvent(event, homeTeamName);
                const pos = getEventPosition(event, team === 'home');
                const color = team === 'home' ? homeTeamColor : awayTeamColor;
                const isRecent = recentIds.has(event.id);

                return (
                  <g key={event.id}>
                    {/* Heat blob */}
                    <circle
                      cx={metersToSvg(pos.x)}
                      cy={metersToSvg(pos.y)}
                      r={isRecent ? 30 : 20}
                      fill={color}
                      opacity={isRecent ? 0.4 : 0.15}
                      style={{ filter: 'blur(12px)', transition: 'opacity 0.3s' }}
                    />
                    {/* Event marker */}
                    <circle
                      cx={metersToSvg(pos.x)}
                      cy={metersToSvg(pos.y)}
                      r={isRecent ? 10 : 6}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={isRecent ? 2 : 1}
                      opacity={isRecent ? 0.9 : 0.4}
                      style={{ transition: 'all 0.3s' }}
                    >
                      {isRecent && (
                        <animate
                          attributeName="r"
                          values="8;12;8"
                          dur="1.5s"
                          repeatCount="indefinite"
                        />
                      )}
                    </circle>
                    {/* Event label for recent events */}
                    {isRecent && (
                      <text
                        x={metersToSvg(pos.x)}
                        y={metersToSvg(pos.y) - 16}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize="9"
                        fontWeight="bold"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                      >
                        {getEventLabel(event.event_type)}
                      </text>
                    )}
                    {/* Clip indicator */}
                    {isRecent && event.clip_url && onPlayClip && (
                      <g
                        style={{ cursor: 'pointer' }}
                        onClick={() => onPlayClip(event.clip_url!)}
                      >
                        <circle
                          cx={metersToSvg(pos.x) + 14}
                          cy={metersToSvg(pos.y) - 14}
                          r={8}
                          fill="#fff"
                          opacity={0.9}
                        />
                        <text
                          x={metersToSvg(pos.x) + 14}
                          y={metersToSvg(pos.y) - 10}
                          textAnchor="middle"
                          fill="#000"
                          fontSize="8"
                          fontWeight="bold"
                        >
                          ▶
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </OfficialFootballField>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={handlePlayPause}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Slider
            value={[currentMinute]}
            min={0}
            max={maxMinute}
            step={1}
            onValueChange={handleSliderChange}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 font-mono text-xs h-8 w-12"
            onClick={handleCycleSpeed}
          >
            {speed}x
          </Button>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: homeTeamColor, opacity: 0.8 }} />
            <span className="text-muted-foreground">{homeTeamName}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: awayTeamColor, opacity: 0.8 }} />
            <span className="text-muted-foreground">{awayTeamName}</span>
          </div>
          {events.some(e => e.clip_url) && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Film className="h-3 w-3" />
              <span>Com video</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
