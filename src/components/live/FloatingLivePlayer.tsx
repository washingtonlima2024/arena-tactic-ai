import { useRef, useState, useEffect, useCallback } from "react";
import { useLiveBroadcastContext } from "@/contexts/LiveBroadcastContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Maximize2, 
  Minimize2, 
  X, 
  Pause, 
  Play,
  Radio
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function FloatingLivePlayer() {
  const {
    isRecording,
    isPaused,
    recordingTime,
    matchInfo,
    currentScore,
    pauseRecording,
    resumeRecording,
    finishMatch,
  } = useLiveBroadcastContext();

  const [isMinimized, setIsMinimized] = useState(true);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  // Handle drag move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    
    // Keep within viewport
    const maxX = window.innerWidth - (containerRef.current?.offsetWidth || 200);
    const maxY = window.innerHeight - (containerRef.current?.offsetHeight || 100);
    
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    });
  }, [isDragging]);

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add/remove event listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Navigate to live page on double click - use window.location since we're outside Router
  const handleDoubleClick = () => {
    if (window.location.pathname !== '/live') {
      window.location.href = '/live';
    }
  };

  // Navigate to live page
  const goToLive = () => {
    window.location.href = '/live';
  };

  // Handle stop recording
  const handleStopClick = () => {
    setShowStopConfirm(true);
  };

  const handleConfirmStop = async () => {
    setShowStopConfirm(false);
    const result = await finishMatch();
    // Only navigate after finishMatch completes successfully
    if (result) {
      console.log('Match finished successfully:', result.matchId);
      // Use setTimeout to ensure all state updates are flushed
      setTimeout(() => {
        window.location.href = '/matches';
      }, 500);
    } else {
      console.error('Failed to finish match');
      window.location.href = '/matches';
    }
  };

  // Check if we're on live page using window.location
  const [isOnLivePage, setIsOnLivePage] = useState(false);
  
  useEffect(() => {
    const checkPath = () => {
      setIsOnLivePage(window.location.pathname === '/live');
    };
    
    checkPath();
    
    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', checkPath);
    
    // Periodic check for navigation
    const interval = setInterval(checkPath, 500);
    
    return () => {
      window.removeEventListener('popstate', checkPath);
      clearInterval(interval);
    };
  }, []);

  // Don't show if not recording or already on live page
  if (!isRecording) return null;
  if (isOnLivePage) return null;

  return (
    <>
      <div
        ref={containerRef}
        className={`fixed z-[9999] cursor-grab select-none transition-all duration-200 ${
          isDragging ? 'cursor-grabbing' : ''
        } ${isMinimized ? 'w-auto' : 'w-64'}`}
        style={{
          right: position.x,
          bottom: position.y,
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <div className="overflow-hidden rounded-xl border border-arena/30 bg-background/95 shadow-2xl backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-arena/20 to-arena-dark/20 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Radio className="h-4 w-4 text-destructive" />
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-destructive" />
              </div>
              <Badge variant="destructive" className="animate-pulse text-xs">
                AO VIVO
              </Badge>
              <span className="font-mono text-sm font-bold text-foreground">
                {formatTime(recordingTime)}
              </span>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? (
                  <Maximize2 className="h-3 w-3" />
                ) : (
                  <Minimize2 className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={handleStopClick}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Expanded content */}
          {!isMinimized && (
            <div className="space-y-2 p-3">
              {/* Teams and Score */}
              <div className="flex items-center justify-between text-sm">
                <span className="truncate font-medium">
                  {matchInfo.homeTeam || "Casa"}
                </span>
                <span className="mx-2 font-bold text-arena">
                  {currentScore.home} - {currentScore.away}
                </span>
                <span className="truncate font-medium">
                  {matchInfo.awayTeam || "Visitante"}
                </span>
              </div>

              {/* Controls */}
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => (isPaused ? resumeRecording() : pauseRecording())}
                  className="flex-1"
                >
                  {isPaused ? (
                    <>
                      <Play className="mr-1 h-3 w-3" />
                      Retomar
                    </>
                  ) : (
                    <>
                      <Pause className="mr-1 h-3 w-3" />
                      Pausar
                    </>
                  )}
                </Button>
                <Button
                  variant="arena"
                  size="sm"
                  onClick={goToLive}
                  className="flex-1"
                >
                  Ir para Live
                </Button>
              </div>

              {/* Status */}
              <p className="text-center text-xs text-muted-foreground">
                Clique duplo para expandir
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stop Confirmation Dialog */}
      <AlertDialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar transmissão?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá parar a gravação e salvar a partida. O vídeo e todos os 
              eventos serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmStop}>
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
