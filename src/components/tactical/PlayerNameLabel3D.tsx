import React from 'react';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';

interface PlayerNameLabel3DProps {
  position: [number, number, number];
  name: string;
  isScorer?: boolean;
  hasAudio?: boolean;
  teamColor?: string;
}

/**
 * Floating player name label with connecting arrow
 * - Name positioned 1.5 units (approx 1.5cm in 3D space) above player
 * - White text with 50% transparency
 * - Animated arrow connecting label to player model
 */
export function PlayerNameLabel3D({
  position,
  name,
  isScorer = false,
  hasAudio = false,
  teamColor = '#ffffff'
}: PlayerNameLabel3DProps) {
  // Name label height above player (1.5 units = ~1.5cm visual distance)
  const labelHeight = 2.2;
  const arrowStartHeight = 0.8; // Start arrow at player head level
  
  // Arrow path from player head to name label
  const arrowPoints: [number, number, number][] = [
    [position[0], arrowStartHeight, position[2]],
    [position[0], labelHeight - 0.2, position[2]]
  ];

  return (
    <group>
      {/* Connecting arrow/line */}
      <Line
        points={arrowPoints}
        color="#ffffff"
        lineWidth={1.5}
        transparent
        opacity={0.4}
        dashed
        dashSize={0.1}
        dashScale={10}
      />
      
      {/* Arrow head (small cone at the bottom) */}
      <mesh position={[position[0], arrowStartHeight + 0.05, position[2]]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.08, 0.15, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>
      
      {/* Floating name label */}
      <Html
        position={[position[0], labelHeight, position[2]]}
        center
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div 
          className={`
            px-3 py-1 rounded-lg text-sm font-bold shadow-xl whitespace-nowrap 
            flex items-center gap-1.5 backdrop-blur-sm border
            ${isScorer 
              ? 'bg-gradient-to-r from-yellow-500/90 to-amber-500/90 text-black border-yellow-300' 
              : 'bg-white/50 text-white border-white/30'
            }
          `}
          style={{
            textShadow: isScorer ? 'none' : '0 2px 4px rgba(0,0,0,0.8)',
          }}
        >
          {isScorer && <span className="text-base">⚽</span>}
          <span className={isScorer ? 'text-black font-extrabold' : 'font-semibold'}>
            {name}
          </span>
          {hasAudio && (
            <span className="text-xs animate-pulse">🔊</span>
          )}
        </div>
      </Html>
      
      {/* Glow effect under the label */}
      <pointLight
        position={[position[0], labelHeight - 0.5, position[2]]}
        intensity={isScorer ? 0.8 : 0.3}
        distance={2}
        color={isScorer ? '#fbbf24' : '#ffffff'}
      />
    </group>
  );
}

export default PlayerNameLabel3D;
