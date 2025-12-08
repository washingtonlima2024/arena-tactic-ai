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

// Lightweight 3D heat cloud with soft glow
function LightHeatCloud({ 
  position, 
  intensity = 0.7, 
  color,
  isHot = true
}: { 
  position: [number, number, number]; 
  intensity?: number; 
  color: string;
  isHot?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    if (groupRef.current) {
      // Gentle floating animation
      groupRef.current.position.y = position[1] + Math.sin(time * 0.8 + position[0]) * 0.05;
    }
    if (innerRef.current) {
      const pulse = Math.sin(time * 1.5 + position[0]) * 0.1 + 1;
      innerRef.current.scale.setScalar(pulse * 0.5);
      const mat = innerRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + Math.sin(time * 1.2) * 0.05;
    }
    if (outerRef.current) {
      const pulse = Math.sin(time * 1.2 + position[0] * 0.5) * 0.08 + 1;
      outerRef.current.scale.setScalar(pulse);
      outerRef.current.rotation.y += 0.002;
    }
  });

  const coreColor = isHot ? "#ff6b35" : "#4dc9ff";
  const glowColor = isHot ? "#ff4500" : "#00bfff";

  return (
    <group ref={groupRef} position={position}>
      {/* Ground glow disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.8 * intensity, 32]} />
        <meshBasicMaterial 
          color={glowColor}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Soft outer glow sphere */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[0.6 * intensity, 16, 16]} />
        <meshBasicMaterial 
          color={color}
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      
      {/* Inner bright core */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[0.3 * intensity, 12, 12]} />
        <meshBasicMaterial 
          color={coreColor}
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Vertical light beam */}
      <mesh position={[0, 0.2 * intensity, 0]}>
        <cylinderGeometry args={[0.02, 0.15 * intensity, 0.4 * intensity, 8]} />
        <meshBasicMaterial 
          color={coreColor}
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// Animated soccer ball
function SoccerBall({ position }: { position: [number, number, number] }) {
  const ballRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (ballRef.current) {
      const time = state.clock.elapsedTime;
      // Rolling animation
      ballRef.current.rotation.x += 0.02;
      ballRef.current.rotation.z += 0.01;
      // Slight bounce
      ballRef.current.position.y = 0.08 + Math.abs(Math.sin(time * 3)) * 0.03;
    }
  });

  return (
    <group position={position}>
      {/* Ball shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>
      
      {/* Soccer ball */}
      <mesh ref={ballRef} position={[0, 0.08, 0]}>
        <icosahedronGeometry args={[0.07, 1]} />
        <meshStandardMaterial 
          color="#ffffff"
          metalness={0.1}
          roughness={0.4}
        />
      </mesh>
      
      {/* Ball glow */}
      <mesh position={[0, 0.08, 0]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial 
          color="#ffffff"
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// Referee figure
function RefereeFigure({ position }: { position: [number, number, number] }) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      const time = state.clock.elapsedTime;
      // Subtle movement
      groupRef.current.rotation.y = Math.sin(time * 0.5) * 0.2;
    }
  });

  const torsoHeight = 0.28;
  const headRadius = 0.1;
  const legLength = 0.22;

  return (
    <group ref={groupRef} position={position}>
      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.12, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} />
      </mesh>

      {/* Shoes */}
      <mesh position={[-0.04, 0.03, 0]}>
        <boxGeometry args={[0.05, 0.04, 0.08]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
      <mesh position={[0.04, 0.03, 0]}>
        <boxGeometry args={[0.05, 0.04, 0.08]} />
        <meshStandardMaterial color="#111111" />
      </mesh>

      {/* Legs - black shorts */}
      <mesh position={[-0.04, legLength / 2 + 0.05, 0]}>
        <capsuleGeometry args={[0.035, legLength * 0.8, 4, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.04, legLength / 2 + 0.05, 0]}>
        <capsuleGeometry args={[0.035, legLength * 0.8, 4, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* Torso - yellow/black referee jersey */}
      <mesh position={[0, legLength + torsoHeight / 2 + 0.08, 0]}>
        <capsuleGeometry args={[0.08, torsoHeight, 4, 8]} />
        <meshStandardMaterial 
          color="#ffcc00"
          metalness={0.2}
          roughness={0.6}
        />
      </mesh>

      {/* Black stripes on jersey */}
      <mesh position={[0, legLength + torsoHeight / 2 + 0.08, 0.081]}>
        <planeGeometry args={[0.16, 0.04]} />
        <meshStandardMaterial color="#000000" />
      </mesh>

      {/* Arms */}
      <mesh position={[-0.12, legLength + torsoHeight, 0]} rotation={[0, 0, 0.3]}>
        <capsuleGeometry args={[0.025, 0.15, 4, 8]} />
        <meshStandardMaterial color="#ffcc00" />
      </mesh>
      <mesh position={[0.12, legLength + torsoHeight, 0]} rotation={[0, 0, -0.3]}>
        <capsuleGeometry args={[0.025, 0.15, 4, 8]} />
        <meshStandardMaterial color="#ffcc00" />
      </mesh>

      {/* Whistle in hand */}
      <mesh position={[0.18, legLength + torsoHeight - 0.05, 0]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Head */}
      <mesh position={[0, legLength + torsoHeight + headRadius + 0.12, 0]}>
        <sphereGeometry args={[headRadius, 16, 16]} />
        <meshStandardMaterial color="#f5d0c5" />
      </mesh>

      {/* Hair */}
      <mesh position={[0, legLength + torsoHeight + headRadius * 1.4 + 0.12, 0]}>
        <sphereGeometry args={[headRadius * 0.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
    </group>
  );
}

// Linesman (assistant referee with flag)
function LinesmanFigure({ position, side }: { position: [number, number, number]; side: 'left' | 'right' }) {
  const groupRef = useRef<THREE.Group>(null);
  const flagRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      const time = state.clock.elapsedTime;
      groupRef.current.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    }
    if (flagRef.current) {
      const time = state.clock.elapsedTime;
      // Flag waving
      flagRef.current.rotation.z = Math.sin(time * 4) * 0.1;
    }
  });

  const torsoHeight = 0.24;
  const headRadius = 0.08;
  const legLength = 0.18;

  return (
    <group ref={groupRef} position={position}>
      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.1, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>

      {/* Shoes */}
      <mesh position={[-0.03, 0.025, 0]}>
        <boxGeometry args={[0.04, 0.03, 0.06]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
      <mesh position={[0.03, 0.025, 0]}>
        <boxGeometry args={[0.04, 0.03, 0.06]} />
        <meshStandardMaterial color="#111111" />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.03, legLength / 2 + 0.04, 0]}>
        <capsuleGeometry args={[0.028, legLength * 0.7, 4, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.03, legLength / 2 + 0.04, 0]}>
        <capsuleGeometry args={[0.028, legLength * 0.7, 4, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* Torso */}
      <mesh position={[0, legLength + torsoHeight / 2 + 0.06, 0]}>
        <capsuleGeometry args={[0.06, torsoHeight, 4, 8]} />
        <meshStandardMaterial color="#ffcc00" />
      </mesh>

      {/* Flag arm raised */}
      <mesh position={[side === 'left' ? 0.1 : -0.1, legLength + torsoHeight + 0.15, 0]} rotation={[0, 0, side === 'left' ? -0.8 : 0.8]}>
        <capsuleGeometry args={[0.02, 0.12, 4, 8]} />
        <meshStandardMaterial color="#ffcc00" />
      </mesh>

      {/* Flag pole */}
      <mesh position={[side === 'left' ? 0.18 : -0.18, legLength + torsoHeight + 0.35, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.4, 8]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Flag */}
      <mesh ref={flagRef} position={[side === 'left' ? 0.24 : -0.24, legLength + torsoHeight + 0.48, 0]}>
        <planeGeometry args={[0.12, 0.08]} />
        <meshStandardMaterial 
          color="#ff4444"
          side={THREE.DoubleSide}
          emissive="#ff4444"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Head */}
      <mesh position={[0, legLength + torsoHeight + headRadius + 0.1, 0]}>
        <sphereGeometry args={[headRadius, 12, 12]} />
        <meshStandardMaterial color="#f5d0c5" />
      </mesh>
    </group>
  );
}

// Detailed goal posts with net
function GoalPost({ position, side }: { position: [number, number, number]; side: 'left' | 'right' }) {
  const netRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (netRef.current) {
      const time = state.clock.elapsedTime;
      // Subtle net movement
      const positions = netRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 2] = Math.sin(time * 2 + positions[i] * 3 + positions[i + 1] * 2) * 0.02;
      }
      netRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  const goalWidth = 1.4;
  const goalHeight = 0.45;
  const goalDepth = 0.35;
  const postRadius = 0.03;

  return (
    <group position={position}>
      {/* Left post */}
      <mesh position={[0, goalHeight / 2, -goalWidth / 2]}>
        <cylinderGeometry args={[postRadius, postRadius, goalHeight, 12]} />
        <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
      </mesh>
      
      {/* Right post */}
      <mesh position={[0, goalHeight / 2, goalWidth / 2]}>
        <cylinderGeometry args={[postRadius, postRadius, goalHeight, 12]} />
        <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
      </mesh>
      
      {/* Crossbar */}
      <mesh position={[0, goalHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[postRadius, postRadius, goalWidth, 12]} />
        <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Back supports */}
      <mesh position={[side === 'left' ? -goalDepth : goalDepth, goalHeight / 2, -goalWidth / 2]}>
        <cylinderGeometry args={[postRadius * 0.7, postRadius * 0.7, goalHeight, 8]} />
        <meshStandardMaterial color="#cccccc" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[side === 'left' ? -goalDepth : goalDepth, goalHeight / 2, goalWidth / 2]}>
        <cylinderGeometry args={[postRadius * 0.7, postRadius * 0.7, goalHeight, 8]} />
        <meshStandardMaterial color="#cccccc" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Top back bar */}
      <mesh position={[side === 'left' ? -goalDepth : goalDepth, goalHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[postRadius * 0.7, postRadius * 0.7, goalWidth, 8]} />
        <meshStandardMaterial color="#cccccc" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Net - back */}
      <mesh 
        ref={netRef}
        position={[side === 'left' ? -goalDepth / 2 : goalDepth / 2, goalHeight / 2, 0]}
      >
        <planeGeometry args={[goalDepth, goalHeight, 8, 8]} />
        <meshBasicMaterial 
          color="#ffffff"
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          wireframe
        />
      </mesh>

      {/* Net - sides */}
      <mesh position={[side === 'left' ? -goalDepth / 2 : goalDepth / 2, goalHeight / 2, -goalWidth / 2]}>
        <planeGeometry args={[goalDepth, goalHeight, 4, 8]} />
        <meshBasicMaterial 
          color="#ffffff"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          wireframe
        />
      </mesh>
      <mesh position={[side === 'left' ? -goalDepth / 2 : goalDepth / 2, goalHeight / 2, goalWidth / 2]}>
        <planeGeometry args={[goalDepth, goalHeight, 4, 8]} />
        <meshBasicMaterial 
          color="#ffffff"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          wireframe
        />
      </mesh>
    </group>
  );
}

// Corner flags
function CornerFlag({ position }: { position: [number, number, number] }) {
  const flagRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (flagRef.current) {
      const time = state.clock.elapsedTime;
      flagRef.current.rotation.z = Math.sin(time * 5 + position[0]) * 0.15;
    }
  });

  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.5, 8]} />
        <meshStandardMaterial color="#ffcc00" metalness={0.6} roughness={0.3} />
      </mesh>
      
      {/* Flag */}
      <mesh ref={flagRef} position={[0.04, 0.45, 0]}>
        <planeGeometry args={[0.08, 0.06]} />
        <meshStandardMaterial 
          color="#ff4444"
          side={THREE.DoubleSide}
          emissive="#ff4444"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  );
}

// Animated running player with detailed body
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
      
      const breathe = Math.sin(time * speed) * 0.03;
      groupRef.current.position.y = breathe;
      
      if (!isDragging) {
        groupRef.current.rotation.y = Math.sin(time * 0.8 + position[0]) * 0.15;
        groupRef.current.rotation.x = Math.sin(time * speed) * 0.02;
      }

      if (leftLegRef.current && rightLegRef.current) {
        const legSwing = Math.sin(time * speed) * 0.6;
        leftLegRef.current.rotation.x = legSwing;
        rightLegRef.current.rotation.x = -legSwing;
      }

      if (leftArmRef.current && rightArmRef.current) {
        const armSwing = Math.sin(time * speed) * 0.5;
        leftArmRef.current.rotation.x = -armSwing;
        rightArmRef.current.rotation.x = armSwing;
      }
    }
  });

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
      {isDragging && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.35, 0.4, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </mesh>
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} scale={[1, 0.5, 1]}>
        <circleGeometry args={[0.15, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} />
      </mesh>

      <mesh position={[-0.05, 0.03, 0]}>
        <boxGeometry args={[0.06, 0.04, 0.1]} />
        <meshStandardMaterial color="#111111" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0.05, 0.03, 0]}>
        <boxGeometry args={[0.06, 0.04, 0.1]} />
        <meshStandardMaterial color="#111111" metalness={0.5} roughness={0.3} />
      </mesh>

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

      <mesh position={[0, legLength + torsoHeight / 2 + 0.08, 0.091]}>
        <planeGeometry args={[0.08, 0.12]} />
        <meshStandardMaterial 
          color={team === 'home' ? '#ffffff' : '#000000'}
          transparent
          opacity={0.3}
        />
      </mesh>

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

      <mesh position={[0, legLength + torsoHeight + 0.12, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.04, 8]} />
        <meshStandardMaterial color="#f5d0c5" metalness={0.1} roughness={0.7} />
      </mesh>

      <mesh position={[0, legLength + torsoHeight + headRadius + 0.15, 0]}>
        <sphereGeometry args={[headRadius, 16, 16]} />
        <meshStandardMaterial color="#f5d0c5" metalness={0.1} roughness={0.7} />
      </mesh>

      <mesh position={[0, legLength + torsoHeight + headRadius * 1.5 + 0.15, -0.01]}>
        <sphereGeometry args={[headRadius * 0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2d1810" metalness={0.1} roughness={0.9} />
      </mesh>

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
function generateHeatZones(): HeatZone[] {
  return [
    { x: 75, y: 50, intensity: 0.85, team: 'home' },
    { x: 82, y: 35, intensity: 0.65, team: 'home' },
    { x: 82, y: 65, intensity: 0.6, team: 'home' },
    { x: 25, y: 50, intensity: 0.8, team: 'away' },
    { x: 18, y: 40, intensity: 0.55, team: 'away' },
    { x: 18, y: 60, intensity: 0.5, team: 'away' },
  ];
}

// Field scene with all elements
function FieldScene({ 
  homePlayers, 
  awayPlayers,
  homeColor,
  awayColor,
  autoRotate,
  onHomePlayerDrag,
  onAwayPlayerDrag,
  editable,
  heatZones,
  isLocked
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
  isLocked: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current && autoRotate && !isLocked) {
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

      {/* Penalty areas */}
      <lineSegments position={[-3.75, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(2, 3.2)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>
      <lineSegments position={[3.75, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(2, 3.2)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      {/* Goal areas */}
      <lineSegments position={[-4.5, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(0.8, 1.6)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>
      <lineSegments position={[4.5, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(0.8, 1.6)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>

      {/* Penalty spots */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-3.5, 0.02, 0]}>
        <circleGeometry args={[0.04, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.5, 0.02, 0]}>
        <circleGeometry args={[0.04, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Goal posts with nets */}
      <GoalPost position={[-5.25, 0, 0]} side="left" />
      <GoalPost position={[5.25, 0, 0]} side="right" />

      {/* Corner flags */}
      <CornerFlag position={[-5.25, 0, -3.25]} />
      <CornerFlag position={[-5.25, 0, 3.25]} />
      <CornerFlag position={[5.25, 0, -3.25]} />
      <CornerFlag position={[5.25, 0, 3.25]} />

      {/* Soccer ball at center */}
      <SoccerBall position={[0, 0, 0]} />

      {/* Referee */}
      <RefereeFigure position={[1.5, 0, 0]} />

      {/* Linesmen (assistant referees) */}
      <LinesmanFigure position={[0, 0, -3.4]} side="left" />
      <LinesmanFigure position={[0, 0, 3.4]} side="right" />

      {/* Heat zones */}
      {heatZones.map((zone, idx) => (
        <LightHeatCloud
          key={`zone-${idx}`}
          position={convertPosition(zone.x, zone.y)}
          intensity={zone.intensity}
          color={zone.team === 'home' ? homeColor : awayColor}
          isHot={zone.intensity > 0.6}
        />
      ))}

      {/* Home players */}
      {homePlayers.map((player, idx) => (
        <AnimatedPlayerFigure
          key={`home-${idx}-${player.number}`}
          position={convertPosition(player.x, player.y)}
          number={player.number}
          team="home"
          teamColor={homeColor}
          intensity={player.intensity || 0.7}
          isDraggable={editable && isLocked}
          onDrag={(pos) => onHomePlayerDrag(idx, pos)}
        />
      ))}

      {/* Away players */}
      {awayPlayers.map((player, idx) => (
        <AnimatedPlayerFigure
          key={`away-${idx}-${player.number}`}
          position={convertPosition(player.x, player.y)}
          number={player.number}
          team="away"
          teamColor={awayColor}
          intensity={player.intensity || 0.7}
          isDraggable={editable && isLocked}
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
  const [isLocked, setIsLocked] = useState(false);
  const [homePlayers, setHomePlayers] = useState(initialHomePlayers);
  const [awayPlayers, setAwayPlayers] = useState(initialAwayPlayers);

  const heatZones = useMemo(() => generateHeatZones(), []);

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

  const handleToggleLock = () => {
    setIsLocked(!isLocked);
    if (!isLocked) {
      setAutoRotate(false);
    }
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
          <span className="text-xs text-white/70">Frio</span>
        </div>
        <div className="w-12 h-2 rounded-full bg-gradient-to-r from-blue-500 via-yellow-500 to-red-500" />
        <div className="flex items-center gap-1">
          <span className="text-xs text-white/70">Quente</span>
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 left-4 z-10 flex gap-2">
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          disabled={isLocked}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
            autoRotate && !isLocked
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {autoRotate && !isLocked ? 'Rotação: On' : 'Rotação: Off'}
        </button>
        {editable && (
          <>
            <button
              onClick={handleToggleLock}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                isLocked 
                  ? 'bg-yellow-500 text-black font-medium' 
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {isLocked ? '🔒 Modo Edição' : '🔓 Travar Campo'}
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              Resetar
            </button>
          </>
        )}
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 z-10 text-xs text-white/60 bg-black/30 px-2 py-1 rounded">
        {isLocked 
          ? '🔒 Campo travado • Arraste os jogadores' 
          : editable 
            ? 'Trave o campo para mover jogadores' 
            : 'Arraste para girar • Scroll para zoom'
        }
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
          isLocked={isLocked}
        />

        <OrbitControls
          enablePan={false}
          enableRotate={!isLocked}
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
