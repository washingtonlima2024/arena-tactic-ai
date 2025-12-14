import { useState, useEffect, useCallback } from 'react';
import { OfficialFootballField } from './OfficialFootballField';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, FastForward, Rewind } from 'lucide-react';
import { FIFA_FIELD, metersToSvg } from '@/constants/fieldDimensions';

interface PlayerPosition {
  id: string;
  x: number; // in meters
  y: number; // in meters
  team: 'home' | 'away';
  number?: number;
}

interface BallPosition {
  x: number;
  y: number;
}

interface PlayFrame {
  timestamp: number; // in seconds
  players: PlayerPosition[];
  ball: BallPosition;
}

interface GoalPlayAnimationProps {
  frames: PlayFrame[];
  homeTeamColor?: string;
  awayTeamColor?: string;
  goalMinute?: number;
  goalTeam?: 'home' | 'away';
  description?: string;
  onFrameChange?: (frameIndex: number) => void;
}

export function GoalPlayAnimation({
  frames,
  homeTeamColor = '#10b981',
  awayTeamColor = '#ef4444',
  goalMinute = 0,
  goalTeam = 'home',
  description = '',
  onFrameChange
}: GoalPlayAnimationProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const totalFrames = frames.length;
  const currentData = frames[currentFrame] || frames[0];

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
    }, 100 / playbackSpeed); // 10 FPS base, adjusted by speed

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

  // Render players and ball as SVG overlay
  const renderOverlay = () => {
    if (!currentData) return null;

    const ballX = metersToSvg(currentData.ball.x);
    const ballY = metersToSvg(currentData.ball.y);

    return (
      <g>
        {/* Ball trail (last 5 positions) */}
        {frames.slice(Math.max(0, currentFrame - 5), currentFrame).map((frame, i) => {
          const trailX = metersToSvg(frame.ball.x);
          const trailY = metersToSvg(frame.ball.y);
          const opacity = (i + 1) / 6;
          return (
            <circle
              key={`trail-${i}`}
              cx={trailX}
              cy={trailY}
              r={4}
              fill={`rgba(255, 255, 255, ${opacity * 0.5})`}
            />
          );
        })}

        {/* Players */}
        {currentData.players.map((player) => {
          const px = metersToSvg(player.x);
          const py = metersToSvg(player.y);
          const color = player.team === 'home' ? homeTeamColor : awayTeamColor;

          return (
            <g key={player.id}>
              {/* Player glow */}
              <circle
                cx={px}
                cy={py}
                r={18}
                fill={color}
                opacity={0.3}
                className="animate-pulse"
              />
              {/* Player body */}
              <circle
                cx={px}
                cy={py}
                r={12}
                fill={color}
                stroke="#ffffff"
                strokeWidth={2}
              />
              {/* Player number */}
              {player.number && (
                <text
                  x={px}
                  y={py + 4}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="bold"
                >
                  {player.number}
                </text>
              )}
            </g>
          );
        })}

        {/* Ball */}
        <g>
          <circle
            cx={ballX}
            cy={ballY}
            r={10}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1}
          />
          {/* Ball pattern */}
          <circle
            cx={ballX - 2}
            cy={ballY - 2}
            r={3}
            fill="#000000"
          />
          <circle
            cx={ballX + 3}
            cy={ballY + 1}
            r={2}
            fill="#000000"
          />
        </g>

        {/* Goal indicator when at last frame */}
        {currentFrame === totalFrames - 1 && (
          <g>
            <text
              x={metersToSvg(FIFA_FIELD.length / 2)}
              y={metersToSvg(FIFA_FIELD.width / 2) - 50}
              textAnchor="middle"
              fill="#fbbf24"
              fontSize="48"
              fontWeight="bold"
              className="animate-bounce"
              style={{ textShadow: '0 0 20px rgba(251, 191, 36, 0.8)' }}
            >
              GOL!
            </text>
          </g>
        )}
      </g>
    );
  };

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
            <span className="text-muted-foreground">{description}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            Frame {currentFrame + 1} / {totalFrames}
          </Badge>
          <Badge variant="outline">{playbackSpeed}x</Badge>
        </div>
      </div>

      {/* Field with animation */}
      <div className="rounded-lg overflow-hidden border border-border/50">
        <OfficialFootballField
          theme="grass"
          showMeasurements={false}
          showGrid={false}
        >
          {renderOverlay()}
        </OfficialFootballField>
      </div>

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
          <span className="text-sm text-muted-foreground">Velocidade:</span>
          <div className="flex gap-1">
            {[0.5, 1, 2].map(speed => (
              <Button
                key={speed}
                variant={playbackSpeed === speed ? "default" : "outline"}
                size="sm"
                onClick={() => setPlaybackSpeed(speed)}
                className="w-12"
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

// Generate mock goal play data for demonstration
export function generateMockGoalPlay(goalTeam: 'home' | 'away' = 'home'): PlayFrame[] {
  const frames: PlayFrame[] = [];
  const numFrames = 50;

  // Starting positions
  const homePlayers = [
    { id: 'h1', number: 1, baseX: 5, baseY: 34 },    // GK
    { id: 'h2', number: 4, baseX: 20, baseY: 15 },   // DEF
    { id: 'h3', number: 5, baseX: 20, baseY: 34 },   // DEF
    { id: 'h4', number: 6, baseX: 20, baseY: 53 },   // DEF
    { id: 'h5', number: 8, baseX: 40, baseY: 20 },   // MID
    { id: 'h6', number: 10, baseX: 45, baseY: 34 },  // MID
    { id: 'h7', number: 7, baseX: 40, baseY: 48 },   // MID
    { id: 'h8', number: 9, baseX: 70, baseY: 34 },   // FWD
    { id: 'h9', number: 11, baseX: 65, baseY: 20 },  // FWD
    { id: 'h10', number: 17, baseX: 65, baseY: 48 }, // FWD
  ];

  const awayPlayers = [
    { id: 'a1', number: 1, baseX: 100, baseY: 34 },  // GK
    { id: 'a2', number: 2, baseX: 85, baseY: 15 },   // DEF
    { id: 'a3', number: 3, baseX: 85, baseY: 28 },   // DEF
    { id: 'a4', number: 4, baseX: 85, baseY: 40 },   // DEF
    { id: 'a5', number: 5, baseX: 85, baseY: 53 },   // DEF
    { id: 'a6', number: 6, baseX: 70, baseY: 20 },   // MID
    { id: 'a7', number: 8, baseX: 65, baseY: 34 },   // MID
    { id: 'a8', number: 10, baseX: 70, baseY: 48 },  // MID
    { id: 'a9', number: 9, baseX: 50, baseY: 34 },   // FWD
  ];

  // Simulate goal play animation
  for (let i = 0; i < numFrames; i++) {
    const progress = i / numFrames;

    // Ball trajectory - curved path towards goal
    const ballX = goalTeam === 'home' 
      ? 45 + progress * 55 + Math.sin(progress * Math.PI) * 10
      : 60 - progress * 55 - Math.sin(progress * Math.PI) * 10;
    const ballY = 34 + Math.sin(progress * Math.PI * 2) * 15;

    // Animate players
    const players: PlayerPosition[] = [
      ...homePlayers.map(p => ({
        id: p.id,
        x: p.baseX + (goalTeam === 'home' ? progress * 15 : -progress * 5) + Math.sin(i * 0.3 + parseInt(p.id.slice(1))) * 2,
        y: p.baseY + Math.cos(i * 0.2 + parseInt(p.id.slice(1))) * 3,
        team: 'home' as const,
        number: p.number
      })),
      ...awayPlayers.map(p => ({
        id: p.id,
        x: p.baseX + (goalTeam === 'away' ? -progress * 15 : progress * 5) + Math.sin(i * 0.3 + parseInt(p.id.slice(1))) * 2,
        y: p.baseY + Math.cos(i * 0.2 + parseInt(p.id.slice(1))) * 3,
        team: 'away' as const,
        number: p.number
      }))
    ];

    frames.push({
      timestamp: i * 0.1,
      players,
      ball: { x: Math.max(0, Math.min(105, ballX)), y: Math.max(0, Math.min(68, ballY)) }
    });
  }

  // Last frame - ball in goal
  const lastFrame = frames[frames.length - 1];
  lastFrame.ball = goalTeam === 'home' 
    ? { x: 103, y: 34 }  // In away goal
    : { x: 2, y: 34 };    // In home goal

  return frames;
}
