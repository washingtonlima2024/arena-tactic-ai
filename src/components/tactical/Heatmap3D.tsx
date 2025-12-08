import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

interface Player {
  x: number;
  y: number;
  number: number;
  team: 'home' | 'away';
  intensity?: number;
}

interface Heatmap3DProps {
  homeTeam: string;
  awayTeam: string;
  homePlayers: Player[];
  awayPlayers: Player[];
  homeColor?: string;
  awayColor?: string;
}

// 3D Player figure (mannequin style)
function PlayerFigure({ 
  position, 
  number, 
  team,
  teamColor,
  intensity = 0.7 
}: { 
  position: [number, number, number]; 
  number: number; 
  team: 'home' | 'away';
  teamColor: string;
  intensity?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  
  // Convert hex to THREE color
  const color = new THREE.Color(teamColor);
  const emissiveIntensity = hovered ? 0.8 : 0.3;
  
  useFrame((state) => {
    if (groupRef.current) {
      // Subtle breathing animation
      const breathe = Math.sin(state.clock.elapsedTime * 2 + position[0] * 10) * 0.02;
      groupRef.current.position.y = breathe;
      
      // Subtle rotation based on position
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5 + position[2]) * 0.1;
    }
  });

  const bodyHeight = 0.4;
  const headRadius = 0.12;
  const legHeight = 0.25;
  const armLength = 0.2;

  return (
    <group 
      ref={groupRef} 
      position={position}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Glow circle under player */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.25 + intensity * 0.15, 32]} />
        <meshBasicMaterial 
          color={teamColor}
          transparent
          opacity={0.4 + intensity * 0.3}
        />
      </mesh>

      {/* Legs */}
      <group position={[0, legHeight / 2, 0]}>
        {/* Left leg */}
        <mesh position={[-0.06, 0, 0]}>
          <capsuleGeometry args={[0.04, legHeight, 4, 8]} />
          <meshStandardMaterial 
            color="#1a1a2e"
            metalness={0.2}
            roughness={0.8}
          />
        </mesh>
        {/* Right leg */}
        <mesh position={[0.06, 0, 0]}>
          <capsuleGeometry args={[0.04, legHeight, 4, 8]} />
          <meshStandardMaterial 
            color="#1a1a2e"
            metalness={0.2}
            roughness={0.8}
          />
        </mesh>
      </group>

      {/* Body (jersey) */}
      <mesh position={[0, legHeight + bodyHeight / 2, 0]}>
        <capsuleGeometry args={[0.1, bodyHeight, 4, 8]} />
        <meshStandardMaterial 
          color={teamColor}
          emissive={teamColor}
          emissiveIntensity={emissiveIntensity}
          metalness={0.3}
          roughness={0.6}
        />
      </mesh>

      {/* Arms */}
      <group position={[0, legHeight + bodyHeight * 0.8, 0]}>
        {/* Left arm */}
        <mesh position={[-0.18, -0.05, 0]} rotation={[0, 0, Math.PI / 6]}>
          <capsuleGeometry args={[0.035, armLength, 4, 8]} />
          <meshStandardMaterial 
            color={teamColor}
            emissive={teamColor}
            emissiveIntensity={emissiveIntensity * 0.5}
            metalness={0.3}
            roughness={0.6}
          />
        </mesh>
        {/* Right arm */}
        <mesh position={[0.18, -0.05, 0]} rotation={[0, 0, -Math.PI / 6]}>
          <capsuleGeometry args={[0.035, armLength, 4, 8]} />
          <meshStandardMaterial 
            color={teamColor}
            emissive={teamColor}
            emissiveIntensity={emissiveIntensity * 0.5}
            metalness={0.3}
            roughness={0.6}
          />
        </mesh>
      </group>

      {/* Head */}
      <mesh position={[0, legHeight + bodyHeight + headRadius + 0.05, 0]}>
        <sphereGeometry args={[headRadius, 16, 16]} />
        <meshStandardMaterial 
          color="#f5d0c5"
          metalness={0.1}
          roughness={0.7}
        />
      </mesh>

      {/* Player number on jersey */}
      <Html
        position={[0, legHeight + bodyHeight / 2, 0.12]}
        center
        style={{
          color: team === 'home' ? '#ffffff' : '#000000',
          fontSize: '10px',
          fontWeight: 'bold',
          textShadow: '0 0 2px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {number}
      </Html>

      {/* Number label above head */}
      {hovered && (
        <Html
          position={[0, legHeight + bodyHeight + headRadius * 2 + 0.2, 0]}
          center
          style={{
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          #{number}
        </Html>
      )}

      {/* Heat column indicator */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.02, 0.08, intensity * 0.5, 8]} />
        <meshStandardMaterial 
          color={teamColor}
          transparent
          opacity={0.3}
          emissive={teamColor}
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

// Heat gradient overlay based on player density
function HeatmapOverlay({ players, homeColor, awayColor }: { players: Player[]; homeColor: string; awayColor: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    
    // Create base gradient
    const gradient = ctx.createRadialGradient(64, 40, 0, 64, 40, 60);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    gradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.05)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 80);
    
    // Add heat spots for each player
    players.forEach(player => {
      const px = (player.x / 100) * 128;
      const py = (player.y / 100) * 80;
      const intensity = player.intensity || 0.7;
      
      // Parse hex color to rgba
      const hexColor = player.team === 'home' ? homeColor : awayColor;
      const r = parseInt(hexColor.slice(1, 3), 16);
      const g = parseInt(hexColor.slice(3, 5), 16);
      const b = parseInt(hexColor.slice(5, 7), 16);
      
      const spotGradient = ctx.createRadialGradient(px, py, 0, px, py, 12);
      spotGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${intensity * 0.5})`);
      spotGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = spotGradient;
      ctx.fillRect(0, 0, 128, 80);
    });
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [players, homeColor, awayColor]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <planeGeometry args={[11, 7]} />
      <meshBasicMaterial 
        map={texture}
        transparent
        opacity={0.5}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// Football field with players
function FieldScene({ 
  homePlayers, 
  awayPlayers,
  homeColor,
  awayColor,
  autoRotate 
}: { 
  homePlayers: Player[];
  awayPlayers: Player[];
  homeColor: string;
  awayColor: string;
  autoRotate: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.3;
    }
  });

  // Convert 2D positions (0-100) to 3D positions
  const convertPosition = (x: number, y: number): [number, number, number] => {
    return [(x / 100 - 0.5) * 10, 0, (y / 100 - 0.5) * 6];
  };

  return (
    <group ref={groupRef}>
      {/* Field base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[11, 7]} />
        <meshStandardMaterial 
          color="#0d4a2a"
          metalness={0.1}
          roughness={0.8}
        />
      </mesh>

      {/* Field grass pattern */}
      {[-4, -2, 0, 2, 4].map((x, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0, 0]}>
          <planeGeometry args={[1.9, 6.5]} />
          <meshStandardMaterial 
            color={i % 2 === 0 ? "#0f5a32" : "#0d4a2a"}
            metalness={0.1}
            roughness={0.9}
          />
        </mesh>
      ))}

      {/* Outer field lines */}
      <lineSegments position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(10.5, 6.5)]} />
        <lineBasicMaterial color="#ffffff" linewidth={2} />
      </lineSegments>

      {/* Center line */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[0.05, 6.5]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Center circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.9, 0.95, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Center spot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Left penalty area */}
      <lineSegments position={[-3.75, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(2, 3.2)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      {/* Right penalty area */}
      <lineSegments position={[3.75, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(2, 3.2)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      {/* Left goal area */}
      <lineSegments position={[-4.5, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(0.8, 1.6)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      {/* Right goal area */}
      <lineSegments position={[4.5, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(0.8, 1.6)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      {/* Goals */}
      <group position={[-5.35, 0, 0]}>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.1, 0.4, 1.4]} />
          <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0.15, 0.4, 0]}>
          <boxGeometry args={[0.3, 0.02, 1.4]} />
          <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} transparent opacity={0.3} />
        </mesh>
      </group>
      <group position={[5.35, 0, 0]}>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.1, 0.4, 1.4]} />
          <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[-0.15, 0.4, 0]}>
          <boxGeometry args={[0.3, 0.02, 1.4]} />
          <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} transparent opacity={0.3} />
        </mesh>
      </group>

      {/* Home players - 3D figures */}
      {homePlayers.map((player, idx) => (
        <PlayerFigure
          key={`home-${idx}`}
          position={convertPosition(player.x, player.y)}
          number={player.number}
          team="home"
          teamColor={homeColor}
          intensity={player.intensity || 0.5 + Math.random() * 0.5}
        />
      ))}

      {/* Away players - 3D figures */}
      {awayPlayers.map((player, idx) => (
        <PlayerFigure
          key={`away-${idx}`}
          position={convertPosition(player.x, player.y)}
          number={player.number}
          team="away"
          teamColor={awayColor}
          intensity={player.intensity || 0.5 + Math.random() * 0.5}
        />
      ))}

      {/* Heatmap gradient overlay */}
      <HeatmapOverlay 
        players={[...homePlayers, ...awayPlayers]} 
        homeColor={homeColor}
        awayColor={awayColor}
      />
    </group>
  );
}

export function Heatmap3D({ 
  homeTeam, 
  awayTeam, 
  homePlayers, 
  awayPlayers,
  homeColor = '#10b981',
  awayColor = '#3b82f6'
}: Heatmap3DProps) {
  const [autoRotate, setAutoRotate] = useState(true);

  return (
    <div className="relative w-full h-[500px] rounded-xl overflow-hidden bg-gradient-to-b from-background/50 to-background border border-border">
      {/* Team labels */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
        <div 
          className="w-4 h-4 rounded-full border-2 border-white/30"
          style={{ backgroundColor: homeColor }}
        />
        <span className="text-sm font-medium text-white">{homeTeam}</span>
      </div>
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
        <span className="text-sm font-medium text-white">{awayTeam}</span>
        <div 
          className="w-4 h-4 rounded-full border-2 border-white/30"
          style={{ backgroundColor: awayColor }}
        />
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 left-4 z-10 flex gap-2">
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
            autoRotate 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {autoRotate ? 'Auto-rotação: On' : 'Auto-rotação: Off'}
        </button>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 z-10 text-xs text-white/60 bg-black/30 px-2 py-1 rounded">
        Arraste para girar • Scroll para zoom
      </div>

      <Canvas
        camera={{ position: [0, 8, 8], fov: 45 }}
        shadows
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0a0a0a']} />
        <fog attach="fog" args={['#0a0a0a', 15, 30]} />
        
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[10, 15, 5]} 
          intensity={1.2} 
          castShadow 
        />
        <pointLight position={[-5, 8, -5]} intensity={0.6} color="#10b981" />
        <pointLight position={[5, 8, 5]} intensity={0.4} color="#3b82f6" />
        <hemisphereLight args={['#87ceeb', '#0d4a2a', 0.3]} />

        {/* Scene */}
        <FieldScene 
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          homeColor={homeColor}
          awayColor={awayColor}
          autoRotate={autoRotate}
        />

        {/* Controls */}
        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={20}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.5}
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}
