import { useState, useCallback } from 'react';
import { usePlayerDetection } from './usePlayerDetection';

interface PlayerPosition {
  id: string;
  x: number;
  y: number;
  team: 'home' | 'away';
  number?: number;
}

interface BallPosition {
  x: number;
  y: number;
}

interface PlayFrame {
  timestamp: number;
  players: PlayerPosition[];
  ball: BallPosition;
}

interface DetectionFrame {
  timestamp: number;
  players: Array<{
    id: string;
    x: number;
    y: number;
    team: 'home' | 'away' | 'unknown';
    confidence: number;
  }>;
  ball: { x: number; y: number; confidence: number } | null;
}

interface UseGoalDetectionOptions {
  framesPerSecond?: number;
  durationSeconds?: number;
  homeColor?: string;
  awayColor?: string;
}

export function useGoalDetection(options: UseGoalDetectionOptions = {}) {
  const { framesPerSecond = 5, durationSeconds = 6, homeColor, awayColor } = options;
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detectionFrames, setDetectionFrames] = useState<DetectionFrame[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { detectFromVideoElement } = usePlayerDetection({
    confidence: 0.3,
  });

  // Extract frames from video element around a specific time
  const extractFramesFromVideo = useCallback(async (
    videoElement: HTMLVideoElement,
    centerTimeSeconds: number
  ): Promise<PlayFrame[]> => {
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setDetectionFrames([]);

    const frames: PlayFrame[] = [];
    const detections: DetectionFrame[] = [];
    
    try {
      const startTime = Math.max(0, centerTimeSeconds - durationSeconds / 2);
      const endTime = Math.min(videoElement.duration, centerTimeSeconds + durationSeconds / 2);
      const frameInterval = 1 / framesPerSecond;
      const totalFrames = Math.ceil((endTime - startTime) * framesPerSecond);

      for (let i = 0; i < totalFrames; i++) {
        const frameTime = startTime + (i * frameInterval);
        
        // Seek to the frame time
        videoElement.currentTime = frameTime;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            videoElement.removeEventListener('seeked', onSeeked);
            resolve();
          };
          videoElement.addEventListener('seeked', onSeeked);
        });

        // Wait a small delay for the frame to render
        await new Promise(resolve => setTimeout(resolve, 50));

        // Detect players in this frame
        const result = await detectFromVideoElement(videoElement);
        
        if (result) {
          const detection: DetectionFrame = {
            timestamp: frameTime,
            players: result.players,
            ball: result.ball
          };
          detections.push(detection);
          
          // Convert to PlayFrame format
          const playFrame: PlayFrame = {
            timestamp: frameTime - startTime,
            players: result.players
              .filter(p => p.team !== 'unknown')
              .map((p, idx) => ({
                id: p.id,
                x: p.x,
                y: p.y,
                team: p.team as 'home' | 'away',
                number: idx + 1
              })),
            ball: result.ball 
              ? { x: result.ball.x, y: result.ball.y }
              : { x: 52.5, y: 34 } // Default center if no ball detected
          };
          frames.push(playFrame);
        }

        setProgress(((i + 1) / totalFrames) * 100);
      }

      setDetectionFrames(detections);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Frame extraction failed';
      setError(message);
      console.error('Error extracting frames:', err);
    } finally {
      setIsProcessing(false);
    }

    return frames;
  }, [framesPerSecond, durationSeconds, detectFromVideoElement]);

  // Generate interpolated frames for smooth animation
  const interpolateFrames = useCallback((
    detectedFrames: PlayFrame[],
    targetFps: number = 30
  ): PlayFrame[] => {
    if (detectedFrames.length < 2) return detectedFrames;

    const interpolated: PlayFrame[] = [];
    const frameInterval = 1 / targetFps;

    for (let i = 0; i < detectedFrames.length - 1; i++) {
      const current = detectedFrames[i];
      const next = detectedFrames[i + 1];
      const timeDiff = next.timestamp - current.timestamp;
      const steps = Math.ceil(timeDiff / frameInterval);

      for (let step = 0; step < steps; step++) {
        const t = step / steps;
        
        // Interpolate players
        const interpolatedPlayers: PlayerPosition[] = current.players.map((player) => {
          const nextPlayer = next.players.find(p => p.id === player.id);
          if (nextPlayer) {
            return {
              ...player,
              x: player.x + (nextPlayer.x - player.x) * t,
              y: player.y + (nextPlayer.y - player.y) * t,
            };
          }
          return player;
        });

        // Interpolate ball
        const interpolatedBall: BallPosition = {
          x: current.ball.x + (next.ball.x - current.ball.x) * t,
          y: current.ball.y + (next.ball.y - current.ball.y) * t,
        };

        interpolated.push({
          timestamp: current.timestamp + (timeDiff * t),
          players: interpolatedPlayers,
          ball: interpolatedBall,
        });
      }
    }

    // Add last frame
    interpolated.push(detectedFrames[detectedFrames.length - 1]);

    return interpolated;
  }, []);

  // Extract and process frames with interpolation
  const processGoalAnimation = useCallback(async (
    videoElement: HTMLVideoElement,
    goalTimeSeconds: number
  ): Promise<PlayFrame[]> => {
    const rawFrames = await extractFramesFromVideo(videoElement, goalTimeSeconds);
    
    if (rawFrames.length < 2) {
      return rawFrames;
    }

    // Interpolate for smoother animation
    return interpolateFrames(rawFrames, 30);
  }, [extractFramesFromVideo, interpolateFrames]);

  return {
    extractFramesFromVideo,
    processGoalAnimation,
    interpolateFrames,
    isProcessing,
    progress,
    detectionFrames,
    error,
  };
}
