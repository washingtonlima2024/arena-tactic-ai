import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  Maximize2,
  Minimize2,
  RefreshCw,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { LiveEvent } from '@/contexts/LiveBroadcastContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface VideoChunk {
  blob: Blob;
  timestamp: number;
}

interface LiveEventReplayModalProps {
  event: LiveEvent | null;
  isOpen: boolean;
  onClose: () => void;
  getClipChunks: (startTime: number, endTime: number) => VideoChunk[];
}

const getEventIcon = (type: string) => {
  switch (type) {
    case "goal":
    case "goal_home":
    case "goal_away":
      return "⚽";
    case "yellow_card":
      return "🟨";
    case "red_card":
      return "🟥";
    case "shot":
      return "🎯";
    case "foul":
      return "⚠️";
    case "substitution":
      return "🔄";
    case "halftime":
      return "⏱️";
    default:
      return "📌";
  }
};

const getEventLabel = (type: string) => {
  switch (type) {
    case "goal":
      return "Gol";
    case "goal_home":
      return "Gol Casa";
    case "goal_away":
      return "Gol Fora";
    case "yellow_card":
      return "Cartão Amarelo";
    case "red_card":
      return "Cartão Vermelho";
    case "shot":
      return "Finalização";
    case "foul":
      return "Falta";
    case "substitution":
      return "Substituição";
    case "halftime":
      return "Intervalo";
    default:
      return type;
  }
};

const formatTimestamp = (seconds: number | undefined | null) => {
  if (seconds === undefined || seconds === null || isNaN(seconds)) return "0'00\"";
  const safeSeconds = Math.floor(Math.max(0, seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}'${secs.toString().padStart(2, '0')}"`;
};

export function LiveEventReplayModal({ 
  event, 
  isOpen, 
  onClose,
  getClipChunks 
}: LiveEventReplayModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Generate clip URL from chunks or use saved clip_url
  const generateClipUrl = useCallback(() => {
    if (!event) return null;

    // If clip is already saved, use it
    if (event.clipUrl) {
      console.log('[ReplayModal] Using saved clipUrl:', event.clipUrl);
      return event.clipUrl;
    }

    // Generate from chunks
    const eventTime = event.recordingTimestamp ?? 0;
    const startTime = Math.max(0, eventTime - 8); // 8 seconds before
    const endTime = eventTime + 7; // 7 seconds after (15s total)

    console.log('[ReplayModal] Getting chunks for time range:', startTime, '-', endTime);
    const chunks = getClipChunks(startTime, endTime);
    
    if (chunks.length === 0) {
      console.log('[ReplayModal] No chunks available for this time range');
      return null;
    }

    console.log('[ReplayModal] Found', chunks.length, 'chunks, creating blob URL');
    const blob = new Blob(chunks.map(c => c.blob), { type: 'video/webm' });
    return URL.createObjectURL(blob);
  }, [event, getClipChunks]);

  // Load video when modal opens
  useEffect(() => {
    if (isOpen && event) {
      setIsLoading(true);
      setError(null);
      setIsPlaying(false);
      setCurrentTime(0);
      
      const url = generateClipUrl();
      
      if (url) {
        setVideoUrl(url);
        setIsLoading(false);
      } else {
        setError('Nenhum chunk de vídeo disponível para este momento');
        setIsLoading(false);
      }
    }

    // Cleanup blob URL on close
    return () => {
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [isOpen, event, generateClipUrl]);

  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  const handleError = () => {
    setError('Erro ao carregar o vídeo');
    setIsLoading(false);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = async () => {
    if (videoRef.current) {
      if (!isFullscreen) {
        await videoRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleRetry = () => {
    setIsLoading(true);
    setError(null);
    const url = generateClipUrl();
    if (url) {
      setVideoUrl(url);
      setIsLoading(false);
    } else {
      setError('Nenhum chunk de vídeo disponível');
      setIsLoading(false);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-background/95 backdrop-blur-xl">
        <DialogHeader className="p-4 pb-0 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3">
            <span className="text-2xl">{getEventIcon(event.type)}</span>
            <div className="flex-1">
              <span className="font-bold">{getEventLabel(event.type)}</span>
              <span className="text-muted-foreground font-normal text-sm ml-2">
                {formatTimestamp(event.recordingTimestamp || 0)}
              </span>
            </div>
            {event.confidence && (
              <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary">
                {Math.round(event.confidence * 100)}% confiança
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Video Container */}
        <div className="aspect-video bg-black relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                <p className="text-white/70 text-sm">Carregando clip...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
              <div className="text-center p-6">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
                <p className="text-white font-medium mb-2">Clip não disponível</p>
                <p className="text-white/60 text-sm mb-4">{error}</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRetry}
                  className="border-white/30 text-white hover:bg-white/10"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar novamente
                </Button>
              </div>
            </div>
          )}

          {videoUrl && !error && (
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              onError={handleError}
              playsInline
            />
          )}

          {/* Video Controls Overlay */}
          {!isLoading && !error && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4">
              {/* Progress Bar */}
              <div className="mb-3">
                <Slider
                  value={[currentTime]}
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  onValueChange={handleSeek}
                  className="w-full"
                />
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-white hover:bg-white/20"
                    onClick={togglePlay}
                  >
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-white hover:bg-white/20"
                    onClick={toggleMute}
                  >
                    {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </Button>
                  <span className="text-white text-sm ml-2">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Badge 
                    variant={videoUrl?.startsWith('blob:') ? 'secondary' : 'default'}
                    className="text-xs"
                  >
                    {videoUrl?.startsWith('blob:') ? 'Em memória' : 'Salvo'}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-white hover:bg-white/20"
                    onClick={toggleFullscreen}
                  >
                    {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Event Details */}
        <div className="p-4 border-t border-border/50 bg-muted/20">
          <p className="text-sm text-foreground">{event.description}</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <span>Minuto {event.minute}:{event.second.toString().padStart(2, '0')}</span>
            {event.recordingTimestamp !== undefined && (
              <>
                <span>•</span>
                <span>Tempo de gravação: {formatTimestamp(event.recordingTimestamp)}</span>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
