import { cn } from '@/lib/utils';
import { HeatmapData } from '@/types/arena';

interface FootballFieldProps {
  className?: string;
  heatmap?: HeatmapData;
  players?: { x: number; y: number; number: number; team: 'home' | 'away' }[];
  events?: { x: number; y: number; type: string }[];
  showGrid?: boolean;
}

export function FootballField({ 
  className, 
  heatmap, 
  players,
  events,
  showGrid = false 
}: FootballFieldProps) {
  return (
    <div className={cn("relative aspect-[3/2] w-full overflow-hidden rounded-xl bg-primary/10", className)}>
      {/* Field Background */}
      <svg 
        viewBox="0 0 120 80" 
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Field Stripes */}
        <defs>
          <pattern id="field-stripes" patternUnits="userSpaceOnUse" width="20" height="80">
            <rect width="10" height="80" fill="hsl(var(--primary) / 0.05)" />
            <rect x="10" width="10" height="80" fill="hsl(var(--primary) / 0.08)" />
          </pattern>
          
          {/* Heatmap Gradient */}
          <radialGradient id="heatmap-gradient">
            <stop offset="0%" stopColor="hsl(0 100% 50%)" stopOpacity="0.8" />
            <stop offset="30%" stopColor="hsl(30 100% 50%)" stopOpacity="0.6" />
            <stop offset="60%" stopColor="hsl(60 100% 50%)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Field Base */}
        <rect width="120" height="80" fill="url(#field-stripes)" />

        {/* Field Lines */}
        <g stroke="hsl(var(--primary) / 0.4)" strokeWidth="0.3" fill="none">
          {/* Outer boundary */}
          <rect x="2" y="2" width="116" height="76" rx="1" />
          
          {/* Center line */}
          <line x1="60" y1="2" x2="60" y2="78" />
          
          {/* Center circle */}
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

          {/* Corner arcs */}
          <path d="M 2 3 A 1 1 0 0 0 3 2" />
          <path d="M 117 2 A 1 1 0 0 0 118 3" />
          <path d="M 118 77 A 1 1 0 0 0 117 78" />
          <path d="M 3 78 A 1 1 0 0 0 2 77" />
        </g>

        {/* Grid Overlay */}
        {showGrid && (
          <g stroke="hsl(var(--border) / 0.3)" strokeWidth="0.1">
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={`v-${i}`} x1={i * 10} y1="0" x2={i * 10} y2="80" />
            ))}
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={`h-${i}`} x1="0" y1={i * 10} x2="120" y2={i * 10} />
            ))}
          </g>
        )}

        {/* Heatmap */}
        {heatmap?.zones.map((zone, i) => (
          <circle
            key={i}
            cx={(zone.x / 100) * 116 + 2}
            cy={(zone.y / 100) * 76 + 2}
            r={zone.intensity * 10}
            fill={`hsl(${120 - zone.intensity * 120} 100% 50% / ${zone.intensity * 0.5})`}
            className="blur-sm"
          />
        ))}

        {/* Events */}
        {events?.map((event, i) => (
          <g key={i}>
            <circle
              cx={(event.x / 100) * 116 + 2}
              cy={(event.y / 100) * 76 + 2}
              r="2"
              fill="hsl(var(--primary))"
              className="animate-pulse"
            />
          </g>
        ))}

        {/* Players */}
        {players?.map((player, i) => (
          <g key={i}>
            <circle
              cx={(player.x / 100) * 116 + 2}
              cy={(player.y / 100) * 76 + 2}
              r="3"
              fill={player.team === 'home' ? '#A50044' : '#FFFFFF'}
              stroke="hsl(var(--background))"
              strokeWidth="0.5"
            />
            <text
              x={(player.x / 100) * 116 + 2}
              y={(player.y / 100) * 76 + 2.5}
              textAnchor="middle"
              fontSize="2.5"
              fontWeight="bold"
              fill={player.team === 'home' ? '#FFFFFF' : '#000000'}
            >
              {player.number}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
