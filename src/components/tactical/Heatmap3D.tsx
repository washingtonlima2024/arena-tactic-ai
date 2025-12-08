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

interface HeatZone {
  x: number;
  y: number;
  intensity: number;
  team: 'home' | 'away';
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

// Volumetric heat zone cloud on the field
function FieldHeatZone({ 
  position, 
  intensity = 0.7, 
  color,
  team
}: { 
  position: [number, number, number]; 
  intensity?: number; 
  color: string;
  team: 'home' | 'away';
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  
  // Create particle positions for volumetric cloud effect
  const { particlePositions, particleColors } = useMemo(() => {
    const count = 80;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    
    // Parse hex color
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;
    
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const radius = Math.random() * 1.2 * intensity;
      const height = Math.random() * 0.3 * intensity;
      
      positions[i * 3] = Math.cos(theta) * radius;
      positions[i * 3 + 1] = height + 0.05;
      positions[i * 3 + 2] = Math.sin(theta) * radius;
      
      // Vary color intensity per particle - hot zones are redder, cold zones are bluer
      const colorIntensity = 0.6 + Math.random() * 0.4;
      if (intensity > 0.6) {
        // Hot zone - more red/orange
        colors[i * 3] = Math.min(1, r * colorIntensity + 0.3);
        colors[i * 3 + 1] = g * colorIntensity * 0.5;
        colors[i * 3 + 2] = b * colorIntensity * 0.3;
      } else {
        // Cold zone - more blue
        colors[i * 3] = r * colorIntensity * 0.3;
        colors[i * 3 + 1] = g * colorIntensity * 0.5;
        colors[i * 3 + 2] = Math.min(1, b * colorIntensity + 0.3);
      }
    }
    
    return { particlePositions: positions, particleColors: colors };
  }, [color, intensity]);

  useFrame((state) => {
    if (meshRef.current) {
      // Pulsating cloud effect
      const pulse = Math.sin(state.clock.elapsedTime * 1.5 + position[0]) * 0.15 + 1;
      meshRef.current.scale.setScalar(pulse * intensity);
      const material = meshRef.current.material as THREE.MeshBasicMaterial;
      if (material.opacity !== undefined) {
        material.opacity = 0.15 + Math.sin(state.clock.elapsedTime * 1.2) * 0.08;
      }
    }
    if (innerRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 2 + position[0] * 2) * 0.1 + 1;
      innerRef.current.scale.setScalar(pulse * intensity * 0.6);
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y += 0.003;
    }
  });

  const isHot = intensity > 0.6;
  const coreColor = isHot ? "#ff4500" : "#00bfff";
  const glowColor = isHot ? "#ff6b35" : "#4dc9ff";

  return (
    <group position={position}>
      {/* Outer cloud sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.0, 24, 24]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      
      {/* Inner hot/cold core */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial 
          color={coreColor}
          transparent
          opacity={0.25}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Secondary glow layer */}
      <mesh scale={1.4}>
        <sphereGeometry args={[0.8 * intensity, 16, 16]} />
        <meshBasicMaterial 
          color={glowColor}
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Particle cloud for volumetric effect */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particlePositions.length / 3}
            array={particlePositions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={particleColors.length / 3}
            array={particleColors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          vertexColors
          transparent
          opacity={0.7}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
          depthWrite={false}
        />
      </points>

      {/* Ground glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.2, 1.2 * intensity, 32]} />
        <meshBasicMaterial 
          color={isHot ? "#ff6b35" : "#4dc9ff"}
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Intensity indicator */}
      <Html
        position={[0, 0.5 * intensity, 0]}
        center
        style={{
          color: isHot ? '#ff6b35' : '#4dc9ff',
          fontSize: '10px',
          fontWeight: 'bold',
          textShadow: `0 0 6px ${isHot ? '#ff4500' : '#00bfff'}`,
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: 0.8
        }}
      >
        {Math.round(intensity * 100)}%
      </Html>
    </group>
  );
}

// Animated running player with detailed body (without heat cloud)
function AnimatedPlayerFigure({ 
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
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { camera, raycaster, gl } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const intersection = useMemo(() => new THREE.Vector3(), []);
  
  const emissiveIntensity = hovered || isDragging ? 1.2 : 0.4;
  
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
  
  // Running animation
  useFrame((state) => {
    if (groupRef.current) {
      const time = state.clock.elapsedTime;
      const speed = intensity * 6;
      
      // Body bob and lean
      const breathe = Math.sin(time * speed) * 0.03;
      groupRef.current.position.y = breathe;
      
      if (!isDragging) {
        groupRef.current.rotation.y = Math.sin(time * 0.8 + position[0]) * 0.15;
        groupRef.current.rotation.x = Math.sin(time * speed) * 0.02;
      }

      // Leg animation
      if (leftLegRef.current && rightLegRef.current) {
        const legSwing = Math.sin(time * speed) * 0.6;
        leftLegRef.current.rotation.x = legSwing;
        rightLegRef.current.rotation.x = -legSwing;
      }

      // Arm animation
      if (leftArmRef.current && rightArmRef.current) {
        const armSwing = Math.sin(time * speed) * 0.5;
        leftArmRef.current.rotation.x = -armSwing;
        rightArmRef.current.rotation.x = armSwing;
      }
    }
  });

  // Body proportions
  const torsoHeight = 0.28;
  const headRadius = 0.1;
  const legLength = 0.22;
  const armLength = 0.18;
  const shoulderWidth = 0.16;

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

      {/* Shadow on ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} scale={[1, 0.5, 1]}>
        <circleGeometry args={[0.15, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} />
      </mesh>

      {/* Cleats/Shoes */}
      <mesh position={[-0.05, 0.03, 0]}>
        <boxGeometry args={[0.06, 0.04, 0.1]} />
        <meshStandardMaterial color="#111111" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0.05, 0.03, 0]}>
        <boxGeometry args={[0.06, 0.04, 0.1]} />
        <meshStandardMaterial color="#111111" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Left Leg Group */}
      <group ref={leftLegRef} position={[-0.05, legLength + 0.05, 0]}>
        <mesh position={[0, -0.05, 0]}>
          <capsuleGeometry args={[0.04, 0.12, 4, 8]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.2} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.15, 0]}>
          <capsuleGeometry args={[0.035, 0.1, 4, 8]} />
          <meshStandardMaterial 
            color={teamColor}
            emissive={teamColor}
            emissiveIntensity={0.2}
            metalness={0.3} 
            roughness={0.6} 
          />
        </mesh>
      </group>

      {/* Right Leg Group */}
      <group ref={rightLegRef} position={[0.05, legLength + 0.05, 0]}>
        <mesh position={[0, -0.05, 0]}>
          <capsuleGeometry args={[0.04, 0.12, 4, 8]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.2} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.15, 0]}>
          <capsuleGeometry args={[0.035, 0.1, 4, 8]} />
          <meshStandardMaterial 
            color={teamColor}
            emissive={teamColor}
            emissiveIntensity={0.2}
            metalness={0.3} 
            roughness={0.6} 
          />
        </mesh>
      </group>

      {/* Torso/Jersey */}
      <mesh position={[0, legLength + torsoHeight / 2 + 0.08, 0]}>
        <capsuleGeometry args={[0.09, torsoHeight, 4, 8]} />
        <meshStandardMaterial 
          color={teamColor}
          emissive={teamColor}
          emissiveIntensity={emissiveIntensity}
          metalness={0.3}
          roughness={0.5}
        />
      </mesh>

      {/* Jersey stripes detail */}
      <mesh position={[0, legLength + torsoHeight / 2 + 0.08, 0.091]}>
        <planeGeometry args={[0.08, 0.12]} />
        <meshStandardMaterial 
          color={team === 'home' ? '#ffffff' : '#000000'}
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Left Arm Group */}
      <group ref={leftArmRef} position={[-shoulderWidth / 2 - 0.03, legLength + torsoHeight + 0.02, 0]}>
        <mesh position={[0, -0.08, 0]} rotation={[0, 0, 0.2]}>
          <capsuleGeometry args={[0.03, armLength, 4, 8]} />
          <meshStandardMaterial 
            color={teamColor}
            emissive={teamColor}
            emissiveIntensity={emissiveIntensity * 0.4}
            metalness={0.3}
            roughness={0.6}
          />
        </mesh>
        <mesh position={[-0.02, -0.18, 0]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#f5d0c5" metalness={0.1} roughness={0.7} />
        </mesh>
      </group>

      {/* Right Arm Group */}
      <group ref={rightArmRef} position={[shoulderWidth / 2 + 0.03, legLength + torsoHeight + 0.02, 0]}>
        <mesh position={[0, -0.08, 0]} rotation={[0, 0, -0.2]}>
          <capsuleGeometry args={[0.03, armLength, 4, 8]} />
          <meshStandardMaterial 
            color={teamColor}
            emissive={teamColor}
            emissiveIntensity={emissiveIntensity * 0.4}
            metalness={0.3}
            roughness={0.6}
          />
        </mesh>
        <mesh position={[0.02, -0.18, 0]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#f5d0c5" metalness={0.1} roughness={0.7} />
        </mesh>
      </group>

      {/* Neck */}
      <mesh position={[0, legLength + torsoHeight + 0.12, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.04, 8]} />
        <meshStandardMaterial color="#f5d0c5" metalness={0.1} roughness={0.7} />
      </mesh>

      {/* Head */}
      <mesh position={[0, legLength + torsoHeight + headRadius + 0.15, 0]}>
        <sphereGeometry args={[headRadius, 16, 16]} />
        <meshStandardMaterial color="#f5d0c5" metalness={0.1} roughness={0.7} />
      </mesh>

      {/* Hair */}
      <mesh position={[0, legLength + torsoHeight + headRadius * 1.5 + 0.15, -0.01]}>
        <sphereGeometry args={[headRadius * 0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2d1810" metalness={0.1} roughness={0.9} />
      </mesh>

      {/* Player number on jersey (back) */}
      <Html
        position={[0, legLength + torsoHeight / 2 + 0.08, -0.1]}
        center
        style={{
          color: team === 'home' ? '#ffffff' : '#000000',
          fontSize: '12px',
          fontWeight: 'bold',
          textShadow: `0 0 4px ${teamColor}`,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {number}
      </Html>

      {/* Hover/Drag label */}
      {(hovered || isDragging) && (
        <Html
          position={[0, legLength + torsoHeight + headRadius * 2 + 0.3, 0]}
          center
          style={{
            background: isDragging ? 'rgba(16,185,129,0.95)' : 'rgba(0,0,0,0.85)',
            color: 'white',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          #{number} {isDragging && '• Movendo'}
        </Html>
      )}
    </group>
  );
}

// Generate heat zones based on attack patterns
function generateHeatZones(homePlayers: Player[], awayPlayers: Player[]): HeatZone[] {
  const zones: HeatZone[] = [];
  
  // Home team attack zones (right side of field for home team - offensive half)
  // Generate zones based on player clustering and offensive positions
  const homeAttackZones = [
    { x: 75, y: 50, intensity: 0.9 }, // Central attacking area
    { x: 85, y: 35, intensity: 0.75 }, // Right wing attack
    { x: 85, y: 65, intensity: 0.7 }, // Left wing attack
    { x: 65, y: 25, intensity: 0.5 }, // Right midfield
    { x: 65, y: 75, intensity: 0.45 }, // Left midfield
  ];

  // Away team attack zones (left side of field for away team - offensive half)
  const awayAttackZones = [
    { x: 25, y: 50, intensity: 0.85 }, // Central attacking area
    { x: 15, y: 40, intensity: 0.65 }, // Left wing attack
    { x: 15, y: 60, intensity: 0.6 }, // Right wing attack
    { x: 35, y: 30, intensity: 0.4 }, // Left midfield
    { x: 35, y: 70, intensity: 0.35 }, // Right midfield
  ];

  homeAttackZones.forEach(zone => {
    zones.push({ ...zone, team: 'home' });
  });

  awayAttackZones.forEach(zone => {
    zones.push({ ...zone, team: 'away' });
  });

  return zones;
}

// Field scene with draggable players and heat zones
function FieldScene({ 
  homePlayers, 
  awayPlayers,
  homeColor,
  awayColor,
  autoRotate,
  onHomePlayerDrag,
  onAwayPlayerDrag,
  editable,
  heatZones
}: { 
  homePlayers: Player[];
  awayPlayers: Player[];
  homeColor: string;
  awayColor: string;
  autoRotate: boolean;
  onHomePlayerDrag: (index: number, position: [number, number, number]) => void;
  onAwayPlayerDrag: (index: number, position: [number, number, number]) => void;
  editable: boolean;
  heatZones: HeatZone[];
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

      {/* Heat zones on the field - representing attack areas */}
      {heatZones.map((zone, idx) => (
        <FieldHeatZone
          key={`zone-${idx}`}
          position={convertPosition(zone.x, zone.y)}
          intensity={zone.intensity}
          color={zone.team === 'home' ? homeColor : awayColor}
          team={zone.team}
        />
      ))}

      {/* Home players with animated figures */}
      {homePlayers.map((player, idx) => (
        <AnimatedPlayerFigure
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

      {/* Away players with animated figures */}
      {awayPlayers.map((player, idx) => (
        <AnimatedPlayerFigure
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

  // Generate heat zones based on attack patterns
  const heatZones = useMemo(() => {
    return generateHeatZones(homePlayers, awayPlayers);
  }, [homePlayers, awayPlayers]);

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
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
        <div 
          className="w-4 h-4 rounded-full border-2 border-white/30 shadow-lg"
          style={{ backgroundColor: homeColor, boxShadow: `0 0 8px ${homeColor}` }}
        />
        <span className="text-sm font-medium text-white">{homeTeam}</span>
      </div>
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
        <span className="text-sm font-medium text-white">{awayTeam}</span>
        <div 
          className="w-4 h-4 rounded-full border-2 border-white/30 shadow-lg"
          style={{ backgroundColor: awayColor, boxShadow: `0 0 8px ${awayColor}` }}
        />
      </div>

      {/* Heat legend */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500/60" />
          <span className="text-xs text-white/70">Baixa atividade</span>
        </div>
        <div className="w-12 h-2 rounded-full bg-gradient-to-r from-blue-500 via-yellow-500 to-red-500" />
        <div className="flex items-center gap-1">
          <span className="text-xs text-white/70">Alta atividade</span>
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
        </div>
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
        
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 15, 5]} intensity={1.5} castShadow />
        <pointLight position={[-5, 8, -5]} intensity={0.8} color="#10b981" />
        <pointLight position={[5, 8, 5]} intensity={0.6} color="#3b82f6" />
        <hemisphereLight args={['#87ceeb', '#0d4a2a', 0.4]} />

        <FieldScene 
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          homeColor={homeColor}
          awayColor={awayColor}
          autoRotate={autoRotate}
          onHomePlayerDrag={handleHomePlayerDrag}
          onAwayPlayerDrag={handleAwayPlayerDrag}
          editable={editable}
          heatZones={heatZones}
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
