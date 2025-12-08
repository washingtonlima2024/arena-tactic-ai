import { useRef, useMemo, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
  onPlayersChange?: (homePlayers: Player[], awayPlayers: Player[]) => void;
  editable?: boolean;
}

// 3D Player figure with drag support
function PlayerFigure({ 
  position, 
  number, 
  team,
  teamColor,
  intensity = 0.7,
  onDrag,
  isDraggable = true
}: { 
  position: [number, number, number]; 
  number: number; 
  team: 'home' | 'away';
  teamColor: string;
  intensity?: number;
  onDrag?: (newPosition: [number, number, number]) => void;
  isDraggable?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { camera, raycaster, gl } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const intersection = useMemo(() => new THREE.Vector3(), []);
  
  const emissiveIntensity = hovered || isDragging ? 1 : 0.3;
  
  const handlePointerDown = useCallback((e: any) => {
    if (!isDraggable) return;
    e.stopPropagation();
    setIsDragging(true);
    gl.domElement.style.cursor = 'grabbing';
    (e.target as any).setPointerCapture(e.pointerId);
  }, [isDraggable, gl]);

  const handlePointerUp = useCallback((e: any) => {
    if (!isDragging) return;
    e.stopPropagation();
    setIsDragging(false);
    gl.domElement.style.cursor = 'auto';
    (e.target as any).releasePointerCapture(e.pointerId);
  }, [isDragging, gl]);

  const handlePointerMove = useCallback((e: any) => {
    if (!isDragging || !onDrag) return;
    e.stopPropagation();
    
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    raycaster.ray.intersectPlane(plane, intersection);
    
    const clampedX = Math.max(-5, Math.min(5, intersection.x));
    const clampedZ = Math.max(-3, Math.min(3, intersection.z));
    
    onDrag([clampedX, 0, clampedZ]);
  }, [isDragging, onDrag, camera, raycaster, plane, intersection, gl]);
  
  useFrame((state) => {
    if (groupRef.current && !isDragging) {
      const breathe = Math.sin(state.clock.elapsedTime * 2 + position[0] * 10) * 0.02;
      groupRef.current.position.y = breathe;
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
      onPointerOver={(e) => { 
        e.stopPropagation(); 
        setHovered(true); 
        if (isDraggable) gl.domElement.style.cursor = 'grab';
      }}
      onPointerOut={(e) => { 
        e.stopPropagation(); 
        setHovered(false); 
        if (!isDragging) gl.domElement.style.cursor = 'auto';
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
    >
      {/* Selection ring when dragging */}
      {isDragging && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.35, 0.4, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </mesh>
      )}

      {/* Glow circle under player */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.25 + intensity * 0.15, 32]} />
        <meshBasicMaterial 
          color={teamColor}
          transparent
          opacity={isDragging ? 0.8 : 0.4 + intensity * 0.3}
        />
      </mesh>

      {/* Legs */}
      <group position={[0, legHeight / 2, 0]}>
        <mesh position={[-0.06, 0, 0]}>
          <capsuleGeometry args={[0.04, legHeight, 4, 8]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.2} roughness={0.8} />
        </mesh>
        <mesh position={[0.06, 0, 0]}>
          <capsuleGeometry args={[0.04, legHeight, 4, 8]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.2} roughness={0.8} />
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
        <meshStandardMaterial color="#f5d0c5" metalness={0.1} roughness={0.7} />
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

      {/* Hover/Drag label */}
      {(hovered || isDragging) && (
        <Html
          position={[0, legHeight + bodyHeight + headRadius * 2 + 0.2, 0]}
          center
          style={{
            background: isDragging ? 'rgba(16,185,129,0.9)' : 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          #{number} {isDragging && '• Arrastando'}
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

// Heat gradient overlay
function HeatmapOverlay({ players, homeColor, awayColor }: { players: Player[]; homeColor: string; awayColor: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createRadialGradient(64, 40, 0, 64, 40, 60);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    gradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.05)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 80);
    
    players.forEach(player => {
      const px = (player.x / 100) * 128;
      const py = (player.y / 100) * 80;
      const intensity = player.intensity || 0.7;
      
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

// Field scene with draggable players
function FieldScene({ 
  homePlayers, 
  awayPlayers,
  homeColor,
  awayColor,
  autoRotate,
  onHomePlayerDrag,
  onAwayPlayerDrag,
  editable
}: { 
  homePlayers: Player[];
  awayPlayers: Player[];
  homeColor: string;
  awayColor: string;
  autoRotate: boolean;
  onHomePlayerDrag: (index: number, position: [number, number, number]) => void;
  onAwayPlayerDrag: (index: number, position: [number, number, number]) => void;
  editable: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.3;
    }
  });

  const convertPosition = (x: number, y: number): [number, number, number] => {
    return [(x / 100 - 0.5) * 10, 0, (y / 100 - 0.5) * 6];
  };

  return (
    <group ref={groupRef}>
      {/* Field base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[11, 7]} />
        <meshStandardMaterial color="#0d4a2a" metalness={0.1} roughness={0.8} />
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

      {/* Field lines */}
      <lineSegments position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(10.5, 6.5)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[0.05, 6.5]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.9, 0.95, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      <lineSegments position={[-3.75, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(2, 3.2)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      <lineSegments position={[3.75, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(2, 3.2)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      <lineSegments position={[-4.5, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(0.8, 1.6)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

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
      </group>
      <group position={[5.35, 0, 0]}>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.1, 0.4, 1.4]} />
          <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>

      {/* Home players */}
      {homePlayers.map((player, idx) => (
        <PlayerFigure
          key={`home-${idx}-${player.number}`}
          position={convertPosition(player.x, player.y)}
          number={player.number}
          team="home"
          teamColor={homeColor}
          intensity={player.intensity || 0.7}
          isDraggable={editable}
          onDrag={(pos) => onHomePlayerDrag(idx, pos)}
        />
      ))}

      {/* Away players */}
      {awayPlayers.map((player, idx) => (
        <PlayerFigure
          key={`away-${idx}-${player.number}`}
          position={convertPosition(player.x, player.y)}
          number={player.number}
          team="away"
          teamColor={awayColor}
          intensity={player.intensity || 0.7}
          isDraggable={editable}
          onDrag={(pos) => onAwayPlayerDrag(idx, pos)}
        />
      ))}

      {/* Heatmap overlay */}
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
  homePlayers: initialHomePlayers, 
  awayPlayers: initialAwayPlayers,
  homeColor = '#10b981',
  awayColor = '#3b82f6',
  onPlayersChange,
  editable = true
}: Heatmap3DProps) {
  const [autoRotate, setAutoRotate] = useState(true);
  const [homePlayers, setHomePlayers] = useState(initialHomePlayers);
  const [awayPlayers, setAwayPlayers] = useState(initialAwayPlayers);

  // Convert 3D position back to 2D (0-100)
  const convert3DTo2D = (pos: [number, number, number]): { x: number; y: number } => {
    return {
      x: (pos[0] / 10 + 0.5) * 100,
      y: (pos[2] / 6 + 0.5) * 100
    };
  };

  const handleHomePlayerDrag = useCallback((index: number, position: [number, number, number]) => {
    const { x, y } = convert3DTo2D(position);
    setHomePlayers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], x, y };
      onPlayersChange?.(updated, awayPlayers);
      return updated;
    });
  }, [awayPlayers, onPlayersChange]);

  const handleAwayPlayerDrag = useCallback((index: number, position: [number, number, number]) => {
    const { x, y } = convert3DTo2D(position);
    setAwayPlayers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], x, y };
      onPlayersChange?.(homePlayers, updated);
      return updated;
    });
  }, [homePlayers, onPlayersChange]);

  const handleReset = () => {
    setHomePlayers(initialHomePlayers);
    setAwayPlayers(initialAwayPlayers);
  };

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
        {editable && (
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            Resetar
          </button>
        )}
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 z-10 text-xs text-white/60 bg-black/30 px-2 py-1 rounded">
        {editable ? 'Arraste os jogadores • Scroll para zoom' : 'Arraste para girar • Scroll para zoom'}
      </div>

      <Canvas
        camera={{ position: [0, 8, 8], fov: 45 }}
        shadows
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0a0a0a']} />
        <fog attach="fog" args={['#0a0a0a', 15, 30]} />
        
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 15, 5]} intensity={1.2} castShadow />
        <pointLight position={[-5, 8, -5]} intensity={0.6} color="#10b981" />
        <pointLight position={[5, 8, 5]} intensity={0.4} color="#3b82f6" />
        <hemisphereLight args={['#87ceeb', '#0d4a2a', 0.3]} />

        <FieldScene 
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          homeColor={homeColor}
          awayColor={awayColor}
          autoRotate={autoRotate}
          onHomePlayerDrag={handleHomePlayerDrag}
          onAwayPlayerDrag={handleAwayPlayerDrag}
          editable={editable}
        />

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