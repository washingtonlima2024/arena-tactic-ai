import React, { useMemo } from 'react';
import { OfficialFootballField } from './OfficialFootballField';
import { metersToSvg } from '@/constants/fieldDimensions';

export interface HeatZone {
  x: number; // 0-105 (field meters)
  y: number; // 0-68 (field meters)
  intensity: number; // 0-1
  team: 'home' | 'away';
}

export interface Player {
  x: number;
  y: number;
  number: number;
  intensity?: number;
}

interface Heatmap2DProps {
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamColor?: string;
  awayTeamColor?: string;
  heatZones?: HeatZone[];
  homePlayers?: Player[];
  awayPlayers?: Player[];
  height?: number;
  showLegend?: boolean;
  className?: string;
}

/**
 * Lightweight 2D Heatmap using SVG overlays
 * Replaces the heavy 3D Heatmap component
 */
export function Heatmap2D({
  homeTeamName = 'Casa',
  awayTeamName = 'Fora',
  homeTeamColor = '#10b981',
  awayTeamColor = '#3b82f6',
  heatZones = [],
  homePlayers = [],
  awayPlayers = [],
  height = 400,
  showLegend = true,
  className = ''
}: Heatmap2DProps) {
  // Generate heat zone gradients
  const heatOverlay = useMemo(() => {
    if (heatZones.length === 0) return null;
    
    return heatZones.map((zone, i) => {
      const px = metersToSvg(zone.x);
      const py = metersToSvg(zone.y);
      const color = zone.team === 'home' ? homeTeamColor : awayTeamColor;
      const intensity = Math.min(zone.intensity + 0.2, 1); // Base visibility
      const radius = 40 + (zone.intensity * 30);
      
      return (
        <circle
          key={`heat-${i}`}
          cx={px}
          cy={py}
          r={radius}
          fill={color}
          opacity={intensity * 0.35}
          style={{ filter: 'blur(20px)' }}
        />
      );
    });
  }, [heatZones, homeTeamColor, awayTeamColor]);

  // Render player markers
  const renderPlayers = (players: Player[], color: string, team: 'home' | 'away') => {
    return players.map((player, i) => {
      const px = metersToSvg(player.x);
      const py = metersToSvg(player.y);
      const intensity = player.intensity || 0.8;
      
      return (
        <g key={`${team}-${i}`}>
          {/* Player circle */}
          <circle
            cx={px}
            cy={py}
            r={14}
            fill={color}
            stroke="#ffffff"
            strokeWidth={2}
            opacity={intensity}
          />
          {/* Player number */}
          <text
            x={px}
            y={py + 4}
            textAnchor="middle"
            fill="#ffffff"
            fontSize="10"
            fontWeight="bold"
          >
            {player.number}
          </text>
        </g>
      );
    });
  };

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {/* 2D Football Field with overlays */}
      <div className="w-full h-full rounded-lg overflow-hidden border border-border/30">
        <OfficialFootballField
          theme="grass"
          showMeasurements={false}
          showGrid={false}
        >
          {/* Heat zones layer (blurred circles) - based on real events only */}
          <g className="heat-zones" style={{ mixBlendMode: 'screen' }}>
            {heatOverlay}
          </g>
          
          {/* Players are only rendered if real tracking data exists */}
          {(homePlayers.length > 0 || awayPlayers.length > 0) && (
            <g className="players">
              {renderPlayers(homePlayers, homeTeamColor, 'home')}
              {renderPlayers(awayPlayers, awayTeamColor, 'away')}
            </g>
          )}
        </OfficialFootballField>
      </div>

      {/* Legend - only shows heat zones info since players require real tracking */}
      {showLegend && heatZones.length > 0 && (
        <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex items-center gap-6 bg-background/80 backdrop-blur px-4 py-2 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded-full opacity-60" 
              style={{ backgroundColor: homeTeamColor }}
            />
            <span className="text-foreground">{homeTeamName}</span>
          </div>
          <div className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded-full opacity-60" 
              style={{ backgroundColor: awayTeamColor }}
            />
            <span className="text-foreground">{awayTeamName}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 rounded-full bg-gradient-to-r from-yellow-500/50 to-red-500/50" />
            <span>Zonas de atividade</span>
          </div>
        </div>
      )}
      
      {/* Empty state when no heat zones */}
      {heatZones.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-background/60 backdrop-blur-sm rounded-lg px-4 py-2 text-sm text-muted-foreground">
            Sem dados de eventos para exibir
          </div>
        </div>
      )}
    </div>
  );
}

export default Heatmap2D;
