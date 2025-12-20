import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Maximize2,
  X,
  Film
} from 'lucide-react';
import { LiveEvent } from '@/hooks/useLiveBroadcast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LiveEventPlayerProps {
  events: LiveEvent[];
  videoElement: HTMLVideoElement | null;
  recordingTime: number;
  isRecording: boolean;
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

export function LiveEventPlayer({ 
  events, 
  videoElement, 
  recordingTime,
  isRecording 
}: LiveEventPlayerProps) {
  const [selectedEvent, setSelectedEvent] = useState<LiveEvent | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const playerRef = useRef<HTMLVideoElement>(null);
  const clipVideoRef = useRef<HTMLVideoElement>(null);

  // Sort events by time (most recent first) - handle undefined timestamps safely
  const sortedEvents = [...events]
    .filter(e => e && e.id) // Filter out invalid events
    .sort((a, b) => {
      const timestampA = a.recordingTimestamp ?? 0;
      const timestampB = b.recordingTimestamp ?? 0;
      return timestampB - timestampA;
    });

  // Handle event click - seek video to that timestamp
  const handleEventClick = (event: LiveEvent) => {
    try {
      setSelectedEvent(event);
      
      if (videoElement && event.recordingTimestamp !== undefined && event.recordingTimestamp !== null) {
        // Calculate the offset - go back 5 seconds before the event
        const seekTime = Math.max(0, event.recordingTimestamp - 5);
        
        // If the video is a live stream, we can't seek
        // But if it's a recorded video element, we might be able to
        if (videoElement.duration && !isNaN(videoElement.duration) && isFinite(videoElement.duration)) {
          videoElement.currentTime = Math.min(seekTime, videoElement.duration);
          videoElement.play().catch(err => console.warn('Não foi possível reproduzir:', err));
        }
      }
    } catch (error) {
      console.warn('Erro ao selecionar evento:', error);
    }
  };

  // Format timestamp for display
  const formatTimestamp = (seconds: number | undefined | null) => {
    if (seconds === undefined || seconds === null || isNaN(seconds)) return "0'00\"";
    const safeSeconds = Math.floor(Math.max(0, seconds));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}'${secs.toString().padStart(2, '0')}"`;
  };

  // Calculate relative time from now
  const getRelativeTime = (eventTimestamp: number | undefined | null) => {
    if (eventTimestamp === undefined || eventTimestamp === null || isNaN(eventTimestamp)) return '';
    const diff = Math.max(0, recordingTime - eventTimestamp);
    if (diff < 60) return `há ${Math.floor(diff)}s`;
    if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
    return `há ${Math.floor(diff / 3600)}h`;
  };

  if (events.length === 0) {
    return null;
  }

  return (
    <>
      <div className="glass-card p-4 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2 text-foreground">
            <Film className="h-5 w-5 text-primary" />
            Replay de Eventos
          </h3>
          <Badge variant="outline" className="text-xs">
            {events.length} clip{events.length !== 1 ? 's' : ''}
          </Badge>
        </div>

        {/* Mini Player */}
        {selectedEvent && (
          <div className="mb-4 rounded-lg overflow-hidden bg-black/50 aspect-video relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <span className="text-4xl mb-2 block">{getEventIcon(selectedEvent.type)}</span>
                <p className="text-white font-semibold">{getEventLabel(selectedEvent.type)}</p>
                <p className="text-white/70 text-sm">
                  {formatTimestamp(selectedEvent.recordingTimestamp || 0)}
                </p>
                <p className="text-white/50 text-xs mt-1">{selectedEvent.description}</p>
              </div>
            </div>

            {/* Controls Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => {
                      const idx = sortedEvents.findIndex(e => e.id === selectedEvent.id);
                      if (idx < sortedEvents.length - 1) {
                        handleEventClick(sortedEvents[idx + 1]);
                      }
                    }}
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => {
                      const idx = sortedEvents.findIndex(e => e.id === selectedEvent.id);
                      if (idx > 0) {
                        handleEventClick(sortedEvents[idx - 1]);
                      }
                    }}
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => setShowFullscreen(true)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Close button */}
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-2 right-2 h-6 w-6 text-white hover:bg-white/20"
              onClick={() => setSelectedEvent(null)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Events Timeline */}
        <ScrollArea className="h-[200px]">
          <div className="space-y-2 pr-2">
            {sortedEvents.map((event, index) => (
              <button
                key={event.id}
                onClick={() => handleEventClick(event)}
                className={`w-full p-2 rounded-lg border transition-all text-left hover:scale-[1.02] ${
                  selectedEvent?.id === event.id
                    ? 'bg-primary/20 border-primary/50 ring-1 ring-primary/30'
                    : 'bg-muted/30 border-border/50 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getEventIcon(event.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{getEventLabel(event.type)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(event.recordingTimestamp || 0)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {event.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-[10px] px-1.5">
                      {getRelativeTime(event.recordingTimestamp || 0)}
                    </Badge>
                    <Play className="h-3 w-3 text-primary" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={showFullscreen} onOpenChange={setShowFullscreen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{selectedEvent && getEventIcon(selectedEvent.type)}</span>
              {selectedEvent && getEventLabel(selectedEvent.type)}
              <span className="text-muted-foreground font-normal text-sm">
                {selectedEvent && formatTimestamp(selectedEvent.recordingTimestamp || 0)}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="aspect-video bg-black flex items-center justify-center">
            {selectedEvent && (
              <div className="text-center">
                <span className="text-6xl mb-4 block">{getEventIcon(selectedEvent.type)}</span>
                <p className="text-white text-xl font-semibold">{getEventLabel(selectedEvent.type)}</p>
                <p className="text-white/70 mt-2">{selectedEvent.description}</p>
                <p className="text-white/50 text-sm mt-4">
                  Clique no vídeo principal para ver o replay
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
