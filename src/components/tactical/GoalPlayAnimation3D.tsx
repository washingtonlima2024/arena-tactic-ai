import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { WebGLWrapper } from '@/components/ui/WebGLWrapper';
import { OfficialFootballField } from './OfficialFootballField';
import { FIFA_FIELD, FIELD_CALCULATIONS } from '@/constants/fieldDimensions';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, FastForward, Rewind, Maximize2 } from 'lucide-react';

interface PlayerPosition {
  id: string;
  x: number; // in meters (0-105)
  y: number; // in meters (0-68)
  team: 'home' | 'away';
  number?: number;
}

interface BallPosition {
  x: number; // in meters
  y: number; // in meters
}

interface PlayFrame {
  timestamp: number;
  players: PlayerPosition[];
  ball: BallPosition;
}

interface GoalPlayAnimation3DProps {
  frames: PlayFrame[];
  homeTeamColor?: string;
  awayTeamColor?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  goalMinute?: number;
  goalTeam?: 'home' | 'away';
  description?: string;
  height?: number;
  onFrameChange?: (frameIndex: number) => void;
}

// Convert meters to 3D coordinates (centered at origin)
function metersTo3D(x: number, y: number): [number, number, number] {
  // Field is 105m x 68m, centered at origin
  const halfLength = FIFA_FIELD.length / 2;
  const halfWidth = FIFA_FIELD.width / 2;
  return [x - halfLength, 0, y - halfWidth];
}

// Animated soccer ball in 3D
function AnimatedBall({ 
  position, 
  trail 
}: { 
  position: [number, number, number]; 
  trail: [number, number, number][];
}) {
  const ballRef = useRef<THREE.Group>(null);
  const trailRef = useRef<THREE.Points>(null);
  
  useFrame((state) => {
    if (ballRef.current) {
      // Gentle bounce
      ballRef.current.position.y = position[1] + 0.15 + Math.abs(Math.sin(state.clock.elapsedTime * 4)) * 0.1;
      // Roll animation
      ballRef.current.rotation.x = state.clock.elapsedTime * 5;
      ballRef.current.rotation.z = state.clock.elapsedTime * 3;
    }
  });
  
  return (
    <group>
      {/* Ball trail */}
      {trail.length > 1 && (
        <Line
          points={trail.map(p => [p[0], 0.1, p[2]] as [number, number, number])}
          color="#ffffff"
          lineWidth={2}
          transparent
          opacity={0.4}
        />
      )}
      
      {/* Ball */}
      <group ref={ballRef} position={position}>
        <mesh castShadow>
          <sphereGeometry args={[0.22, 32, 32]} />
          <meshStandardMaterial 
            color="#ffffff" 
            roughness={0.3}
            metalness={0.1}
          />
        </mesh>
        {/* Pentagon pattern */}
        {[0, 72, 144, 216, 288].map((angle, i) => (
          <mesh 
            key={i} 
            position={[
              Math.cos(angle * Math.PI / 180) * 0.15,
              Math.sin(angle * Math.PI / 180) * 0.15,
              0.1
            ]}
          >
            <circleGeometry args={[0.06, 5]} />
            <meshBasicMaterial color="#000000" />
          </mesh>
        ))}
        
        {/* Ball glow */}
        <pointLight intensity={0.5} distance={2} color="#ffffff" />
      </group>
    </group>
  );
}

// Animated 3D player figure
function AnimatedPlayer3D({
  position,
  team,
  number,
  teamColor,
  isMoving = false
}: {
  position: [number, number, number];
  team: 'home' | 'away';
  number?: number;
  teamColor: string;
  isMoving?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    if (groupRef.current) {
      // Gentle floating
      groupRef.current.position.y = position[1] + Math.sin(time * 2 + position[0]) * 0.02;
    }
    
    // Running animation when moving
    const animSpeed = isMoving ? 8 : 2;
    const animIntensity = isMoving ? 0.4 : 0.1;
    
    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.rotation.x = Math.sin(time * animSpeed) * animIntensity;
      rightLegRef.current.rotation.x = Math.sin(time * animSpeed + Math.PI) * animIntensity;
    }
    
    if (leftArmRef.current && rightArmRef.current) {
      leftArmRef.current.rotation.x = Math.sin(time * animSpeed + Math.PI) * animIntensity * 0.8;
      rightArmRef.current.rotation.x = Math.sin(time * animSpeed) * animIntensity * 0.8;
    }
  });
  
  const legLength = 0.25;
  const torsoHeight = 0.18;
  const headRadius = 0.07;
  
  return (
    <group ref={groupRef} position={position}>
      {/* Player glow */}
      <pointLight 
        intensity={0.3} 
        distance={1.5} 
        color={teamColor}
        position={[0, 0.3, 0]}
      />
      
      {/* Legs */}
      <group ref={leftLegRef} position={[-0.04, 0, 0]}>
        <mesh position={[0, legLength / 2, 0]}>
          <capsuleGeometry args={[0.03, legLength, 4, 8]} />
          <meshStandardMaterial color="#1a1a2e" />
        </mesh>
        <mesh position={[0, 0.02, 0.03]}>
          <boxGeometry args={[0.05, 0.04, 0.08]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
      </group>
      
      <group ref={rightLegRef} position={[0.04, 0, 0]}>
        <mesh position={[0, legLength / 2, 0]}>
          <capsuleGeometry args={[0.03, legLength, 4, 8]} />
          <meshStandardMaterial color="#1a1a2e" />
        </mesh>
        <mesh position={[0, 0.02, 0.03]}>
          <boxGeometry args={[0.05, 0.04, 0.08]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
      </group>
      
      {/* Torso (jersey) */}
      <mesh position={[0, legLength + torsoHeight / 2 + 0.05, 0]}>
        <capsuleGeometry args={[0.07, torsoHeight, 4, 8]} />
        <meshStandardMaterial 
          color={teamColor}
          emissive={teamColor}
          emissiveIntensity={0.2}
        />
      </mesh>
      
      {/* Arms */}
      <group ref={leftArmRef} position={[-0.1, legLength + torsoHeight, 0]}>
        <mesh position={[0, -0.06, 0]} rotation={[0, 0, 0.2]}>
          <capsuleGeometry args={[0.025, 0.12, 4, 8]} />
          <meshStandardMaterial color={teamColor} />
        </mesh>
      </group>
      
      <group ref={rightArmRef} position={[0.1, legLength + torsoHeight, 0]}>
        <mesh position={[0, -0.06, 0]} rotation={[0, 0, -0.2]}>
          <capsuleGeometry args={[0.025, 0.12, 4, 8]} />
          <meshStandardMaterial color={teamColor} />
        </mesh>
      </group>
      
      {/* Neck */}
      <mesh position={[0, legLength + torsoHeight + 0.1, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 0.03, 8]} />
        <meshStandardMaterial color="#f5d0c5" />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, legLength + torsoHeight + headRadius + 0.12, 0]}>
        <sphereGeometry args={[headRadius, 16, 16]} />
        <meshStandardMaterial color="#f5d0c5" />
      </mesh>
      
      {/* Hair */}
      <mesh position={[0, legLength + torsoHeight + headRadius * 1.4 + 0.12, -0.01]}>
        <sphereGeometry args={[headRadius * 0.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2d1810" />
      </mesh>
      
      {/* Number label */}
      {number && (
        <Html
          position={[0, legLength + torsoHeight / 2 + 0.08, -0.08]}
          center
          style={{
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 'bold',
            textShadow: `0 0 4px ${teamColor}`,
            pointerEvents: 'none',
          }}
        >
          {number}
        </Html>
      )}
    </group>
  );
}

// Goal celebration effect
function GoalCelebration({ position, active }: { position: [number, number, number]; active: boolean }) {
  const particlesRef = useRef<THREE.Points>(null);
  
  const particles = useMemo(() => {
    const count = 100;
    const positions = new Float32Array(count * 3);
    const velocities: number[] = [];
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      velocities.push(
        (Math.random() - 0.5) * 0.3,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 0.3
      );
    }
    
    return { positions, velocities };
  }, []);
  
  useFrame((state) => {
    if (!particlesRef.current || !active) return;
    
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
    const time = state.clock.elapsedTime % 2;
    
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3] = particles.velocities[i * 3] * time * 5;
      positions[i * 3 + 1] = particles.velocities[i * 3 + 1] * time * 5 - time * time * 2;
      positions[i * 3 + 2] = particles.velocities[i * 3 + 2] * time * 5;
    }
    
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });
  
  if (!active) return null;
  
  return (
    <group position={position}>
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particles.positions.length / 3}
            array={particles.positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial 
          size={0.1} 
          color="#fbbf24" 
          transparent 
          opacity={0.8}
        />
      </points>
      
      {/* GOL! text */}
      <Text
        position={[0, 3, 0]}
        fontSize={2}
        color="#fbbf24"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.1}
        outlineColor="#000000"
      >
        GOL!
      </Text>
    </group>
  );
}

// Goal posts component
function GoalPost3D({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const postRadius = FIFA_FIELD.postDiameter / 2;
  const goalWidth = FIFA_FIELD.goalWidth;
  const goalHeight = FIFA_FIELD.goalHeight;
  const goalDepth = FIFA_FIELD.goalDepth;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Left post */}
      <mesh position={[0, goalHeight / 2, -goalWidth / 2]}>
        <cylinderGeometry args={[postRadius, postRadius, goalHeight, 16]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Right post */}
      <mesh position={[0, goalHeight / 2, goalWidth / 2]}>
        <cylinderGeometry args={[postRadius, postRadius, goalHeight, 16]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Crossbar */}
      <mesh position={[0, goalHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[postRadius, postRadius, goalWidth + postRadius * 2, 16]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Net */}
      <mesh position={[-goalDepth / 2, goalHeight / 2, 0]}>
        <boxGeometry args={[goalDepth, goalHeight, goalWidth]} />
        <meshStandardMaterial 
          color="#ffffff" 
          transparent 
          opacity={0.15} 
          side={THREE.BackSide}
          wireframe
        />
      </mesh>
    </group>
  );
}

// Field with FIFA proportions
function OfficialField3DScene({ 
  children,
  showGoalCelebration,
  goalPosition
}: { 
  children: React.ReactNode;
  showGoalCelebration: boolean;
  goalPosition: [number, number, number];
}) {
  const halfLength = FIELD_CALCULATIONS.halfLength;
  const halfWidth = FIELD_CALCULATIONS.halfWidth;

  return (
    <group>
      {/* Grass field */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[FIFA_FIELD.length + 10, FIFA_FIELD.width + 10]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>

      {/* Field stripes */}
      {Array.from({ length: 11 }).map((_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-halfLength + (i * 10) + 5, 0, 0]}
        >
          <planeGeometry args={[10, FIFA_FIELD.width]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#2d5a27' : '#347a2e'} />
        </mesh>
      ))}

      {/* Field lines */}
      {/* Outer boundary */}
      <Line
        points={[
          [-halfLength, 0.02, -halfWidth],
          [halfLength, 0.02, -halfWidth],
          [halfLength, 0.02, halfWidth],
          [-halfLength, 0.02, halfWidth],
          [-halfLength, 0.02, -halfWidth],
        ]}
        color="#ffffff"
        lineWidth={2}
      />

      {/* Center line */}
      <Line
        points={[
          [0, 0.02, -halfWidth],
          [0, 0.02, halfWidth],
        ]}
        color="#ffffff"
        lineWidth={2}
      />

      {/* Center circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[FIFA_FIELD.centerCircleRadius - 0.1, FIFA_FIELD.centerCircleRadius, 64]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Center spot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.15, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Penalty areas */}
      <Line
        points={[
          [-halfLength, 0.02, -FIFA_FIELD.penaltyAreaWidth / 2],
          [-halfLength + FIFA_FIELD.penaltyAreaDepth, 0.02, -FIFA_FIELD.penaltyAreaWidth / 2],
          [-halfLength + FIFA_FIELD.penaltyAreaDepth, 0.02, FIFA_FIELD.penaltyAreaWidth / 2],
          [-halfLength, 0.02, FIFA_FIELD.penaltyAreaWidth / 2],
        ]}
        color="#ffffff"
        lineWidth={2}
      />
      <Line
        points={[
          [halfLength, 0.02, -FIFA_FIELD.penaltyAreaWidth / 2],
          [halfLength - FIFA_FIELD.penaltyAreaDepth, 0.02, -FIFA_FIELD.penaltyAreaWidth / 2],
          [halfLength - FIFA_FIELD.penaltyAreaDepth, 0.02, FIFA_FIELD.penaltyAreaWidth / 2],
          [halfLength, 0.02, FIFA_FIELD.penaltyAreaWidth / 2],
        ]}
        color="#ffffff"
        lineWidth={2}
      />

      {/* Goal areas */}
      <Line
        points={[
          [-halfLength, 0.02, -FIFA_FIELD.goalAreaWidth / 2],
          [-halfLength + FIFA_FIELD.goalAreaDepth, 0.02, -FIFA_FIELD.goalAreaWidth / 2],
          [-halfLength + FIFA_FIELD.goalAreaDepth, 0.02, FIFA_FIELD.goalAreaWidth / 2],
          [-halfLength, 0.02, FIFA_FIELD.goalAreaWidth / 2],
        ]}
        color="#ffffff"
        lineWidth={2}
      />
      <Line
        points={[
          [halfLength, 0.02, -FIFA_FIELD.goalAreaWidth / 2],
          [halfLength - FIFA_FIELD.goalAreaDepth, 0.02, -FIFA_FIELD.goalAreaWidth / 2],
          [halfLength - FIFA_FIELD.goalAreaDepth, 0.02, FIFA_FIELD.goalAreaWidth / 2],
          [halfLength, 0.02, FIFA_FIELD.goalAreaWidth / 2],
        ]}
        color="#ffffff"
        lineWidth={2}
      />

      {/* Goals */}
      <GoalPost3D position={[-halfLength, 0, 0]} rotation={0} />
      <GoalPost3D position={[halfLength, 0, 0]} rotation={Math.PI} />

      {/* Goal celebration */}
      <GoalCelebration position={goalPosition} active={showGoalCelebration} />

      {children}
    </group>
  );
}

// Main animated scene with players and ball
function AnimatedPlayScene({
  frame,
  homeTeamColor,
  awayTeamColor,
  ballTrail,
  showGoalCelebration,
  goalPosition
}: {
  frame: PlayFrame;
  homeTeamColor: string;
  awayTeamColor: string;
  ballTrail: [number, number, number][];
  showGoalCelebration: boolean;
  goalPosition: [number, number, number];
}) {
  const ballPos = metersTo3D(frame.ball.x, frame.ball.y);
  
  return (
    <OfficialField3DScene showGoalCelebration={showGoalCelebration} goalPosition={goalPosition}>
      {/* Players */}
      {frame.players.map((player, idx) => {
        const pos = metersTo3D(player.x, player.y);
        return (
          <AnimatedPlayer3D
            key={player.id}
            position={pos}
            team={player.team}
            number={player.number}
            teamColor={player.team === 'home' ? homeTeamColor : awayTeamColor}
            isMoving={true}
          />
        );
      })}
      
      {/* Ball */}
      <AnimatedBall position={ballPos} trail={ballTrail} />
    </OfficialField3DScene>
  );
}

export function GoalPlayAnimation3D({
  frames,
  homeTeamColor = '#10b981',
  awayTeamColor = '#ef4444',
  homeTeamName = 'Casa',
  awayTeamName = 'Fora',
  goalMinute = 0,
  goalTeam = 'home',
  description = '',
  height = 500,
  onFrameChange
}: GoalPlayAnimation3DProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const totalFrames = frames.length;
  const currentData = frames[currentFrame] || frames[0];
  const showGoalCelebration = currentFrame >= totalFrames - 1;

  // Ball trail (last 10 positions)
  const ballTrail = useMemo(() => {
    return frames.slice(Math.max(0, currentFrame - 10), currentFrame + 1)
      .map(f => metersTo3D(f.ball.x, f.ball.y));
  }, [frames, currentFrame]);

  // Goal position for celebration
  const goalPosition = useMemo<[number, number, number]>(() => {
    const halfLength = FIELD_CALCULATIONS.halfLength;
    return goalTeam === 'home' ? [halfLength - 5, 0, 0] : [-halfLength + 5, 0, 0];
  }, [goalTeam]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || totalFrames === 0) return;

    const interval = setInterval(() => {
      setCurrentFrame(prev => {
        const next = prev + 1;
        if (next >= totalFrames) {
          setIsPlaying(false);
          return prev;
        }
        return next;
      });
    }, 100 / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, totalFrames, playbackSpeed]);

  // Notify parent of frame changes
  useEffect(() => {
    onFrameChange?.(currentFrame);
  }, [currentFrame, onFrameChange]);

  const handlePlayPause = useCallback(() => {
    if (currentFrame >= totalFrames - 1) {
      setCurrentFrame(0);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, currentFrame, totalFrames]);

  const handleReset = useCallback(() => {
    setCurrentFrame(0);
    setIsPlaying(false);
  }, []);

  const handleSeek = useCallback((value: number[]) => {
    setCurrentFrame(value[0]);
  }, []);

  const fallback = (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ height: `${height}px` }}>
      <OfficialFootballField theme="grass" className="w-full h-full" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
        <p className="text-white text-sm">Animação 3D indisponível</p>
      </div>
    </div>
  );

  if (!currentData) {
    return fallback;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge 
            variant="outline" 
            className="text-lg px-3 py-1"
            style={{ 
              borderColor: goalTeam === 'home' ? homeTeamColor : awayTeamColor,
              color: goalTeam === 'home' ? homeTeamColor : awayTeamColor
            }}
          >
            ⚽ {goalMinute}'
          </Badge>
          {description && (
            <span className="text-muted-foreground text-sm">{description}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Frame {currentFrame + 1} / {totalFrames}
          </Badge>
          <Badge variant="outline" className="text-xs">{playbackSpeed}x</Badge>
        </div>
      </div>

      {/* 3D Field with animation */}
      <WebGLWrapper 
        className="relative w-full rounded-xl overflow-hidden bg-gradient-to-b from-background/50 to-background border border-border"
        style={{ height: `${height}px` }}
        fallback={fallback}
      >
        {/* Team labels */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
          <div 
            className="w-4 h-4 rounded-full border-2 border-white/30"
            style={{ backgroundColor: homeTeamColor }}
          />
          <span className="text-sm font-medium text-white">{homeTeamName}</span>
        </div>
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
          <span className="text-sm font-medium text-white">{awayTeamName}</span>
          <div 
            className="w-4 h-4 rounded-full border-2 border-white/30"
            style={{ backgroundColor: awayTeamColor }}
          />
        </div>

        {/* Info */}
        <div className="absolute bottom-4 left-4 z-10 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/70">
          Campo FIFA • 105m × 68m
        </div>

        <Canvas
          camera={{ position: [0, 50, 50], fov: 45 }}
          shadows
          dpr={[1, 2]}
          style={{ width: '100%', height: '100%' }}
        >
          <color attach="background" args={['#0a0a0a']} />
          <fog attach="fog" args={['#0a0a0a', 80, 150]} />
          
          <ambientLight intensity={0.4} />
          <directionalLight position={[50, 50, 25]} intensity={1.5} castShadow />
          <directionalLight position={[-50, 30, -25]} intensity={0.5} />
          <pointLight position={[-60, 40, -40]} intensity={0.5} color="#fff5e6" />
          <pointLight position={[60, 40, -40]} intensity={0.5} color="#fff5e6" />
          <pointLight position={[-60, 40, 40]} intensity={0.5} color="#fff5e6" />
          <pointLight position={[60, 40, 40]} intensity={0.5} color="#fff5e6" />
          <hemisphereLight args={['#87ceeb', '#0d4a2a', 0.4]} />

          <AnimatedPlayScene
            frame={currentData}
            homeTeamColor={homeTeamColor}
            awayTeamColor={awayTeamColor}
            ballTrail={ballTrail}
            showGoalCelebration={showGoalCelebration}
            goalPosition={goalPosition}
          />

          <OrbitControls
            enablePan={false}
            minDistance={30}
            maxDistance={120}
            minPolarAngle={0.2}
            maxPolarAngle={Math.PI / 2.2}
            target={[0, 0, 0]}
          />
        </Canvas>
      </WebGLWrapper>

      {/* Controls */}
      <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border/50">
        {/* Playback buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleReset}
            disabled={currentFrame === 0}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentFrame(Math.max(0, currentFrame - 10))}
          >
            <Rewind className="h-4 w-4" />
          </Button>
          <Button
            variant="default"
            size="icon"
            onClick={handlePlayPause}
            className="bg-primary hover:bg-primary/90"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentFrame(Math.min(totalFrames - 1, currentFrame + 10))}
          >
            <FastForward className="h-4 w-4" />
          </Button>
        </div>

        {/* Timeline slider */}
        <div className="flex-1">
          <Slider
            value={[currentFrame]}
            min={0}
            max={Math.max(0, totalFrames - 1)}
            step={1}
            onValueChange={handleSeek}
            className="cursor-pointer"
          />
        </div>

        {/* Speed control */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">Velocidade:</span>
          <div className="flex gap-1">
            {[0.5, 1, 2].map(speed => (
              <Button
                key={speed}
                variant={playbackSpeed === speed ? "default" : "outline"}
                size="sm"
                onClick={() => setPlaybackSpeed(speed)}
                className="w-10 text-xs"
              >
                {speed}x
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Generate realistic goal play animation frames
export function generateGoalPlayFrames(goalTeam: 'home' | 'away' = 'home'): PlayFrame[] {
  const frames: PlayFrame[] = [];
  const numFrames = 60;
  
  // Home team attacks from left to right (towards away goal at x=105)
  // Away team attacks from right to left (towards home goal at x=0)
  
  const isHomeAttacking = goalTeam === 'home';
  const attackDirection = isHomeAttacking ? 1 : -1;
  
  // Starting positions for home team (attacking towards x=105)
  const homeBasePositions = [
    { id: 'h1', number: 1, x: 5, y: 34 },     // GK
    { id: 'h2', number: 4, x: 25, y: 15 },    // LB
    { id: 'h3', number: 5, x: 25, y: 34 },    // CB
    { id: 'h4', number: 6, x: 25, y: 53 },    // RB
    { id: 'h5', number: 8, x: 45, y: 20 },    // LM
    { id: 'h6', number: 10, x: 50, y: 34 },   // CAM
    { id: 'h7', number: 7, x: 45, y: 48 },    // RM
    { id: 'h8', number: 9, x: 70, y: 34 },    // ST
    { id: 'h9', number: 11, x: 65, y: 20 },   // LW
    { id: 'h10', number: 17, x: 65, y: 48 },  // RW
  ];
  
  // Away team positions (defending at x=105)
  const awayBasePositions = [
    { id: 'a1', number: 1, x: 100, y: 34 },   // GK
    { id: 'a2', number: 2, x: 88, y: 15 },    // LB
    { id: 'a3', number: 3, x: 85, y: 28 },    // CB
    { id: 'a4', number: 4, x: 85, y: 40 },    // CB
    { id: 'a5', number: 5, x: 88, y: 53 },    // RB
    { id: 'a6', number: 6, x: 75, y: 25 },    // LM
    { id: 'a7', number: 8, x: 70, y: 34 },    // CM
    { id: 'a8', number: 10, x: 75, y: 43 },   // RM
    { id: 'a9', number: 9, x: 55, y: 34 },    // ST
  ];
  
  for (let i = 0; i < numFrames; i++) {
    const progress = i / numFrames;
    
    // Ball trajectory - curved attack towards goal
    let ballX: number, ballY: number;
    
    if (isHomeAttacking) {
      // Home attacking towards away goal (x=105)
      ballX = 50 + progress * 52 + Math.sin(progress * Math.PI) * 8;
      ballY = 34 + Math.sin(progress * Math.PI * 2) * 12;
    } else {
      // Away attacking towards home goal (x=0)
      ballX = 55 - progress * 52 - Math.sin(progress * Math.PI) * 8;
      ballY = 34 + Math.sin(progress * Math.PI * 2) * 12;
    }
    
    // Clamp ball position
    ballX = Math.max(2, Math.min(103, ballX));
    ballY = Math.max(5, Math.min(63, ballY));
    
    // Animate players
    const players: PlayerPosition[] = [
      ...homeBasePositions.map(p => ({
        id: p.id,
        x: Math.max(2, Math.min(103, p.x + (isHomeAttacking ? progress * 12 : -progress * 5) + Math.sin(i * 0.2 + parseInt(p.id.slice(1))) * 2)),
        y: Math.max(5, Math.min(63, p.y + Math.cos(i * 0.15 + parseInt(p.id.slice(1))) * 2.5)),
        team: 'home' as const,
        number: p.number
      })),
      ...awayBasePositions.map(p => ({
        id: p.id,
        x: Math.max(2, Math.min(103, p.x + (!isHomeAttacking ? -progress * 12 : progress * 5) + Math.sin(i * 0.2 + parseInt(p.id.slice(1))) * 2)),
        y: Math.max(5, Math.min(63, p.y + Math.cos(i * 0.15 + parseInt(p.id.slice(1))) * 2.5)),
        team: 'away' as const,
        number: p.number
      }))
    ];
    
    frames.push({
      timestamp: i * 0.1,
      players,
      ball: { x: ballX, y: ballY }
    });
  }
  
  // Final frame - ball in goal
  const lastFrame = frames[frames.length - 1];
  lastFrame.ball = isHomeAttacking 
    ? { x: 104, y: 34 }   // In away goal
    : { x: 1, y: 34 };     // In home goal
  
  return frames;
}
