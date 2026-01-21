import { useRef, useMemo, Suspense } from 'react';
import { useLoader, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as THREE from 'three';
import React from 'react';

// Interface for uniform colors
interface UniformColors {
  shirt: string;
  shorts: string;
  socks: string;
  skin: string;
  hair: string;
  boots: string;
}

interface SoccerPlayerModelProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  teamColor: string;
  number?: number;
  name?: string | null;
  isScorer?: boolean;
  isMoving?: boolean;
  team: 'home' | 'away' | 'referee' | 'linesman';
  intensity?: number;
  onDrag?: (newPosition: [number, number, number]) => void;
  isDraggable?: boolean;
  showNumber?: boolean;
  facingDirection?: 'left' | 'right' | 'up' | 'down';
  uniformColors?: UniformColors;
  hasAudio?: boolean;
}

// Default uniform colors for each team type
const DEFAULT_UNIFORM_COLORS: Record<string, UniformColors> = {
  home: {
    shirt: '#1e40af',
    shorts: '#1e3a8a',
    socks: '#ffffff',
    skin: '#deb887',
    hair: '#1a1a1a',
    boots: '#111111',
  },
  away: {
    shirt: '#dc2626',
    shorts: '#b91c1c',
    socks: '#ffffff',
    skin: '#deb887',
    hair: '#1a1a1a',
    boots: '#111111',
  },
  referee: {
    shirt: '#fbbf24',
    shorts: '#1f2937',
    socks: '#1f2937',
    skin: '#deb887',
    hair: '#1a1a1a',
    boots: '#111111',
  },
  linesman: {
    shirt: '#f97316',
    shorts: '#1f2937',
    socks: '#1f2937',
    skin: '#deb887',
    hair: '#1a1a1a',
    boots: '#111111',
  }
};

// Function to determine color based on vertex height (Z coordinate in the OBJ)
function getColorByVertexHeight(z: number, uniformColors: UniformColors): string {
  // The model has Z varying from ~0 to ~140
  // These thresholds segment the player model into body parts
  if (z > 130) return uniformColors.hair;      // Hair (top of head)
  if (z > 115) return uniformColors.skin;      // Face
  if (z > 75) return uniformColors.shirt;      // Shirt (torso)
  if (z > 50) return uniformColors.shorts;     // Shorts
  if (z > 12) return uniformColors.socks;      // Socks/shins
  return uniformColors.boots;                   // Boots
}

// Preload the model for better performance
try {
  useLoader.preload(OBJLoader, '/models/soccer-player.obj');
} catch (e) {
  // Silently fail preload if model doesn't exist yet
}

function SoccerPlayerModelInner({
  position,
  rotation = [0, 0, 0],
  scale = 0.005,
  teamColor,
  number,
  name,
  isScorer = false,
  isMoving = false,
  team,
  intensity = 0.7,
  onDrag,
  isDraggable = false,
  showNumber = true,
  facingDirection = 'right',
  uniformColors,
  hasAudio = false
}: SoccerPlayerModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const { camera, raycaster, gl } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const intersection = useMemo(() => new THREE.Vector3(), []);
  
  // Load OBJ model
  const obj = useLoader(OBJLoader, '/models/soccer-player.obj');
  
  // Get the uniform colors to use - PRIORITY: uniformColors > teamColor > defaults
  const colors = useMemo(() => {
    // If explicit uniformColors was passed, use it
    if (uniformColors) return uniformColors;
    
    // For referees and linesmen, use default colors
    if (team === 'referee' || team === 'linesman') {
      return DEFAULT_UNIFORM_COLORS[team];
    }
    
    // For home/away teams, use teamColor from the database
    return {
      shirt: teamColor,
      shorts: teamColor,
      socks: '#ffffff',
      skin: '#deb887',
      hair: '#1a1a1a',
      boots: '#111111',
    };
  }, [uniformColors, team, teamColor]);
  
  // Clone and apply uniform colors based on vertex height
  const clonedObj = useMemo(() => {
    const clone = obj.clone(true);
    
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Clone the geometry to avoid modifying the original
        const geometry = child.geometry.clone();
        child.geometry = geometry;
        
        const positions = geometry.attributes.position;
        const vertexColors = new Float32Array(positions.count * 3);
        
        // Apply colors based on vertex height (Z in OBJ corresponds to height)
        for (let i = 0; i < positions.count; i++) {
          const z = positions.getZ(i);
          const partColor = getColorByVertexHeight(z, colors);
          const color = new THREE.Color(partColor);
          
          vertexColors[i * 3] = color.r;
          vertexColors[i * 3 + 1] = color.g;
          vertexColors[i * 3 + 2] = color.b;
        }
        
        geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
        
        // Create material with vertex colors
        child.material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.5,
          metalness: 0.1,
          emissive: new THREE.Color(colors.shirt),
          emissiveIntensity: hovered || isDragging ? 0.3 : 0.08,
        });
        
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    return clone;
  }, [obj, colors, hovered, isDragging]);
  
  // Animation
  useFrame((state) => {
    if (groupRef.current) {
      const time = state.clock.elapsedTime;
      const speed = intensity * 6;
      
      // Breathing/floating animation
      const breathe = Math.sin(time * speed) * 0.02;
      groupRef.current.position.y = position[1] + breathe;
      
      // Subtle rotation when not dragging
      if (!isDragging) {
        groupRef.current.rotation.y = rotation[1] + Math.sin(time * 0.8 + position[0]) * 0.1;
      }
      
      // Running bob when moving
      if (isMoving && modelRef.current) {
        modelRef.current.position.y = Math.abs(Math.sin(time * speed * 2)) * 0.02;
        modelRef.current.rotation.z = Math.sin(time * speed) * 0.03;
      }
    }
  });
  
  // Drag handlers
  const handlePointerDown = React.useCallback((e: any) => {
    if (!isDraggable) return;
    e.stopPropagation();
    setIsDragging(true);
    gl.domElement.style.cursor = 'grabbing';
    (e.target as any).setPointerCapture?.(e.pointerId);
  }, [isDraggable, gl]);

  const handlePointerUp = React.useCallback((e: any) => {
    if (!isDragging) return;
    e.stopPropagation();
    setIsDragging(false);
    gl.domElement.style.cursor = 'auto';
    (e.target as any).releasePointerCapture?.(e.pointerId);
  }, [isDragging, gl]);

  const handlePointerMove = React.useCallback((e: any) => {
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
      {/* Drag indicator ring */}
      {isDragging && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.35, 0.4, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </mesh>
      )}
      
      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} scale={[1, 0.6, 1]}>
        <circleGeometry args={[0.18, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} />
      </mesh>
      
      {/* Player glow */}
      <pointLight 
        intensity={hovered ? 0.6 : 0.3} 
        distance={2} 
        color={colors.shirt}
        position={[0, 0.3, 0]}
      />
      
      {/* OBJ Model */}
      <group ref={modelRef}>
        <primitive 
          object={clonedObj} 
          scale={[scale, scale, scale]}
          rotation={[
            -Math.PI / 2, 
            0, 
            facingDirection === 'left' ? 0 : 
            facingDirection === 'right' ? Math.PI : 
            facingDirection === 'up' ? Math.PI / 2 : 
            -Math.PI / 2 // down
          ]}
          position={[0, 0, 0]}
        />
      </group>
      
      {/* Player name label (priority over number) */}
      {name && (
        <Html
          position={[0, 0.85, 0]}
          center
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div className={`px-2 py-0.5 rounded-full text-xs font-bold shadow-lg whitespace-nowrap flex items-center gap-1 ${
            isScorer 
              ? 'bg-yellow-500 text-black' 
              : 'bg-white/90 text-black'
          }`}>
            {isScorer ? '⚽ ' : ''}{name}
            {hasAudio && <span className="text-[10px]">🔊</span>}
          </div>
        </Html>
      )}
      
      {/* Player number badge (only if no name) */}
      {showNumber && number && !name && (
        <Html
          position={[0, 0.65, 0]}
          center
          style={{
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 'bold',
            textShadow: `0 0 4px ${colors.shirt}, 0 0 8px ${colors.shirt}`,
            pointerEvents: 'none',
            userSelect: 'none',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: '2px 6px',
            borderRadius: '4px',
            border: `1px solid ${colors.shirt}`,
          }}
        >
          {number}
        </Html>
      )}
      
      {/* Audio indicator for scorer (fallback if no name displayed) */}
      {!name && isScorer && hasAudio && (
        <Html
          position={[0, 0.85, 0]}
          center
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div className="px-2 py-0.5 rounded-full text-xs font-bold shadow-lg whitespace-nowrap bg-yellow-500 text-black flex items-center gap-1">
            ⚽ 🔊
          </div>
        </Html>
      )}
      
      {/* Hover tooltip */}
      {(hovered || isDragging) && isDraggable && (
        <Html
          position={[0, 0.9, 0]}
          center
          style={{
            color: '#ffffff',
            fontSize: '10px',
            background: 'rgba(0,0,0,0.8)',
            padding: '4px 8px',
            marginTop: hasAudio || isScorer ? '35px' : '0',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {isDragging ? 'Arraste para mover' : `Jogador #${number}`}
        </Html>
      )}
    </group>
  );
}

// Fallback component while loading
function PlayerFallback({ 
  position, 
  teamColor,
  number,
  team
}: { 
  position: [number, number, number]; 
  teamColor: string;
  number?: number;
  team: 'home' | 'away' | 'referee' | 'linesman';
}) {
  const groupRef = useRef<THREE.Group>(null);
  const colors = DEFAULT_UNIFORM_COLORS[team] || {
    shirt: teamColor,
    shorts: teamColor,
    socks: '#ffffff',
    skin: '#deb887',
    hair: '#1a1a1a',
    boots: '#111111',
  };
  
  useFrame((state) => {
    if (groupRef.current) {
      const time = state.clock.elapsedTime;
      groupRef.current.position.y = position[1] + Math.sin(time * 3) * 0.02;
    }
  });
  
  return (
    <group ref={groupRef} position={position}>
      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.12, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>
      
      {/* Boots */}
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.12, 0.06, 0.08]} />
        <meshStandardMaterial color={colors.boots} />
      </mesh>
      
      {/* Socks/Legs */}
      <mesh position={[0, 0.12, 0]}>
        <capsuleGeometry args={[0.04, 0.12, 8, 16]} />
        <meshStandardMaterial color={colors.socks} />
      </mesh>
      
      {/* Shorts */}
      <mesh position={[0, 0.25, 0]}>
        <capsuleGeometry args={[0.06, 0.08, 8, 16]} />
        <meshStandardMaterial color={colors.shorts} />
      </mesh>
      
      {/* Shirt/Body */}
      <mesh position={[0, 0.4, 0]}>
        <capsuleGeometry args={[0.07, 0.15, 8, 16]} />
        <meshStandardMaterial 
          color={colors.shirt}
          emissive={colors.shirt}
          emissiveIntensity={0.2}
        />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0.58, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color={colors.skin} />
      </mesh>
      
      {/* Hair */}
      <mesh position={[0, 0.63, 0]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color={colors.hair} />
      </mesh>
      
      {/* Number */}
      {number && (
        <Html
          position={[0, 0.75, 0]}
          center
          style={{
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 'bold',
            textShadow: `0 0 4px ${colors.shirt}`,
            pointerEvents: 'none',
          }}
        >
          #{number}
        </Html>
      )}
    </group>
  );
}

// Main exported component with Suspense
export function SoccerPlayerModel(props: SoccerPlayerModelProps) {
  return (
    <Suspense fallback={
      <PlayerFallback 
        position={props.position}
        teamColor={props.teamColor}
        number={props.number}
        team={props.team}
      />
    }>
      <SoccerPlayerModelInner {...props} />
    </Suspense>
  );
}

export default SoccerPlayerModel;
