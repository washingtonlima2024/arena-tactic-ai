import React, { useState, useRef, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { WebGLWrapper } from '@/components/ui/WebGLWrapper';
import { OfficialFootballField } from '@/components/tactical/OfficialFootballField';
import { SoccerPlayerModel } from '@/components/tactical/SoccerPlayerModel';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  FastForward, 
  Rewind,
  Map,
  Target,
  Users,
  Loader2
} from 'lucide-react';
import { FIFA_FIELD, FIELD_CALCULATIONS } from '@/constants/fieldDimensions';

// ============= Types =============
export interface HeatZone {
  x: number;
  y: number;
  intensity: number;
  team: 'home' | 'away';
}

export interface Player {
  x: number;
  y: number;
  number: number;
  intensity?: number;
}

export interface PlayFrame {
  timestamp: number;
  ball: { x: number; y: number };
  players: Array<{
    id: string;
    x: number;
    y: number;
    team: 'home' | 'away';
    number?: number;
  }>;
}

export interface GoalEvent {
  id: string;
  minute: number;
  description?: string;
  team?: 'home' | 'away';
}

export interface TacticalField3DProps {
  // Team info
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamColor?: string;
  awayTeamColor?: string;
  
  // Mode
  defaultMode?: 'heatmap' | 'animation' | 'formation';
  
  // Heatmap data
  heatZones?: HeatZone[];
  homePlayers?: Player[];
  awayPlayers?: Player[];
  
  // Animation data
  animationFrames?: PlayFrame[];
  selectedGoal?: GoalEvent | null;
  
  // Options
  height?: number;
  editable?: boolean;
  isLoading?: boolean;
  detectionProgress?: number;
}

// ============= Coordinate conversion =============
function metersTo3D(x: number, y: number): [number, number, number] {
  const halfLength = FIELD_CALCULATIONS.halfLength;
  const halfWidth = FIELD_CALCULATIONS.halfWidth;
  return [
    (x / 105) * (halfLength * 2) - halfLength,
    0,
    (y / 68) * (halfWidth * 2) - halfWidth
  ];
}

function normalizedTo3D(x: number, y: number): [number, number, number] {
  return [(x / 100 - 0.5) * 10, 0, (y / 100 - 0.5) * 6];
}

// ============= Volumetric Heat Cloud =============
function VolumetricHeatCloud({ 
  position, 
  intensity, 
  isHot = true 
}: { 
  position: [number, number, number]; 
  intensity: number; 
  isHot?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Points>(null);
  
  const particles = useMemo(() => {
    const count = 30;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = Math.random() * 0.4 * intensity;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) + 0.15;
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return { positions };
  }, [intensity]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    if (cloudsRef.current) {
      cloudsRef.current.scale.setScalar(1 + Math.sin(time * 2) * 0.05);
    }
    if (particlesRef.current) {
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3 + 1] += Math.sin(time * 2 + i) * 0.001;
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  const coreColor = isHot ? "#ff3333" : "#ffffff";
  const midColor = isHot ? "#ff6600" : "#e8e8ff";
  const outerColor = isHot ? "#ff9933" : "#d0d0ff";
  const glowColor = isHot ? "#ff4400" : "#aaaaff";

  return (
    <group ref={groupRef} position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.9 * intensity, 32]} />
        <meshBasicMaterial 
          color={glowColor}
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <group ref={cloudsRef}>
        <mesh position={[0, 0.15 * intensity, 0]}>
          <sphereGeometry args={[0.25 * intensity, 16, 16]} />
          <meshBasicMaterial 
            color={coreColor}
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0.12 * intensity, 0]}>
          <sphereGeometry args={[0.55 * intensity, 10, 10]} />
          <meshBasicMaterial 
            color={outerColor}
            transparent
            opacity={0.08}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

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
          color={coreColor}
          size={0.04}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {isHot && (
        <mesh position={[0, 0.3 * intensity, 0]}>
          <cylinderGeometry args={[0.02, 0.2 * intensity, 0.5 * intensity, 8]} />
          <meshBasicMaterial 
            color="#ff6600"
            transparent
            opacity={0.12}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

// ============= Animated Ball =============
function AnimatedBall({ 
  position, 
  trail = [] 
}: { 
  position: [number, number, number]; 
  trail?: [number, number, number][];
}) {
  const ballRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (ballRef.current) {
      const time = state.clock.elapsedTime;
      ballRef.current.rotation.x += 0.08;
      ballRef.current.rotation.z += 0.04;
      ballRef.current.position.y = 0.15 + Math.abs(Math.sin(time * 5)) * 0.05;
    }
  });

  return (
    <group position={position}>
      {trail.length > 1 && (
        <Line
          points={trail}
          color="#ffffff"
          lineWidth={2}
          transparent
          opacity={0.3}
        />
      )}
      
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.15, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>
      
      <group ref={ballRef} position={[0, 0.15, 0]}>
        <mesh>
          <icosahedronGeometry args={[0.12, 2]} />
          <meshStandardMaterial 
            color="#ffffff"
            metalness={0.2}
            roughness={0.3}
          />
        </mesh>
        {[0, 72, 144, 216, 288].map((angle, i) => (
          <mesh 
            key={i} 
            position={[
              Math.cos(angle * Math.PI / 180) * 0.15,
              Math.sin(angle * Math.PI / 180) * 0.15,
              0.1
            ]}
          >
            <circleGeometry args={[0.04, 5]} />
            <meshBasicMaterial color="#000000" />
          </mesh>
        ))}
        <pointLight intensity={0.5} distance={2} color="#ffffff" />
      </group>
    </group>
  );
}

// ============= Goal Celebration =============
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

// ============= Goal Posts =============
function GoalPost3D({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const postRadius = FIFA_FIELD.postDiameter / 2;
  const goalWidth = FIFA_FIELD.goalWidth;
  const goalHeight = FIFA_FIELD.goalHeight;
  const goalDepth = FIFA_FIELD.goalDepth;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, goalHeight / 2, -goalWidth / 2]}>
        <cylinderGeometry args={[postRadius, postRadius, goalHeight, 16]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, goalHeight / 2, goalWidth / 2]}>
        <cylinderGeometry args={[postRadius, postRadius, goalHeight, 16]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, goalHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[postRadius, postRadius, goalWidth + postRadius * 2, 16]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>
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

// ============= FIFA Field Scene =============
function FIFAFieldScene({ 
  children,
  showGoalCelebration = false,
  goalPosition = [0, 0, 0] as [number, number, number]
}: { 
  children: React.ReactNode;
  showGoalCelebration?: boolean;
  goalPosition?: [number, number, number];
}) {
  const halfLength = FIELD_CALCULATIONS.halfLength;
  const halfWidth = FIELD_CALCULATIONS.halfWidth;

  return (
    <group>
      {/* Grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[FIFA_FIELD.length + 10, FIFA_FIELD.width + 10]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>

      {/* Stripes */}
      {Array.from({ length: 11 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-halfLength + (i * 10) + 5, 0, 0]}>
          <planeGeometry args={[10, FIFA_FIELD.width]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#2d5a27' : '#347a2e'} />
        </mesh>
      ))}

      {/* Field lines */}
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
        points={[[0, 0.02, -halfWidth], [0, 0.02, halfWidth]]}
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

      {/* Celebration */}
      <GoalCelebration position={goalPosition} active={showGoalCelebration} />

      {children}
    </group>
  );
}

// ============= Heatmap Scene =============
function HeatmapScene({
  heatZones,
  homePlayers,
  awayPlayers,
  homeColor,
  awayColor
}: {
  heatZones: HeatZone[];
  homePlayers: Player[];
  awayPlayers: Player[];
  homeColor: string;
  awayColor: string;
}) {
  return (
    <FIFAFieldScene>
      {/* Heat zones */}
      {heatZones.map((zone, idx) => (
        <VolumetricHeatCloud
          key={`zone-${idx}`}
          position={normalizedTo3D(zone.x, zone.y)}
          intensity={zone.intensity}
          isHot={zone.intensity > 0.6}
        />
      ))}

      {/* Home players */}
      {homePlayers.map((player, idx) => (
        <SoccerPlayerModel
          key={`home-${idx}`}
          position={normalizedTo3D(player.x, player.y)}
          number={player.number}
          team="home"
          teamColor={homeColor}
          intensity={player.intensity || 0.7}
          scale={0.004}
          showNumber={true}
          facingDirection="right"
        />
      ))}

      {/* Away players */}
      {awayPlayers.map((player, idx) => (
        <SoccerPlayerModel
          key={`away-${idx}`}
          position={normalizedTo3D(player.x, player.y)}
          number={player.number}
          team="away"
          teamColor={awayColor}
          intensity={player.intensity || 0.7}
          scale={0.004}
          showNumber={true}
          facingDirection="left"
        />
      ))}

      {/* Referee */}
      <SoccerPlayerModel
        position={[1.5, 0, 0]}
        team="referee"
        teamColor="#ffcc00"
        scale={0.004}
        showNumber={false}
        facingDirection="up"
      />
    </FIFAFieldScene>
  );
}

// ============= Animation Scene =============
function AnimationScene({
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
    <FIFAFieldScene showGoalCelebration={showGoalCelebration} goalPosition={goalPosition}>
      {frame.players.map((player, idx) => {
        const pos = metersTo3D(player.x, player.y);
        return (
          <SoccerPlayerModel
            key={player.id}
            position={pos}
            team={player.team}
            number={player.number}
            teamColor={player.team === 'home' ? homeTeamColor : awayTeamColor}
            isMoving={true}
            showNumber={true}
            scale={0.012}
          />
        );
      })}
      
      <AnimatedBall position={ballPos} trail={ballTrail} />
    </FIFAFieldScene>
  );
}

// ============= Main Component =============
export function TacticalField3D({
  homeTeamName = 'Time Casa',
  awayTeamName = 'Time Visitante',
  homeTeamColor = '#10b981',
  awayTeamColor = '#ef4444',
  defaultMode = 'heatmap',
  heatZones = [],
  homePlayers = [],
  awayPlayers = [],
  animationFrames = [],
  selectedGoal,
  height = 600,
  editable = false,
  isLoading = false,
  detectionProgress = 0
}: TacticalField3DProps) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<'heatmap' | 'animation' | 'formation'>(defaultMode);
  
  // Animation state
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const totalFrames = animationFrames.length;
  const currentData = animationFrames[currentFrame] || animationFrames[0];
  const showGoalCelebration = currentFrame >= totalFrames - 1 && totalFrames > 0;

  // Ball trail
  const ballTrail = useMemo(() => {
    return animationFrames.slice(Math.max(0, currentFrame - 10), currentFrame + 1)
      .map(f => metersTo3D(f.ball.x, f.ball.y));
  }, [animationFrames, currentFrame]);

  // Goal position for celebration
  const goalPosition = useMemo<[number, number, number]>(() => {
    const halfLength = FIELD_CALCULATIONS.halfLength;
    const team = selectedGoal?.team || 'home';
    return team === 'home' ? [halfLength - 5, 0, 0] : [-halfLength + 5, 0, 0];
  }, [selectedGoal?.team]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || totalFrames === 0 || mode !== 'animation') return;

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
  }, [isPlaying, totalFrames, playbackSpeed, mode]);

  // Reset frame when goal changes
  useEffect(() => {
    setCurrentFrame(0);
    setIsPlaying(false);
  }, [selectedGoal?.id]);

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

  // Mobile: show 2D fallback
  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Visualização Tática</h3>
          <Badge variant="secondary">2D</Badge>
        </div>
        <div className="rounded-xl overflow-hidden border border-border" style={{ height }}>
          <OfficialFootballField theme="grass" className="w-full h-full" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Visualização 3D disponível em desktop
        </p>
      </div>
    );
  }

  const hasAnimationData = animationFrames.length > 0;
  const hasHeatmapData = heatZones.length > 0 || homePlayers.length > 0;

  const fallback2D = (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ height }}>
      <OfficialFootballField theme="grass" className="w-full h-full" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
        <p className="text-white text-sm">3D indisponível</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Mode Tabs */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="heatmap" className="gap-2">
              <Map className="h-4 w-4" />
              Mapa de Calor
            </TabsTrigger>
            <TabsTrigger 
              value="animation" 
              className="gap-2"
              disabled={!hasAnimationData}
            >
              <Target className="h-4 w-4" />
              Animação
              {hasAnimationData && (
                <Badge variant="arena" className="ml-1 text-xs">
                  {animationFrames.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="formation" className="gap-2">
              <Users className="h-4 w-4" />
              Formação
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {mode === 'animation' && selectedGoal && (
              <Badge variant="outline" className="text-sm">
                ⚽ {selectedGoal.minute}' - {selectedGoal.description?.slice(0, 20) || 'Gol'}
              </Badge>
            )}
            <Badge variant="arena">Campo FIFA 105m × 68m</Badge>
          </div>
        </div>

        {/* Loading Progress */}
        {isLoading && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando frames...
              </span>
              <span className="text-primary font-medium">{Math.round(detectionProgress)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300" 
                style={{ width: `${detectionProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* 3D Canvas */}
        <WebGLWrapper 
          className="relative w-full rounded-xl overflow-hidden bg-gradient-to-b from-background/50 to-background border border-border"
          style={{ height }}
          fallback={fallback2D}
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

          <Canvas
            camera={{ position: [0, 50, 50], fov: 45 }}
            shadows
            dpr={[1, 1.5]}
            style={{ width: '100%', height: '100%' }}
          >
            <color attach="background" args={['#0a0a0a']} />
            <fog attach="fog" args={['#0a0a0a', 80, 150]} />
            
            <ambientLight intensity={0.4} />
            <directionalLight position={[50, 50, 25]} intensity={1.5} castShadow />
            <directionalLight position={[-50, 30, -25]} intensity={0.5} />
            <pointLight position={[-60, 40, -40]} intensity={0.5} color="#fff5e6" />
            <pointLight position={[60, 40, -40]} intensity={0.5} color="#fff5e6" />
            <hemisphereLight args={['#87ceeb', '#0d4a2a', 0.4]} />

            {mode === 'heatmap' && (
              <HeatmapScene
                heatZones={heatZones}
                homePlayers={homePlayers}
                awayPlayers={awayPlayers}
                homeColor={homeTeamColor}
                awayColor={awayTeamColor}
              />
            )}

            {mode === 'animation' && currentData && (
              <AnimationScene
                frame={currentData}
                homeTeamColor={homeTeamColor}
                awayTeamColor={awayTeamColor}
                ballTrail={ballTrail}
                showGoalCelebration={showGoalCelebration}
                goalPosition={goalPosition}
              />
            )}

            {mode === 'formation' && (
              <HeatmapScene
                heatZones={[]}
                homePlayers={homePlayers}
                awayPlayers={awayPlayers}
                homeColor={homeTeamColor}
                awayColor={awayTeamColor}
              />
            )}

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

        {/* Animation Controls */}
        {mode === 'animation' && hasAnimationData && (
          <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border/50">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handleReset} disabled={currentFrame === 0}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setCurrentFrame(Math.max(0, currentFrame - 10))}>
                <Rewind className="h-4 w-4" />
              </Button>
              <Button variant="default" size="icon" onClick={handlePlayPause} className="bg-primary hover:bg-primary/90">
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={() => setCurrentFrame(Math.min(totalFrames - 1, currentFrame + 10))}>
                <FastForward className="h-4 w-4" />
              </Button>
            </div>

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

            <Badge variant="secondary" className="text-xs">
              Frame {currentFrame + 1} / {totalFrames}
            </Badge>
          </div>
        )}

        {/* Hint */}
        <p className="text-center text-sm text-muted-foreground">
          Arraste para rotacionar • Scroll para zoom
        </p>
      </Tabs>
    </div>
  );
}

export default TacticalField3D;
