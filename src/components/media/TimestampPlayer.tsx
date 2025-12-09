// Simple timestamp-based video player - plays original video from event timestamp
// No extraction needed - just seeks to the right time

import { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimestampPlayerProps {
  videoUrl: string;
  startTimeSeconds: number; // Where to start playback
  durationSeconds?: number; // How long to play (optional - if set, pauses at end)
  autoPlay?: boolean;
  className?: string;
  onEnded?: () => void;
  showControls?: boolean;
  eventMinute?: number;
}

export function TimestampPlayer({
  videoUrl,
  startTimeSeconds,
  durationSeconds,
  autoPlay = true,
  className,
  onEnded,
  showControls = true,
  eventMinute
}: TimestampPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPaused, setIsPaused] = useState(!autoPlay);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTimeSeconds);
  const [isReady, setIsReady] = useState(false);
  
  const endTimeSeconds = durationSeconds ? startTimeSeconds + durationSeconds : undefined;

  // Seek to start time when video loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      video.currentTime = startTimeSeconds;
      setIsReady(true);
      if (autoPlay) {
        video.play().catch(() => {});
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [startTimeSeconds, autoPlay]);

  // Check if we should stop at end time
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !endTimeSeconds) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      
      if (video.currentTime >= endTimeSeconds) {
        video.pause();
        setIsPaused(true);
        onEnded?.();
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [endTimeSeconds, onEnded]);

  // Sync play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isReady) return;

    if (isPaused) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [isPaused, isReady]);

  // Sync mute state
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = isMuted;
    }
  }, [isMuted]);

  const handleSeek = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newTime = Math.max(0, video.currentTime + delta);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const handleResetToStart = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = startTimeSeconds;
    setCurrentTime(startTimeSeconds);
    setIsPaused(false);
    video.play().catch(() => {});
  }, [startTimeSeconds]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className={cn("relative w-full h-full bg-black", className)}>
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-contain"
        muted={isMuted}
        playsInline
      />
      
      {showControls && (
        <>
          {/* Navigation controls */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 z-20">
            <Button 
              variant="ghost" 
              size="sm"
              className="text-white/80 hover:text-white hover:bg-white/10 gap-1"
              onClick={() => handleSeek(-3)}
            >
              <SkipBack className="h-4 w-4" />
              3s
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:bg-white/20"
              onClick={() => setIsPaused(p => !p)}
            >
              {isPaused ? (
                <Play className="h-5 w-5 fill-white" />
              ) : (
                <Pause className="h-5 w-5" />
              )}
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm"
              className="text-white/80 hover:text-white hover:bg-white/10 gap-1"
              onClick={() => handleSeek(3)}
            >
              3s
              <SkipForward className="h-4 w-4" />
            </Button>
            
            <div className="w-px h-6 bg-white/20" />
            
            <Button 
              variant="ghost" 
              size="sm"
              className="text-primary hover:text-primary hover:bg-primary/10 gap-1"
              onClick={handleResetToStart}
              title="Voltar ao início do evento"
            >
              <RotateCcw className="h-4 w-4" />
              Evento
            </Button>
            
            <div className="w-px h-6 bg-white/20" />
            
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          </div>
          
          {/* Time indicator */}
          <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
            <Badge variant="secondary" className="bg-black/70 text-white font-mono">
              {formatTime(currentTime)}
            </Badge>
            {eventMinute !== undefined && (
              <Badge variant="arena" className="bg-primary/80">
                {eventMinute}'
              </Badge>
            )}
          </div>
        </>
      )}
    </div>
  );
}
