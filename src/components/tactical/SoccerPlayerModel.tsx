import { useRef, useMemo, useEffect, Suspense } from 'react';
import { useLoader, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as THREE from 'three';

interface SoccerPlayerModelProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  teamColor: string;
  number?: number;
  isMoving?: boolean;
  team: 'home' | 'away';
  intensity?: number;
  onDrag?: (newPosition: [number, number, number]) => void;
  isDraggable?: boolean;
  showNumber?: boolean;
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
  scale = 0.008,
  teamColor,
  number,
  isMoving = false,
  team,
  intensity = 0.7,
  onDrag,
  isDraggable = false,
  showNumber = true
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
  
  // Clone and apply team color
  const clonedObj = useMemo(() => {
    const clone = obj.clone();
    
    // Apply team color to all meshes
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Create new material with team color
        child.material = new THREE.MeshStandardMaterial({
          color: teamColor,
          roughness: 0.6,
          metalness: 0.2,
          emissive: teamColor,
          emissiveIntensity: hovered || isDragging ? 0.4 : 0.15,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    return clone;
  }, [obj, teamColor, hovered, isDragging]);
  
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

  const emissiveIntensity = hovered || isDragging ? 0.5 : 0.15;

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
        color={teamColor}
        position={[0, 0.3, 0]}
      />
      
      {/* OBJ Model */}
      <group ref={modelRef}>
        <primitive 
          object={clonedObj} 
          scale={[scale, scale, scale]}
          rotation={[-Math.PI / 2, 0, Math.PI]} // Adjust orientation
          position={[0, 0, 0]}
        />
      </group>
      
      {/* Player number badge */}
      {showNumber && number && (
        <Html
          position={[0, 0.65, 0]}
          center
          style={{
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 'bold',
            textShadow: `0 0 4px ${teamColor}, 0 0 8px ${teamColor}`,
            pointerEvents: 'none',
            userSelect: 'none',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: '2px 6px',
            borderRadius: '4px',
            border: `1px solid ${teamColor}`,
          }}
        >
          #{number}
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
  team: 'home' | 'away';
}) {
  const groupRef = useRef<THREE.Group>(null);
  
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
      
      {/* Simple capsule body */}
      <mesh position={[0, 0.25, 0]}>
        <capsuleGeometry args={[0.08, 0.3, 8, 16]} />
        <meshStandardMaterial 
          color={teamColor}
          emissive={teamColor}
          emissiveIntensity={0.3}
        />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#f5d0c5" />
      </mesh>
      
      {/* Number */}
      {number && (
        <Html
          position={[0, 0.7, 0]}
          center
          style={{
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 'bold',
            textShadow: `0 0 4px ${teamColor}`,
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
import React from 'react';

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
