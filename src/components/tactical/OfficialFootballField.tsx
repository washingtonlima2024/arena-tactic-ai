import { cn } from '@/lib/utils';
import { FIFA_FIELD, FIELD_CALCULATIONS, metersToSvg } from '@/constants/fieldDimensions';
import { useState } from 'react';

interface OfficialFootballFieldProps {
  className?: string;
  showMeasurements?: boolean;
  showGrid?: boolean;
  gridSize?: 5 | 10; // meters
  variant?: 'full' | 'half-left' | 'half-right';
  theme?: 'grass' | 'tactical' | 'minimal';
  children?: React.ReactNode;
  onFieldClick?: (position: { x: number; y: number; meters: { x: number; y: number } }) => void;
}

// Convert meters to SVG units (scale factor of 10)
const m = metersToSvg;

// SVG viewBox dimensions
const VIEW_WIDTH = m(FIFA_FIELD.length);   // 1050
const VIEW_HEIGHT = m(FIFA_FIELD.width);   // 680

export function OfficialFootballField({
  className,
  showMeasurements = false,
  showGrid = false,
  gridSize = 10,
  variant = 'full',
  theme = 'grass',
  children,
  onFieldClick,
}: OfficialFootballFieldProps) {
  const [hoveredPosition, setHoveredPosition] = useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_HEIGHT;
    setHoveredPosition({ x: x / 10, y: y / 10 });
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onFieldClick) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_HEIGHT;
    onFieldClick({
      x,
      y,
      meters: { x: x / 10, y: y / 10 }
    });
  };

  // Theme colors
  const colors = {
    grass: {
      fieldLight: 'hsl(var(--primary) / 0.15)',
      fieldDark: 'hsl(var(--primary) / 0.20)',
      lines: 'hsl(var(--primary-foreground) / 0.9)',
      goal: 'hsl(var(--foreground))',
      net: 'hsl(var(--muted-foreground) / 0.5)',
    },
    tactical: {
      fieldLight: 'hsl(var(--muted) / 0.3)',
      fieldDark: 'hsl(var(--muted) / 0.4)',
      lines: 'hsl(var(--foreground) / 0.8)',
      goal: 'hsl(var(--foreground))',
      net: 'hsl(var(--muted-foreground) / 0.3)',
    },
    minimal: {
      fieldLight: 'transparent',
      fieldDark: 'transparent',
      lines: 'hsl(var(--border))',
      goal: 'hsl(var(--foreground) / 0.7)',
      net: 'hsl(var(--muted-foreground) / 0.2)',
    },
  };

  const c = colors[theme];

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPosition(null)}
        onClick={handleClick}
        style={{ cursor: onFieldClick ? 'crosshair' : 'default' }}
      >
        <defs>
          {/* Field stripes pattern */}
          <pattern id="field-stripes-official" patternUnits="userSpaceOnUse" width={m(10)} height={VIEW_HEIGHT}>
            <rect width={m(5)} height={VIEW_HEIGHT} fill={c.fieldLight} />
            <rect x={m(5)} width={m(5)} height={VIEW_HEIGHT} fill={c.fieldDark} />
          </pattern>
          
          {/* Goal net pattern */}
          <pattern id="goal-net" patternUnits="userSpaceOnUse" width="4" height="4">
            <path d="M0,0 L4,4 M4,0 L0,4" stroke={c.net} strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Field background */}
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#field-stripes-official)" rx="8" />

        {/* Grid overlay */}
        {showGrid && (
          <g stroke="hsl(var(--border) / 0.3)" strokeWidth="0.5" strokeDasharray="4,4">
            {Array.from({ length: Math.floor(FIFA_FIELD.length / gridSize) + 1 }).map((_, i) => (
              <line
                key={`v-${i}`}
                x1={m(i * gridSize)}
                y1="0"
                x2={m(i * gridSize)}
                y2={VIEW_HEIGHT}
              />
            ))}
            {Array.from({ length: Math.floor(FIFA_FIELD.width / gridSize) + 1 }).map((_, i) => (
              <line
                key={`h-${i}`}
                x1="0"
                y1={m(i * gridSize)}
                x2={VIEW_WIDTH}
                y2={m(i * gridSize)}
              />
            ))}
          </g>
        )}

        {/* Main field lines */}
        <g stroke={c.lines} strokeWidth={m(FIFA_FIELD.lineWidth)} fill="none">
          {/* Outer boundary */}
          <rect
            x={m(0)}
            y={m(0)}
            width={VIEW_WIDTH}
            height={VIEW_HEIGHT}
            rx="4"
          />

          {/* Center line */}
          <line
            x1={m(FIELD_CALCULATIONS.halfLength)}
            y1={m(0)}
            x2={m(FIELD_CALCULATIONS.halfLength)}
            y2={VIEW_HEIGHT}
          />

          {/* Center circle */}
          <circle
            cx={m(FIELD_CALCULATIONS.halfLength)}
            cy={m(FIELD_CALCULATIONS.halfWidth)}
            r={m(FIFA_FIELD.centerCircleRadius)}
          />

          {/* Center spot */}
          <circle
            cx={m(FIELD_CALCULATIONS.halfLength)}
            cy={m(FIELD_CALCULATIONS.halfWidth)}
            r={m(FIFA_FIELD.centerSpotDiameter / 2)}
            fill={c.lines}
          />

          {/* LEFT SIDE */}
          {/* Left penalty area */}
          <rect
            x={m(0)}
            y={m(FIELD_CALCULATIONS.penaltyAreaLeft)}
            width={m(FIFA_FIELD.penaltyAreaDepth)}
            height={m(FIFA_FIELD.penaltyAreaWidth)}
          />

          {/* Left goal area */}
          <rect
            x={m(0)}
            y={m(FIELD_CALCULATIONS.goalAreaLeft)}
            width={m(FIFA_FIELD.goalAreaDepth)}
            height={m(FIFA_FIELD.goalAreaWidth)}
          />

          {/* Left penalty spot */}
          <circle
            cx={m(FIFA_FIELD.penaltySpotDistance)}
            cy={m(FIELD_CALCULATIONS.halfWidth)}
            r={m(FIFA_FIELD.penaltySpotDiameter / 2)}
            fill={c.lines}
          />

          {/* Left penalty arc */}
          <path
            d={`M ${m(FIFA_FIELD.penaltyAreaDepth)} ${m(FIELD_CALCULATIONS.halfWidth - Math.sin(FIELD_CALCULATIONS.penaltyArcStartAngle) * FIFA_FIELD.penaltyArcRadius)}
                A ${m(FIFA_FIELD.penaltyArcRadius)} ${m(FIFA_FIELD.penaltyArcRadius)} 0 0 1
                ${m(FIFA_FIELD.penaltyAreaDepth)} ${m(FIELD_CALCULATIONS.halfWidth + Math.sin(FIELD_CALCULATIONS.penaltyArcStartAngle) * FIFA_FIELD.penaltyArcRadius)}`}
          />

          {/* Left corner arcs */}
          <path d={`M ${m(0)} ${m(FIFA_FIELD.cornerArcRadius)} A ${m(FIFA_FIELD.cornerArcRadius)} ${m(FIFA_FIELD.cornerArcRadius)} 0 0 0 ${m(FIFA_FIELD.cornerArcRadius)} ${m(0)}`} />
          <path d={`M ${m(0)} ${m(FIFA_FIELD.width - FIFA_FIELD.cornerArcRadius)} A ${m(FIFA_FIELD.cornerArcRadius)} ${m(FIFA_FIELD.cornerArcRadius)} 0 0 1 ${m(FIFA_FIELD.cornerArcRadius)} ${m(FIFA_FIELD.width)}`} />

          {/* RIGHT SIDE */}
          {/* Right penalty area */}
          <rect
            x={m(FIFA_FIELD.length - FIFA_FIELD.penaltyAreaDepth)}
            y={m(FIELD_CALCULATIONS.penaltyAreaLeft)}
            width={m(FIFA_FIELD.penaltyAreaDepth)}
            height={m(FIFA_FIELD.penaltyAreaWidth)}
          />

          {/* Right goal area */}
          <rect
            x={m(FIFA_FIELD.length - FIFA_FIELD.goalAreaDepth)}
            y={m(FIELD_CALCULATIONS.goalAreaLeft)}
            width={m(FIFA_FIELD.goalAreaDepth)}
            height={m(FIFA_FIELD.goalAreaWidth)}
          />

          {/* Right penalty spot */}
          <circle
            cx={m(FIFA_FIELD.length - FIFA_FIELD.penaltySpotDistance)}
            cy={m(FIELD_CALCULATIONS.halfWidth)}
            r={m(FIFA_FIELD.penaltySpotDiameter / 2)}
            fill={c.lines}
          />

          {/* Right penalty arc */}
          <path
            d={`M ${m(FIFA_FIELD.length - FIFA_FIELD.penaltyAreaDepth)} ${m(FIELD_CALCULATIONS.halfWidth - Math.sin(FIELD_CALCULATIONS.penaltyArcStartAngle) * FIFA_FIELD.penaltyArcRadius)}
                A ${m(FIFA_FIELD.penaltyArcRadius)} ${m(FIFA_FIELD.penaltyArcRadius)} 0 0 0
                ${m(FIFA_FIELD.length - FIFA_FIELD.penaltyAreaDepth)} ${m(FIELD_CALCULATIONS.halfWidth + Math.sin(FIELD_CALCULATIONS.penaltyArcStartAngle) * FIFA_FIELD.penaltyArcRadius)}`}
          />

          {/* Right corner arcs */}
          <path d={`M ${m(FIFA_FIELD.length)} ${m(FIFA_FIELD.cornerArcRadius)} A ${m(FIFA_FIELD.cornerArcRadius)} ${m(FIFA_FIELD.cornerArcRadius)} 0 0 1 ${m(FIFA_FIELD.length - FIFA_FIELD.cornerArcRadius)} ${m(0)}`} />
          <path d={`M ${m(FIFA_FIELD.length)} ${m(FIFA_FIELD.width - FIFA_FIELD.cornerArcRadius)} A ${m(FIFA_FIELD.cornerArcRadius)} ${m(FIFA_FIELD.cornerArcRadius)} 0 0 0 ${m(FIFA_FIELD.length - FIFA_FIELD.cornerArcRadius)} ${m(FIFA_FIELD.width)}`} />
        </g>

        {/* Goals with goal line highlight */}
        <g>
          {/* LEFT GOAL */}
          {/* Goal line highlight - THE LINE WHERE BALL CROSSES = GOAL */}
          <line
            x1={m(0)}
            y1={m(FIELD_CALCULATIONS.goalPostLeft)}
            x2={m(0)}
            y2={m(FIELD_CALCULATIONS.goalPostRight)}
            stroke="hsl(var(--destructive))"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* Goal line indicator arrows */}
          <g className="goal-line-indicator">
            <polygon
              points={`${m(0.5)},${m(FIELD_CALCULATIONS.halfWidth)} ${m(1.5)},${m(FIELD_CALCULATIONS.halfWidth - 0.8)} ${m(1.5)},${m(FIELD_CALCULATIONS.halfWidth + 0.8)}`}
              fill="hsl(var(--destructive))"
            />
            <text
              x={m(2.5)}
              y={m(FIELD_CALCULATIONS.halfWidth)}
              fontSize="8"
              fill="hsl(var(--destructive))"
              dominantBaseline="middle"
              fontWeight="bold"
            >
              GOL
            </text>
          </g>
          
          {/* Net background */}
          <rect
            x={m(-FIFA_FIELD.goalDepth)}
            y={m(FIELD_CALCULATIONS.goalPostLeft)}
            width={m(FIFA_FIELD.goalDepth)}
            height={m(FIFA_FIELD.goalWidth)}
            fill="url(#goal-net)"
          />
          
          {/* Goal posts (traves) - white cylindrical posts */}
          <rect
            x={m(-FIFA_FIELD.goalDepth)}
            y={m(FIELD_CALCULATIONS.goalPostLeft - FIFA_FIELD.postDiameter / 2)}
            width={m(FIFA_FIELD.goalDepth)}
            height={m(FIFA_FIELD.postDiameter)}
            fill={c.goal}
            rx="2"
          />
          <rect
            x={m(-FIFA_FIELD.goalDepth)}
            y={m(FIELD_CALCULATIONS.goalPostRight - FIFA_FIELD.postDiameter / 2)}
            width={m(FIFA_FIELD.goalDepth)}
            height={m(FIFA_FIELD.postDiameter)}
            fill={c.goal}
            rx="2"
          />
          
          {/* Front posts (vertical) */}
          <rect
            x={m(-FIFA_FIELD.postDiameter / 2)}
            y={m(FIELD_CALCULATIONS.goalPostLeft - FIFA_FIELD.postDiameter / 2)}
            width={m(FIFA_FIELD.postDiameter)}
            height={m(FIFA_FIELD.goalWidth + FIFA_FIELD.postDiameter)}
            fill="none"
            stroke={c.goal}
            strokeWidth="4"
          />
          
          {/* Crossbar (travessão) */}
          <line
            x1={m(-FIFA_FIELD.goalDepth)}
            y1={m(FIELD_CALCULATIONS.goalPostLeft)}
            x2={m(-FIFA_FIELD.goalDepth)}
            y2={m(FIELD_CALCULATIONS.goalPostRight)}
            stroke={c.goal}
            strokeWidth="4"
            strokeLinecap="round"
          />
          
          {/* Goal width measurement (7.32m) */}
          <g className="goal-measurement">
            <line
              x1={m(-FIFA_FIELD.goalDepth - 1)}
              y1={m(FIELD_CALCULATIONS.goalPostLeft)}
              x2={m(-FIFA_FIELD.goalDepth - 1)}
              y2={m(FIELD_CALCULATIONS.goalPostRight)}
              stroke="hsl(var(--primary))"
              strokeWidth="1"
              markerEnd="url(#measure-arrow)"
              markerStart="url(#measure-arrow-start)"
            />
            <rect
              x={m(-FIFA_FIELD.goalDepth - 3)}
              y={m(FIELD_CALCULATIONS.halfWidth - 1.5)}
              width={m(3)}
              height={m(3)}
              fill="hsl(var(--background))"
              rx="2"
            />
            <text
              x={m(-FIFA_FIELD.goalDepth - 1.5)}
              y={m(FIELD_CALCULATIONS.halfWidth)}
              fontSize="9"
              fill="hsl(var(--primary))"
              textAnchor="middle"
              dominantBaseline="middle"
              fontWeight="bold"
            >
              7.32m
            </text>
          </g>

          {/* RIGHT GOAL */}
          {/* Goal line highlight - THE LINE WHERE BALL CROSSES = GOAL */}
          <line
            x1={m(FIFA_FIELD.length)}
            y1={m(FIELD_CALCULATIONS.goalPostLeft)}
            x2={m(FIFA_FIELD.length)}
            y2={m(FIELD_CALCULATIONS.goalPostRight)}
            stroke="hsl(var(--destructive))"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* Goal line indicator arrows */}
          <g className="goal-line-indicator">
            <polygon
              points={`${m(FIFA_FIELD.length - 0.5)},${m(FIELD_CALCULATIONS.halfWidth)} ${m(FIFA_FIELD.length - 1.5)},${m(FIELD_CALCULATIONS.halfWidth - 0.8)} ${m(FIFA_FIELD.length - 1.5)},${m(FIELD_CALCULATIONS.halfWidth + 0.8)}`}
              fill="hsl(var(--destructive))"
            />
            <text
              x={m(FIFA_FIELD.length - 2.5)}
              y={m(FIELD_CALCULATIONS.halfWidth)}
              fontSize="8"
              fill="hsl(var(--destructive))"
              dominantBaseline="middle"
              textAnchor="end"
              fontWeight="bold"
            >
              GOL
            </text>
          </g>
          
          {/* Net background */}
          <rect
            x={m(FIFA_FIELD.length)}
            y={m(FIELD_CALCULATIONS.goalPostLeft)}
            width={m(FIFA_FIELD.goalDepth)}
            height={m(FIFA_FIELD.goalWidth)}
            fill="url(#goal-net)"
          />
          
          {/* Goal posts (traves) */}
          <rect
            x={m(FIFA_FIELD.length)}
            y={m(FIELD_CALCULATIONS.goalPostLeft - FIFA_FIELD.postDiameter / 2)}
            width={m(FIFA_FIELD.goalDepth)}
            height={m(FIFA_FIELD.postDiameter)}
            fill={c.goal}
            rx="2"
          />
          <rect
            x={m(FIFA_FIELD.length)}
            y={m(FIELD_CALCULATIONS.goalPostRight - FIFA_FIELD.postDiameter / 2)}
            width={m(FIFA_FIELD.goalDepth)}
            height={m(FIFA_FIELD.postDiameter)}
            fill={c.goal}
            rx="2"
          />
          
          {/* Front posts (vertical) */}
          <rect
            x={m(FIFA_FIELD.length - FIFA_FIELD.postDiameter / 2)}
            y={m(FIELD_CALCULATIONS.goalPostLeft - FIFA_FIELD.postDiameter / 2)}
            width={m(FIFA_FIELD.postDiameter)}
            height={m(FIFA_FIELD.goalWidth + FIFA_FIELD.postDiameter)}
            fill="none"
            stroke={c.goal}
            strokeWidth="4"
          />
          
          {/* Crossbar (travessão) */}
          <line
            x1={m(FIFA_FIELD.length + FIFA_FIELD.goalDepth)}
            y1={m(FIELD_CALCULATIONS.goalPostLeft)}
            x2={m(FIFA_FIELD.length + FIFA_FIELD.goalDepth)}
            y2={m(FIELD_CALCULATIONS.goalPostRight)}
            stroke={c.goal}
            strokeWidth="4"
            strokeLinecap="round"
          />
          
          {/* Goal width measurement (7.32m) */}
          <g className="goal-measurement">
            <line
              x1={m(FIFA_FIELD.length + FIFA_FIELD.goalDepth + 1)}
              y1={m(FIELD_CALCULATIONS.goalPostLeft)}
              x2={m(FIFA_FIELD.length + FIFA_FIELD.goalDepth + 1)}
              y2={m(FIELD_CALCULATIONS.goalPostRight)}
              stroke="hsl(var(--primary))"
              strokeWidth="1"
            />
            <rect
              x={m(FIFA_FIELD.length + FIFA_FIELD.goalDepth)}
              y={m(FIELD_CALCULATIONS.halfWidth - 1.5)}
              width={m(3)}
              height={m(3)}
              fill="hsl(var(--background))"
              rx="2"
            />
            <text
              x={m(FIFA_FIELD.length + FIFA_FIELD.goalDepth + 1.5)}
              y={m(FIELD_CALCULATIONS.halfWidth)}
              fontSize="9"
              fill="hsl(var(--primary))"
              textAnchor="middle"
              dominantBaseline="middle"
              fontWeight="bold"
            >
              7.32m
            </text>
          </g>
        </g>

        {/* Measurements overlay */}
        {showMeasurements && (
          <g className="measurements" fontSize="10" fill="hsl(var(--foreground))" fontFamily="monospace">
            {/* Field length */}
            <text x={m(52.5)} y={m(-2)} textAnchor="middle">105m</text>
            <line x1={m(0)} y1={m(-1)} x2={m(105)} y2={m(-1)} stroke="hsl(var(--foreground))" strokeWidth="1" markerEnd="url(#arrow)" markerStart="url(#arrow-start)" />
            
            {/* Field width */}
            <text x={m(-3)} y={m(34)} textAnchor="middle" transform={`rotate(-90, ${m(-3)}, ${m(34)})`}>68m</text>
            
            {/* Penalty area depth */}
            <text x={m(8.25)} y={m(12)} textAnchor="middle" fontSize="8">16.5m</text>
            
            {/* Goal width */}
            <text x={m(-1)} y={m(34)} textAnchor="end" fontSize="8">7.32m</text>
            
            {/* Penalty spot */}
            <text x={m(11)} y={m(38)} textAnchor="middle" fontSize="7">11m</text>
            
            {/* Center circle */}
            <text x={m(52.5)} y={m(25)} textAnchor="middle" fontSize="8">r=9.15m</text>
          </g>
        )}

        {/* Hover position indicator */}
        {hoveredPosition && showMeasurements && (
          <g>
            <circle
              cx={m(hoveredPosition.x)}
              cy={m(hoveredPosition.y)}
              r="5"
              fill="hsl(var(--primary))"
              opacity="0.7"
            />
            <text
              x={m(hoveredPosition.x) + 10}
              y={m(hoveredPosition.y) - 10}
              fontSize="10"
              fill="hsl(var(--foreground))"
              fontFamily="monospace"
            >
              ({hoveredPosition.x.toFixed(1)}m, {hoveredPosition.y.toFixed(1)}m)
            </text>
          </g>
        )}

        {/* Children (players, ball, events, etc.) */}
        {children}
      </svg>

      {/* Legend */}
      {showMeasurements && (
        <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm rounded-lg p-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-primary/20 border border-primary/50 rounded" />
            <span>Campo: 105m × 68m</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-3 h-3 border-2 border-foreground/50 rounded" />
            <span>Gol: 7.32m × 2.44m</span>
          </div>
        </div>
      )}
    </div>
  );
}
