import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  X, 
  Volume2, 
  VolumeX,
  Maximize,
  Minimize,
  FastForward,
  Repeat,
  ListVideo
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ClipVignette } from './ClipVignette';
import { TransitionVignette } from './TransitionVignette';
import { useVignetteAudio } from '@/hooks/useVignetteAudio';
import arenaPlayLogo from '@/assets/arena-play-icon.png';

interface PlaylistClip {
  id: string;
  title: string;
  type: string;
  minute: number;
  description?: string;
  thumbnail?: string;
  clipUrl?: string | null;
  videoUrl?: string;
  startTime?: number;
  endTime?: number;
}

interface PlaylistPlayerProps {
  clips: PlaylistClip[];
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  matchTitle?: string;
  includeVignettes?: boolean;
  onClose: () => void;
}

type PlaybackState = 
  | { type: 'idle' }
  | { type: 'opening' }
  | { type: 'clip'; index: number }
  | { type: 'transition'; nextIndex: number }
  | { type: 'closing' }
  | { type: 'complete' };

export function PlaylistPlayer({
  clips,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  matchTitle,
  includeVignettes = true,
  onClose
}: PlaylistPlayerProps) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>({ type: 'idle' });
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loop, setLoop] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [clipProgress, setClipProgress] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();
  const { initAudio } = useVignetteAudio();

  // Current clip being played
  const currentClipIndex = playbackState.type === 'clip' ? playbackState.index : -1;
  const currentClip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;
  const totalClips = clips.length;

  // Calculate overall progress
  const overallProgress = (() => {
    if (playbackState.type === 'idle') return 0;
    if (playbackState.type === 'opening') return 2;
    if (playbackState.type === 'clip') return 5 + (playbackState.index / totalClips) * 85 + (clipProgress / 100) * (85 / totalClips);
    if (playbackState.type === 'transition') return 5 + (playbackState.nextIndex / totalClips) * 85;
    if (playbackState.type === 'closing') return 95;
    return 100;
  })();

  // Start playback
  const startPlayback = useCallback(async () => {
    await initAudio();
    if (includeVignettes) {
      setPlaybackState({ type: 'opening' });
    } else if (clips.length > 0) {
      setPlaybackState({ type: 'clip', index: 0 });
    }
  }, [clips.length, includeVignettes, initAudio]);

  // Handle vignette completion
  const handleOpeningComplete = useCallback(() => {
    if (clips.length > 0) {
      setPlaybackState({ type: 'clip', index: 0 });
    } else {
      setPlaybackState({ type: 'complete' });
    }
  }, [clips.length]);

  // Handle clip end
  const handleClipEnd = useCallback(() => {
    if (playbackState.type !== 'clip') return;
    
    const nextIndex = playbackState.index + 1;
    
    if (nextIndex >= clips.length) {
      // All clips played
      if (includeVignettes) {
        setPlaybackState({ type: 'closing' });
      } else if (loop) {
        setPlaybackState({ type: 'clip', index: 0 });
      } else {
        setPlaybackState({ type: 'complete' });
      }
    } else {
      // More clips
      if (includeVignettes) {
        setPlaybackState({ type: 'transition', nextIndex });
      } else {
        setPlaybackState({ type: 'clip', index: nextIndex });
      }
    }
  }, [playbackState, clips.length, includeVignettes, loop]);

  // Handle transition complete
  const handleTransitionComplete = useCallback(() => {
    if (playbackState.type === 'transition') {
      setPlaybackState({ type: 'clip', index: playbackState.nextIndex });
    }
  }, [playbackState]);

  // Handle closing complete
  const handleClosingComplete = useCallback(() => {
    if (loop) {
      setPlaybackState({ type: 'opening' });
    } else {
      setPlaybackState({ type: 'complete' });
    }
  }, [loop]);

  // Skip current vignette
  const skipVignette = useCallback(() => {
    if (playbackState.type === 'opening') {
      handleOpeningComplete();
    } else if (playbackState.type === 'transition') {
      handleTransitionComplete();
    } else if (playbackState.type === 'closing') {
      handleClosingComplete();
    }
  }, [playbackState.type, handleOpeningComplete, handleTransitionComplete, handleClosingComplete]);

  // Navigate to specific clip
  const goToClip = useCallback((index: number) => {
    if (index >= 0 && index < clips.length) {
      setPlaybackState({ type: 'clip', index });
      setClipProgress(0);
    }
  }, [clips.length]);

  // Previous/Next
  const goToPrevious = useCallback(() => {
    if (currentClipIndex > 0) {
      goToClip(currentClipIndex - 1);
    }
  }, [currentClipIndex, goToClip]);

  const goToNext = useCallback(() => {
    if (currentClipIndex < clips.length - 1) {
      goToClip(currentClipIndex + 1);
    } else {
      handleClipEnd();
    }
  }, [currentClipIndex, clips.length, goToClip, handleClipEnd]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!isPaused && playbackState.type === 'clip') {
        setShowControls(false);
      }
    }, 3000);
  }, [isPaused, playbackState.type]);

  // Video time update
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration) {
        setClipProgress((video.currentTime / video.duration) * 100);
      }
    };

    const handleEnded = () => {
      handleClipEnd();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [handleClipEnd]);

  // Pause/play video sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPaused) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [isPaused]);

  // Mute sync
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = isMuted;
    }
  }, [isMuted]);

  // Start on mount
  useEffect(() => {
    startPlayback();
  }, [startPlayback]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          setIsPaused(p => !p);
          break;
        case 'ArrowRight':
          goToNext();
          break;
        case 'ArrowLeft':
          goToPrevious();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            onClose();
          }
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'm':
          setIsMuted(m => !m);
          break;
        case 's':
          skipVignette();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrevious, onClose, toggleFullscreen, skipVignette]);

  // Get video URL for current clip
  const getClipVideoUrl = (clip: PlaylistClip) => {
    return clip.clipUrl || clip.videoUrl;
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
    >
      {/* Main content area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Opening Vignette */}
        {playbackState.type === 'opening' && (
          <div className="absolute inset-0 z-20">
            <OpeningVignette
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              homeScore={homeScore}
              awayScore={awayScore}
              matchTitle={matchTitle}
              onComplete={handleOpeningComplete}
            />
          </div>
        )}

        {/* Transition Vignette */}
        {playbackState.type === 'transition' && clips[playbackState.nextIndex] && (
          <div className="absolute inset-0 z-20">
            <TransitionVignette
              nextClipTitle={clips[playbackState.nextIndex].title}
              nextClipMinute={clips[playbackState.nextIndex].minute}
              nextClipType={clips[playbackState.nextIndex].type}
              onComplete={handleTransitionComplete}
            />
          </div>
        )}

        {/* Closing Vignette */}
        {playbackState.type === 'closing' && (
          <div className="absolute inset-0 z-20">
            <ClosingVignette
              totalClips={totalClips}
              onComplete={handleClosingComplete}
            />
          </div>
        )}

        {/* Video Player */}
        {playbackState.type === 'clip' && currentClip && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            {/* Clip Vignette (before video) */}
            {includeVignettes && currentClip.thumbnail && clipProgress === 0 && (
              <ClipVignette
                thumbnailUrl={currentClip.thumbnail}
                eventType={currentClip.type}
                minute={currentClip.minute}
                title={currentClip.title}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                homeScore={homeScore}
                awayScore={awayScore}
                onComplete={() => {
                  // Start video after vignette
                  const video = videoRef.current;
                  if (video) {
                    video.currentTime = 0;
                    video.play().catch(() => {});
                  }
                }}
                duration={3000}
              />
            )}

            {/* Actual video */}
            {getClipVideoUrl(currentClip) ? (
              <video
                ref={videoRef}
                src={getClipVideoUrl(currentClip)!}
                className={cn(
                  "max-w-full max-h-full object-contain transition-opacity duration-500",
                  includeVignettes && currentClip.thumbnail && clipProgress === 0 ? "opacity-0" : "opacity-100"
                )}
                autoPlay={!includeVignettes || !currentClip.thumbnail}
                muted={isMuted}
                playsInline
              />
            ) : (
              // Fallback: show thumbnail as static image
              <div className="relative w-full h-full flex items-center justify-center">
                {currentClip.thumbnail ? (
                  <img 
                    src={currentClip.thumbnail} 
                    alt={currentClip.title}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <ListVideo className="h-16 w-16 mx-auto mb-4 text-primary" />
                    <p className="text-xl font-medium">{currentClip.title}</p>
                    <p className="text-sm mt-2">{currentClip.minute}' • {currentClip.type}</p>
                  </div>
                )}
                {/* Auto-advance after 5 seconds for static content */}
                <StaticClipTimer 
                  duration={5000} 
                  onComplete={handleClipEnd}
                  onProgress={setClipProgress}
                />
              </div>
            )}
          </div>
        )}

        {/* Complete screen */}
        {playbackState.type === 'complete' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background">
            <img src={arenaPlayLogo} alt="Arena Play" className="h-20 mb-6 opacity-80" />
            <h2 className="text-3xl font-bold text-foreground mb-2">Reprodução Completa</h2>
            <p className="text-muted-foreground mb-8">{totalClips} clips reproduzidos</p>
            <div className="flex gap-4">
              <Button variant="outline" size="lg" onClick={onClose}>
                <X className="h-5 w-5 mr-2" />
                Fechar
              </Button>
              <Button variant="arena" size="lg" onClick={() => {
                setPlaybackState({ type: 'idle' });
                startPlayback();
              }}>
                <Repeat className="h-5 w-5 mr-2" />
                Repetir
              </Button>
            </div>
          </div>
        )}

        {/* Skip vignette button */}
        {(playbackState.type === 'opening' || playbackState.type === 'transition' || playbackState.type === 'closing') && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "absolute bottom-24 right-4 z-30 text-white/80 hover:text-white transition-opacity duration-300",
              showControls ? "opacity-100" : "opacity-0"
            )}
            onClick={skipVignette}
          >
            <FastForward className="h-4 w-4 mr-2" />
            Pular
          </Button>
        )}
      </div>

      {/* Bottom controls */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 transition-opacity duration-300",
        showControls ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {/* Overall progress bar */}
        <div className="mb-4">
          <Progress value={overallProgress} className="h-1 bg-white/20" />
        </div>

        {/* Clip thumbnails timeline */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/20">
          {clips.map((clip, index) => (
            <button
              key={clip.id}
              onClick={() => goToClip(index)}
              className={cn(
                "relative flex-shrink-0 w-20 h-12 rounded overflow-hidden border-2 transition-all",
                index === currentClipIndex 
                  ? "border-primary scale-110 shadow-[0_0_20px_hsl(var(--primary)/0.5)]" 
                  : index < currentClipIndex 
                  ? "border-primary/50 opacity-60" 
                  : "border-white/20 opacity-40 hover:opacity-80"
              )}
            >
              {clip.thumbnail ? (
                <img src={clip.thumbnail} alt={clip.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <Play className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-white px-1 truncate">
                {clip.minute}'
              </div>
              {index === currentClipIndex && (
                <div className="absolute inset-0 border-2 border-primary animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between">
          {/* Left: Current clip info */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {currentClip && (
              <>
                <Badge variant="arena" className="flex-shrink-0">
                  {currentClipIndex + 1}/{totalClips}
                </Badge>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{currentClip.title}</p>
                  <p className="text-xs text-white/60">{currentClip.minute}' • {currentClip.type.replace(/_/g, ' ')}</p>
                </div>
              </>
            )}
          </div>

          {/* Center: Playback controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={goToPrevious}
              disabled={currentClipIndex <= 0}
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 text-white hover:bg-white/20"
              onClick={() => setIsPaused(p => !p)}
            >
              {isPaused ? (
                <Play className="h-8 w-8 fill-white" />
              ) : (
                <Pause className="h-8 w-8" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={goToNext}
              disabled={currentClipIndex >= clips.length - 1 && !loop}
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          {/* Right: Additional controls */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Button
              variant="ghost"
              size="icon"
              className={cn("text-white hover:bg-white/20", loop && "text-primary")}
              onClick={() => setLoop(l => !l)}
            >
              <Repeat className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => setIsMuted(m => !m)}
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Keyboard hints (shown briefly) */}
      <div className={cn(
        "absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 px-4 py-2 rounded-full text-xs text-white/60 transition-opacity",
        showControls ? "opacity-100" : "opacity-0"
      )}>
        <span className="mr-4">Espaço: Play/Pause</span>
        <span className="mr-4">←→: Navegar</span>
        <span className="mr-4">S: Pular vinheta</span>
        <span>F: Fullscreen</span>
      </div>
    </div>
  );
}

// Opening Vignette Component
function OpeningVignette({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  matchTitle,
  onComplete
}: {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  matchTitle?: string;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');
  const { playSwoosh, playImpact, initAudio } = useVignetteAudio();

  useEffect(() => {
    const playSound = async () => {
      await initAudio();
      await playSwoosh();
    };
    playSound();

    const enterTimer = setTimeout(() => setPhase('hold'), 500);
    const exitTimer = setTimeout(() => {
      setPhase('exit');
      playImpact();
    }, 3500);
    const completeTimer = setTimeout(onComplete, 4000);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete, playSwoosh, playImpact, initAudio]);

  return (
    <div className="relative w-full h-full bg-background overflow-hidden flex items-center justify-center">
      {/* Background animation */}
      <div className="absolute inset-0">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
            style={{
              top: `${5 + i * 5}%`,
              left: 0,
              right: 0,
              animation: `lineSlide ${1 + Math.random()}s ease-out ${i * 0.1}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Logo */}
      <div className={cn(
        "absolute top-8 left-1/2 -translate-x-1/2 transition-all duration-500",
        phase === 'hold' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'
      )}>
        <img src={arenaPlayLogo} alt="Arena Play" className="h-16" />
      </div>

      {/* Main content */}
      <div className={cn(
        "text-center transition-all duration-600",
        phase === 'enter' ? 'opacity-0 scale-90' :
        phase === 'hold' ? 'opacity-100 scale-100' :
        'opacity-0 scale-110'
      )}>
        <Badge variant="arena" className="mb-4 text-lg px-6 py-2 uppercase tracking-widest">
          Melhores Momentos
        </Badge>

        <h1 className="text-4xl font-black text-foreground mb-6">{matchTitle || 'Highlights'}</h1>

        <div className="flex items-center justify-center gap-8 text-2xl font-semibold">
          <span className="text-foreground">{homeTeam}</span>
          <div className="relative">
            <div className="absolute inset-0 blur-xl bg-primary/50 animate-pulse" />
            <span className="relative text-5xl font-black text-primary">
              {homeScore} - {awayScore}
            </span>
          </div>
          <span className="text-foreground">{awayTeam}</span>
        </div>
      </div>

      {/* Corner decorations */}
      <div className={cn(
        "absolute top-12 left-8 w-24 h-24 transition-all duration-700",
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      )}>
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary to-transparent" />
        <div className="absolute top-0 left-0 h-full w-0.5 bg-gradient-to-b from-primary to-transparent" />
      </div>
      <div className={cn(
        "absolute bottom-12 right-8 w-24 h-24 transition-all duration-700",
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      )}>
        <div className="absolute bottom-0 right-0 w-full h-0.5 bg-gradient-to-l from-primary to-transparent" />
        <div className="absolute bottom-0 right-0 h-full w-0.5 bg-gradient-to-t from-primary to-transparent" />
      </div>

      <style>{`
        @keyframes lineSlide {
          0% { transform: translateX(-100%); opacity: 0; }
          50% { opacity: 0.5; }
          100% { transform: translateX(100%); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// Closing Vignette Component
function ClosingVignette({
  totalClips,
  onComplete
}: {
  totalClips: number;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');
  const { playImpact, initAudio } = useVignetteAudio();

  useEffect(() => {
    const playSound = async () => {
      await initAudio();
      await playImpact();
    };
    playSound();

    const enterTimer = setTimeout(() => setPhase('hold'), 300);
    const exitTimer = setTimeout(() => setPhase('exit'), 2700);
    const completeTimer = setTimeout(onComplete, 3000);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete, playImpact, initAudio]);

  return (
    <div className="relative w-full h-full bg-background overflow-hidden flex items-center justify-center">
      {/* Radial burst */}
      <div className={cn(
        "absolute inset-0 transition-all duration-500",
        phase === 'hold' ? 'opacity-100' : 'opacity-0'
      )}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.3)_0%,transparent_70%)]" />
      </div>

      {/* Content */}
      <div className={cn(
        "text-center transition-all duration-500",
        phase === 'enter' ? 'opacity-0 scale-50' :
        phase === 'hold' ? 'opacity-100 scale-100' :
        'opacity-0 scale-150'
      )}>
        <img src={arenaPlayLogo} alt="Arena Play" className="h-24 mx-auto mb-4" />
        <p className="text-xl font-medium text-foreground">{totalClips} momentos incríveis</p>
        <p className="text-sm text-muted-foreground mt-2">Arena Play • Análise Tática Inteligente</p>
      </div>
    </div>
  );
}

// Static clip timer for thumbnails without video
function StaticClipTimer({
  duration,
  onComplete,
  onProgress
}: {
  duration: number;
  onComplete: () => void;
  onProgress: (progress: number) => void;
}) {
  useEffect(() => {
    const startTime = Date.now();
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      onProgress(progress);
      
      if (elapsed >= duration) {
        clearInterval(interval);
        onComplete();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [duration, onComplete, onProgress]);

  return null;
}
