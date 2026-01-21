import React, { useEffect, useState } from 'react';
import { Html, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PrePlayAnnouncementProps {
  goalMinute: number;
  scorerName?: string | null;
  teamName?: string;
  onComplete: () => void;
  isActive: boolean;
}

/**
 * Dramatic pre-play announcement overlay
 * Shows countdown and goal info before animation starts
 */
export function PrePlayAnnouncement({
  goalMinute,
  scorerName,
  teamName,
  onComplete,
  isActive
}: PrePlayAnnouncementProps) {
  const [phase, setPhase] = useState<'intro' | 'countdown' | 'go' | 'hidden'>('hidden');
  const [countdown, setCountdown] = useState(3);
  const [scale, setScale] = useState(0);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setPhase('hidden');
      setCountdown(3);
      setScale(0);
      setOpacity(0);
      return;
    }

    // Start intro phase
    setPhase('intro');
    setOpacity(1);
    setScale(0.5);

    // After 1.5s, start countdown
    const introTimer = setTimeout(() => {
      setPhase('countdown');
      setCountdown(3);
    }, 1500);

    return () => clearTimeout(introTimer);
  }, [isActive]);

  useEffect(() => {
    if (phase !== 'countdown') return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
        setScale(1.2);
        setTimeout(() => setScale(1), 150);
      }, 800);
      return () => clearTimeout(timer);
    } else {
      // Show "GO!" then complete
      setPhase('go');
      setTimeout(() => {
        setPhase('hidden');
        onComplete();
      }, 800);
    }
  }, [phase, countdown, onComplete]);

  // Animate scale
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (phase === 'intro') {
      setScale(0.8 + Math.sin(t * 4) * 0.1);
    } else if (phase === 'countdown') {
      // Pulse on countdown
    } else if (phase === 'go') {
      setScale(1.5);
    }
  });

  if (phase === 'hidden') return null;

  return (
    <group>
      {/* Dark overlay */}
      <mesh position={[0, 20, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Intro phase: Goal info */}
      {phase === 'intro' && (
        <group>
          <Text
            position={[0, 8, 0]}
            fontSize={3}
            color="#fbbf24"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.1}
            outlineColor="#000000"
            font="/fonts/Inter-Bold.woff"
          >
            ⚽ GOL
          </Text>
          
          <Text
            position={[0, 4, 0]}
            fontSize={1.5}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000000"
          >
            {goalMinute}'
          </Text>
          
          {scorerName && (
            <Text
              position={[0, 1, 0]}
              fontSize={2}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.08}
              outlineColor="#000000"
            >
              {scorerName}
            </Text>
          )}
          
          {teamName && (
            <Text
              position={[0, -2, 0]}
              fontSize={1.2}
              color="#a3a3a3"
              anchorX="center"
              anchorY="middle"
            >
              {teamName}
            </Text>
          )}
        </group>
      )}

      {/* Countdown phase */}
      {phase === 'countdown' && countdown > 0 && (
        <Text
          position={[0, 5, 0]}
          fontSize={8 * scale}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.2}
          outlineColor="#fbbf24"
        >
          {countdown}
        </Text>
      )}

      {/* GO! phase */}
      {phase === 'go' && (
        <Text
          position={[0, 5, 0]}
          fontSize={5}
          color="#22c55e"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.15}
          outlineColor="#000000"
        >
          ▶ PLAY!
        </Text>
      )}

      {/* Spotlight effect */}
      <spotLight
        position={[0, 30, 0]}
        angle={0.5}
        penumbra={0.5}
        intensity={phase === 'go' ? 3 : 1}
        color={phase === 'go' ? '#22c55e' : '#fbbf24'}
        castShadow
      />
    </group>
  );
}

export default PrePlayAnnouncement;
