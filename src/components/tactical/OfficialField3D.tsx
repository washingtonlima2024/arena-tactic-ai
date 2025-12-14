import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { FIFA_FIELD, FIELD_CALCULATIONS } from '@/constants/fieldDimensions';
import { cn } from '@/lib/utils';

interface OfficialField3DProps {
  className?: string;
  showMeasurements?: boolean;
  showGrid?: boolean;
  cameraPreset?: 'tactical' | 'tv' | 'corner' | 'goal';
  autoRotate?: boolean;
  children?: React.ReactNode;
}

// Field line component
function FieldLine({ points, color = '#ffffff' }: { points: [number, number, number][]; color?: string }) {
  return (
    <Line
      points={points}
      color={color}
      lineWidth={2}
    />
  );
}

// Arc component for circles and curved lines
function Arc({
  center,
  radius,
  startAngle,
  endAngle,
  segments = 32,
  color = '#ffffff',
}: {
  center: [number, number, number];
  radius: number;
  startAngle: number;
  endAngle: number;
  segments?: number;
  color?: string;
}) {
  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / segments);
      pts.push([
        center[0] + Math.cos(angle) * radius,
        center[1],
        center[2] + Math.sin(angle) * radius,
      ]);
    }
    return pts;
  }, [center, radius, startAngle, endAngle, segments]);

  return <FieldLine points={points} color={color} />;
}

// Goal posts and net
function Goal({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
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
        <cylinderGeometry args={[postRadius, postRadius, goalWidth, 16]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Net - back */}
      <mesh position={[-goalDepth / 2, goalHeight / 2, 0]}>
        <planeGeometry args={[goalDepth, goalHeight]} />
        <meshStandardMaterial 
          color="#ffffff" 
          transparent 
          opacity={0.3} 
          side={THREE.DoubleSide}
          wireframe
        />
      </mesh>

      {/* Net - top */}
      <mesh position={[-goalDepth / 2, goalHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[goalDepth, goalWidth]} />
        <meshStandardMaterial 
          color="#ffffff" 
          transparent 
          opacity={0.3} 
          side={THREE.DoubleSide}
          wireframe
        />
      </mesh>

      {/* Net - sides */}
      <mesh position={[-goalDepth / 2, goalHeight / 2, -goalWidth / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[goalDepth, goalHeight]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.2} side={THREE.DoubleSide} wireframe />
      </mesh>
      <mesh position={[-goalDepth / 2, goalHeight / 2, goalWidth / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[goalDepth, goalHeight]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.2} side={THREE.DoubleSide} wireframe />
      </mesh>
    </group>
  );
}

// Corner flag
function CornerFlag({ position }: { position: [number, number, number] }) {
  const flagRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (flagRef.current) {
      flagRef.current.rotation.y = Math.sin(clock.elapsedTime * 2) * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, FIFA_FIELD.cornerFlagHeight / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, FIFA_FIELD.cornerFlagHeight, 8]} />
        <meshStandardMaterial color="#ffff00" />
      </mesh>
      {/* Flag */}
      <mesh ref={flagRef} position={[0.15, FIFA_FIELD.cornerFlagHeight - 0.15, 0]}>
        <planeGeometry args={[0.3, 0.2]} />
        <meshStandardMaterial color="#ff0000" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// Main field component
function Field({ showMeasurements, showGrid }: { showMeasurements?: boolean; showGrid?: boolean }) {
  const halfLength = FIELD_CALCULATIONS.halfLength;
  const halfWidth = FIELD_CALCULATIONS.halfWidth;
  const lineColor = '#ffffff';

  return (
    <group>
      {/* Grass field */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
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

      {/* Outer boundary */}
      <FieldLine points={[
        [-halfLength, 0.02, -halfWidth],
        [halfLength, 0.02, -halfWidth],
        [halfLength, 0.02, halfWidth],
        [-halfLength, 0.02, halfWidth],
        [-halfLength, 0.02, -halfWidth],
      ]} color={lineColor} />

      {/* Center line */}
      <FieldLine points={[
        [0, 0.02, -halfWidth],
        [0, 0.02, halfWidth],
      ]} color={lineColor} />

      {/* Center circle */}
      <Arc
        center={[0, 0.02, 0]}
        radius={FIFA_FIELD.centerCircleRadius}
        startAngle={0}
        endAngle={Math.PI * 2}
        segments={64}
        color={lineColor}
      />

      {/* Center spot */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[FIFA_FIELD.centerSpotDiameter / 2, 16]} />
        <meshStandardMaterial color={lineColor} />
      </mesh>

      {/* LEFT SIDE */}
      {/* Left penalty area */}
      <FieldLine points={[
        [-halfLength, 0.02, -FIFA_FIELD.penaltyAreaWidth / 2],
        [-halfLength + FIFA_FIELD.penaltyAreaDepth, 0.02, -FIFA_FIELD.penaltyAreaWidth / 2],
        [-halfLength + FIFA_FIELD.penaltyAreaDepth, 0.02, FIFA_FIELD.penaltyAreaWidth / 2],
        [-halfLength, 0.02, FIFA_FIELD.penaltyAreaWidth / 2],
      ]} color={lineColor} />

      {/* Left goal area */}
      <FieldLine points={[
        [-halfLength, 0.02, -FIFA_FIELD.goalAreaWidth / 2],
        [-halfLength + FIFA_FIELD.goalAreaDepth, 0.02, -FIFA_FIELD.goalAreaWidth / 2],
        [-halfLength + FIFA_FIELD.goalAreaDepth, 0.02, FIFA_FIELD.goalAreaWidth / 2],
        [-halfLength, 0.02, FIFA_FIELD.goalAreaWidth / 2],
      ]} color={lineColor} />

      {/* Left penalty spot */}
      <mesh position={[-halfLength + FIFA_FIELD.penaltySpotDistance, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[FIFA_FIELD.penaltySpotDiameter / 2, 16]} />
        <meshStandardMaterial color={lineColor} />
      </mesh>

      {/* Left penalty arc */}
      <Arc
        center={[-halfLength + FIFA_FIELD.penaltySpotDistance, 0.02, 0]}
        radius={FIFA_FIELD.penaltyArcRadius}
        startAngle={-FIELD_CALCULATIONS.penaltyArcStartAngle}
        endAngle={FIELD_CALCULATIONS.penaltyArcStartAngle}
        segments={32}
        color={lineColor}
      />

      {/* Left corner arcs */}
      <Arc
        center={[-halfLength, 0.02, -halfWidth]}
        radius={FIFA_FIELD.cornerArcRadius}
        startAngle={0}
        endAngle={Math.PI / 2}
        segments={16}
        color={lineColor}
      />
      <Arc
        center={[-halfLength, 0.02, halfWidth]}
        radius={FIFA_FIELD.cornerArcRadius}
        startAngle={-Math.PI / 2}
        endAngle={0}
        segments={16}
        color={lineColor}
      />

      {/* RIGHT SIDE */}
      {/* Right penalty area */}
      <FieldLine points={[
        [halfLength, 0.02, -FIFA_FIELD.penaltyAreaWidth / 2],
        [halfLength - FIFA_FIELD.penaltyAreaDepth, 0.02, -FIFA_FIELD.penaltyAreaWidth / 2],
        [halfLength - FIFA_FIELD.penaltyAreaDepth, 0.02, FIFA_FIELD.penaltyAreaWidth / 2],
        [halfLength, 0.02, FIFA_FIELD.penaltyAreaWidth / 2],
      ]} color={lineColor} />

      {/* Right goal area */}
      <FieldLine points={[
        [halfLength, 0.02, -FIFA_FIELD.goalAreaWidth / 2],
        [halfLength - FIFA_FIELD.goalAreaDepth, 0.02, -FIFA_FIELD.goalAreaWidth / 2],
        [halfLength - FIFA_FIELD.goalAreaDepth, 0.02, FIFA_FIELD.goalAreaWidth / 2],
        [halfLength, 0.02, FIFA_FIELD.goalAreaWidth / 2],
      ]} color={lineColor} />

      {/* Right penalty spot */}
      <mesh position={[halfLength - FIFA_FIELD.penaltySpotDistance, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[FIFA_FIELD.penaltySpotDiameter / 2, 16]} />
        <meshStandardMaterial color={lineColor} />
      </mesh>

      {/* Right penalty arc */}
      <Arc
        center={[halfLength - FIFA_FIELD.penaltySpotDistance, 0.02, 0]}
        radius={FIFA_FIELD.penaltyArcRadius}
        startAngle={Math.PI - FIELD_CALCULATIONS.penaltyArcStartAngle}
        endAngle={Math.PI + FIELD_CALCULATIONS.penaltyArcStartAngle}
        segments={32}
        color={lineColor}
      />

      {/* Right corner arcs */}
      <Arc
        center={[halfLength, 0.02, -halfWidth]}
        radius={FIFA_FIELD.cornerArcRadius}
        startAngle={Math.PI / 2}
        endAngle={Math.PI}
        segments={16}
        color={lineColor}
      />
      <Arc
        center={[halfLength, 0.02, halfWidth]}
        radius={FIFA_FIELD.cornerArcRadius}
        startAngle={Math.PI}
        endAngle={Math.PI * 1.5}
        segments={16}
        color={lineColor}
      />

      {/* Goals */}
      <Goal position={[-halfLength, 0, 0]} rotation={0} />
      <Goal position={[halfLength, 0, 0]} rotation={Math.PI} />

      {/* Corner flags */}
      <CornerFlag position={[-halfLength, 0, -halfWidth]} />
      <CornerFlag position={[-halfLength, 0, halfWidth]} />
      <CornerFlag position={[halfLength, 0, -halfWidth]} />
      <CornerFlag position={[halfLength, 0, halfWidth]} />

      {/* Grid */}
      {showGrid && (
        <group>
          {Array.from({ length: 11 }).map((_, i) => (
            <FieldLine
              key={`v-${i}`}
              points={[
                [-halfLength + i * 10.5, 0.01, -halfWidth],
                [-halfLength + i * 10.5, 0.01, halfWidth],
              ]}
              color="#ffffff33"
            />
          ))}
          {Array.from({ length: 7 }).map((_, i) => (
            <FieldLine
              key={`h-${i}`}
              points={[
                [-halfLength, 0.01, -halfWidth + i * 11.33],
                [halfLength, 0.01, -halfWidth + i * 11.33],
              ]}
              color="#ffffff33"
            />
          ))}
        </group>
      )}

      {/* Measurements */}
      {showMeasurements && (
        <group>
          <Text
            position={[0, 0.5, -halfWidth - 3]}
            fontSize={2}
            color="#ffffff"
            anchorX="center"
          >
            105m
          </Text>
          <Text
            position={[-halfLength - 3, 0.5, 0]}
            fontSize={2}
            color="#ffffff"
            anchorX="center"
            rotation={[0, Math.PI / 2, 0]}
          >
            68m
          </Text>
          <Text
            position={[-halfLength + FIFA_FIELD.penaltyAreaDepth / 2, 0.5, FIFA_FIELD.penaltyAreaWidth / 2 + 2]}
            fontSize={1}
            color="#ffffff"
            anchorX="center"
          >
            16.5m
          </Text>
          <Text
            position={[-halfLength - 1, 0.5, 0]}
            fontSize={1}
            color="#ffffff"
            anchorX="center"
          >
            7.32m
          </Text>
        </group>
      )}
    </group>
  );
}

// Camera presets
const CAMERA_PRESETS = {
  tactical: { position: [0, 80, 0], target: [0, 0, 0] },
  tv: { position: [0, 30, 60], target: [0, 0, 0] },
  corner: { position: [-60, 20, -40], target: [0, 0, 0] },
  goal: { position: [-70, 10, 0], target: [0, 2, 0] },
};

export function OfficialField3D({
  className,
  showMeasurements = false,
  showGrid = false,
  cameraPreset = 'tactical',
  autoRotate = false,
  children,
}: OfficialField3DProps) {
  const preset = CAMERA_PRESETS[cameraPreset];

  return (
    <div className={cn("w-full h-[500px] rounded-xl overflow-hidden bg-muted/30", className)}>
      <Canvas shadows>
        <PerspectiveCamera
          makeDefault
          position={preset.position as [number, number, number]}
          fov={50}
        />
        <OrbitControls
          target={preset.target as [number, number, number]}
          autoRotate={autoRotate}
          autoRotateSpeed={0.5}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={20}
          maxDistance={150}
        />

        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[50, 50, 25]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <directionalLight position={[-50, 30, -25]} intensity={0.5} />

        {/* Stadium lights effect */}
        <pointLight position={[-60, 40, -40]} intensity={0.5} color="#fff5e6" />
        <pointLight position={[60, 40, -40]} intensity={0.5} color="#fff5e6" />
        <pointLight position={[-60, 40, 40]} intensity={0.5} color="#fff5e6" />
        <pointLight position={[60, 40, 40]} intensity={0.5} color="#fff5e6" />

        <Field showMeasurements={showMeasurements} showGrid={showGrid} />

        {children}
      </Canvas>

      {/* Info overlay */}
      <div className="absolute bottom-4 left-4 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs">
        <div className="font-semibold text-foreground">Campo FIFA Oficial</div>
        <div className="text-muted-foreground">105m × 68m • Escala 1:1</div>
      </div>
    </div>
  );
}
