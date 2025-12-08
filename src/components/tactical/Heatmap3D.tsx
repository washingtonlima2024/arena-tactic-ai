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

// Player sphere with heat column
function PlayerMarker({ 
  position, 
  number, 
  team, 
  intensity = 0.7 
}: { 
  position: [number, number, number]; 
  number: number; 
  team: 'home' | 'away';
  intensity?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const columnRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  
  const color = team === 'home' ? '#ec4899' : '#ffffff';
  const emissiveColor = team === 'home' ? '#ec4899' : '#60a5fa';
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 2 + position[0]) * 0.05 + 0.3;
    }
    if (columnRef.current) {
      const targetHeight = intensity * 2;
      columnRef.current.scale.y = THREE.MathUtils.lerp(columnRef.current.scale.y, targetHeight, 0.05);
    }
  });

  return (
    <group position={position}>
      {/* Heat column */}
      <mesh 
        ref={columnRef}
        position={[0, intensity, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <cylinderGeometry args={[0.15, 0.25, 1, 16]} />
        <meshStandardMaterial 
          color={color}
          transparent
          opacity={0.4}
          emissive={emissiveColor}
          emissiveIntensity={hovered ? 0.8 : 0.3}
        />
      </mesh>
      
      {/* Player sphere */}
      <mesh ref={meshRef} position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial 
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={hovered ? 1 : 0.5}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>
      
      {/* Player number - using Html instead of Text */}
      <Html
        position={[0, 0.6, 0]}
        center
        style={{
          color: 'white',
          fontSize: '12px',
          fontWeight: 'bold',
          textShadow: '0 0 4px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {number}
      </Html>
    </group>
  );
}

// Heat gradient overlay based on player density
function HeatmapOverlay({ players }: { players: Player[] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    
    // Create gradient based on player positions
    const gradient = ctx.createRadialGradient(64, 40, 0, 64, 40, 60);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
    gradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.1)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 80);
    
    // Add heat spots for each player
    players.forEach(player => {
      const px = (player.x / 100) * 128;
      const py = (player.y / 100) * 80;
      const intensity = player.intensity || 0.7;
      
      const color = player.team === 'home' 
        ? `rgba(236, 72, 153, ${intensity * 0.4})` 
        : `rgba(96, 165, 250, ${intensity * 0.4})`;
      
      const spotGradient = ctx.createRadialGradient(px, py, 0, px, py, 15);
      spotGradient.addColorStop(0, color);
      spotGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = spotGradient;
      ctx.fillRect(0, 0, 128, 80);
    });
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [players]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <planeGeometry args={[11, 7]} />
      <meshBasicMaterial 
        map={texture}
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// Rotating football field scene
function FieldScene({ 
  homePlayers, 
  awayPlayers,
  autoRotate 
}: { 
  homePlayers: Player[];
  awayPlayers: Player[];
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

      {/* Outer field lines */}
      <lineSegments position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(10.5, 6.5)]} />
        <lineBasicMaterial color="#2a8b52" />
      </lineSegments>

      {/* Center line */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[0.05, 6.5]} />
        <meshBasicMaterial color="#2a8b52" />
      </mesh>

      {/* Center circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.9, 0.95, 32]} />
        <meshBasicMaterial color="#2a8b52" />
      </mesh>

      {/* Center spot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial color="#2a8b52" />
      </mesh>

      {/* Left penalty area */}
      <lineSegments position={[-3.75, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(2, 3.2)]} />
        <lineBasicMaterial color="#2a8b52" />
      </lineSegments>

      {/* Right penalty area */}
      <lineSegments position={[3.75, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(2, 3.2)]} />
        <lineBasicMaterial color="#2a8b52" />
      </lineSegments>

      {/* Left goal area */}
      <lineSegments position={[-4.5, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(0.8, 1.6)]} />
        <lineBasicMaterial color="#2a8b52" />
      </lineSegments>

      {/* Right goal area */}
      <lineSegments position={[4.5, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(0.8, 1.6)]} />
        <lineBasicMaterial color="#2a8b52" />
      </lineSegments>

      {/* Goals */}
      <mesh position={[-5.35, 0.15, 0]}>
        <boxGeometry args={[0.1, 0.3, 1.2]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[5.35, 0.15, 0]}>
        <boxGeometry args={[0.1, 0.3, 1.2]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Home players */}
      {homePlayers.map((player, idx) => (
        <PlayerMarker
          key={`home-${idx}`}
          position={convertPosition(player.x, player.y)}
          number={player.number}
          team="home"
          intensity={player.intensity || 0.5 + Math.random() * 0.5}
        />
      ))}

      {/* Away players */}
      {awayPlayers.map((player, idx) => (
        <PlayerMarker
          key={`away-${idx}`}
          position={convertPosition(player.x, player.y)}
          number={player.number}
          team="away"
          intensity={player.intensity || 0.5 + Math.random() * 0.5}
        />
      ))}

      {/* Heatmap gradient overlay */}
      <HeatmapOverlay players={[...homePlayers, ...awayPlayers]} />
    </group>
  );
}

export function Heatmap3D({ 
  homeTeam, 
  awayTeam, 
  homePlayers, 
  awayPlayers,
  homeColor = '#ec4899',
  awayColor = '#ffffff'
}: Heatmap3DProps) {
  const [autoRotate, setAutoRotate] = useState(true);

  return (
    <div className="relative w-full h-[500px] rounded-xl overflow-hidden bg-gradient-to-b from-background/50 to-background border border-border">
      {/* Team labels */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div 
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: homeColor }}
        />
        <span className="text-sm font-medium text-foreground">{homeTeam}</span>
      </div>
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{awayTeam}</span>
        <div 
          className="w-3 h-3 rounded-full border-2 border-white"
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
      <div className="absolute bottom-4 right-4 z-10 text-xs text-muted-foreground">
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
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[10, 10, 5]} 
          intensity={1} 
          castShadow 
        />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#10b981" />
        <pointLight position={[5, 5, 5]} intensity={0.3} color="#ec4899" />

        {/* Scene */}
        <FieldScene 
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
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
