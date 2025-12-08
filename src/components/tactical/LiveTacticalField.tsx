import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface MatchEvent {
  id: string;
  event_type: string;
  minute: number | null;
  description: string | null;
  position_x: number | null;
  position_y: number | null;
}

interface LiveTacticalFieldProps {
  events: MatchEvent[];
  homeTeam?: string;
  awayTeam?: string;
  className?: string;
}

// Generate position for event type if not provided
function getEventPosition(event: MatchEvent): { x: number; y: number } {
  if (event.position_x !== null && event.position_y !== null) {
    return { x: event.position_x, y: event.position_y };
  }
  
  // Generate positions based on event type
  switch (event.event_type) {
    case 'goal':
      return { x: 90 + Math.random() * 8, y: 40 + Math.random() * 20 };
    case 'shot':
    case 'shot_on_target':
      return { x: 75 + Math.random() * 15, y: 30 + Math.random() * 40 };
    case 'corner':
      return { x: 98, y: Math.random() > 0.5 ? 5 : 95 };
    case 'foul':
    case 'yellow_card':
    case 'red_card':
      return { x: 30 + Math.random() * 40, y: 20 + Math.random() * 60 };
    case 'save':
      return { x: 5 + Math.random() * 10, y: 35 + Math.random() * 30 };
    case 'substitution':
      return { x: 50, y: 0 };
    default:
      return { x: 30 + Math.random() * 40, y: 20 + Math.random() * 60 };
  }
}

// Get color for event type
function getEventColor(eventType: string): string {
  switch (eventType) {
    case 'goal':
      return '#22c55e';
    case 'shot':
    case 'shot_on_target':
      return '#3b82f6';
    case 'corner':
      return '#8b5cf6';
    case 'foul':
      return '#f97316';
    case 'yellow_card':
      return '#eab308';
    case 'red_card':
      return '#ef4444';
    case 'save':
      return '#06b6d4';
    case 'substitution':
      return '#64748b';
    default:
      return '#10b981';
  }
}

// Get icon for event type
function getEventIcon(eventType: string): string {
  switch (eventType) {
    case 'goal':
      return '⚽';
    case 'shot':
    case 'shot_on_target':
      return '🎯';
    case 'corner':
      return '🚩';
    case 'foul':
      return '⚠️';
    case 'yellow_card':
      return '🟨';
    case 'red_card':
      return '🟥';
    case 'save':
      return '🧤';
    case 'substitution':
      return '🔄';
    default:
      return '📍';
  }
}

export function LiveTacticalField({ events, homeTeam, awayTeam, className }: LiveTacticalFieldProps) {
  const [activeEvent, setActiveEvent] = useState<string | null>(null);
  const [animatedEvents, setAnimatedEvents] = useState<string[]>([]);
  
  // Animate events one by one
  useEffect(() => {
    if (events.length === 0) return;
    
    let index = 0;
    const interval = setInterval(() => {
      if (index < events.length) {
        setAnimatedEvents(prev => [...prev, events[index].id]);
        setActiveEvent(events[index].id);
        index++;
      } else {
        // Reset and start over
        index = 0;
        setAnimatedEvents([]);
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [events]);

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox="0 0 120 80"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Definitions */}
        <defs>
          <pattern id="field-stripes-live" patternUnits="userSpaceOnUse" width="20" height="80">
            <rect width="10" height="80" fill="hsl(var(--primary) / 0.05)" />
            <rect x="10" width="10" height="80" fill="hsl(var(--primary) / 0.08)" />
          </pattern>
          <filter id="glow-live">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="pulse-glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="event-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Field Background */}
        <rect width="120" height="80" fill="url(#field-stripes-live)" />

        {/* Field Lines */}
        <g stroke="hsl(var(--primary) / 0.4)" strokeWidth="0.3" fill="none">
          <rect x="2" y="2" width="116" height="76" rx="1" />
          <line x1="60" y1="2" x2="60" y2="78" />
          <circle cx="60" cy="40" r="9.15" />
          <circle cx="60" cy="40" r="0.5" fill="hsl(var(--primary) / 0.4)" />
          {/* Left penalty area */}
          <rect x="2" y="18" width="16.5" height="44" />
          <rect x="2" y="28" width="5.5" height="24" />
          <circle cx="11" cy="40" r="0.5" fill="hsl(var(--primary) / 0.4)" />
          <path d="M 16.5 32 A 9.15 9.15 0 0 1 16.5 48" />
          {/* Right penalty area */}
          <rect x="101.5" y="18" width="16.5" height="44" />
          <rect x="112.5" y="28" width="5.5" height="24" />
          <circle cx="109" cy="40" r="0.5" fill="hsl(var(--primary) / 0.4)" />
          <path d="M 101.5 32 A 9.15 9.15 0 0 0 101.5 48" />
          {/* Goals */}
          <rect x="0" y="35" width="2" height="10" fill="none" stroke="hsl(var(--primary) / 0.6)" />
          <rect x="118" y="35" width="2" height="10" fill="none" stroke="hsl(var(--primary) / 0.6)" />
        </g>

        {/* Connection lines between events */}
        {animatedEvents.length > 1 && animatedEvents.slice(0, -1).map((eventId, index) => {
          const currentEvent = events.find(e => e.id === eventId);
          const nextEventId = animatedEvents[index + 1];
          const nextEvent = events.find(e => e.id === nextEventId);
          
          if (!currentEvent || !nextEvent) return null;
          
          const pos1 = getEventPosition(currentEvent);
          const pos2 = getEventPosition(nextEvent);
          
          return (
            <line
              key={`line-${eventId}`}
              x1={(pos1.x / 100) * 116 + 2}
              y1={(pos1.y / 100) * 76 + 2}
              x2={(pos2.x / 100) * 116 + 2}
              y2={(pos2.y / 100) * 76 + 2}
              stroke="hsl(var(--primary) / 0.3)"
              strokeWidth="0.5"
              strokeDasharray="2,1"
              className="animate-[fade-in_0.5s_ease-out]"
            />
          );
        })}

        {/* Event markers */}
        {events.map((event) => {
          const pos = getEventPosition(event);
          const cx = (pos.x / 100) * 116 + 2;
          const cy = (pos.y / 100) * 76 + 2;
          const color = getEventColor(event.event_type);
          const isAnimated = animatedEvents.includes(event.id);
          const isActive = activeEvent === event.id;
          
          if (!isAnimated) return null;
          
          return (
            <g 
              key={event.id}
              className="cursor-pointer transition-all duration-500"
              onMouseEnter={() => setActiveEvent(event.id)}
              onMouseLeave={() => setActiveEvent(null)}
            >
              {/* Pulse ring for active event */}
              {isActive && (
                <>
                  <circle
                    cx={cx}
                    cy={cy}
                    r="6"
                    fill="none"
                    stroke={color}
                    strokeWidth="0.5"
                    opacity="0.6"
                    className="animate-ping"
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r="8"
                    fill="none"
                    stroke={color}
                    strokeWidth="0.3"
                    opacity="0.4"
                    className="animate-pulse"
                  />
                </>
              )}
              
              {/* Event marker */}
              <circle
                cx={cx}
                cy={cy}
                r={isActive ? "4" : "3"}
                fill={color}
                filter={isActive ? "url(#pulse-glow)" : "url(#glow-live)"}
                className="transition-all duration-300"
              />
              
              {/* Minute label */}
              <text
                x={cx}
                y={cy - 5}
                textAnchor="middle"
                fontSize="3"
                fill={color}
                fontWeight="bold"
              >
                {event.minute}'
              </text>
            </g>
          );
        })}

        {/* Team labels */}
        <text x="10" y="6" fontSize="3" fill="hsl(var(--primary) / 0.6)" fontWeight="bold">
          {homeTeam || 'CASA'}
        </text>
        <text x="110" y="6" fontSize="3" fill="hsl(var(--primary) / 0.6)" fontWeight="bold" textAnchor="end">
          {awayTeam || 'VISITANTE'}
        </text>
      </svg>

      {/* Event details tooltip */}
      {activeEvent && (
        <div className="absolute bottom-2 left-2 right-2 p-3 bg-card/95 backdrop-blur-sm rounded-lg border border-primary/20 animate-fade-in">
          {(() => {
            const event = events.find(e => e.id === activeEvent);
            if (!event) return null;
            
            return (
              <div className="flex items-start gap-3">
                <span className="text-2xl">{getEventIcon(event.event_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge 
                      style={{ backgroundColor: getEventColor(event.event_type) }}
                      className="text-white text-xs"
                    >
                      {event.minute}'
                    </Badge>
                    <span className="text-sm font-semibold capitalize">
                      {event.event_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {event.description}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-2 right-2 flex flex-wrap gap-1">
        {['goal', 'shot', 'foul', 'save'].map(type => (
          <div 
            key={type}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-card/80 rounded text-[10px]"
          >
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getEventColor(type) }}
            />
            <span className="capitalize">{type === 'shot' ? 'Chute' : type === 'goal' ? 'Gol' : type === 'foul' ? 'Falta' : 'Defesa'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}