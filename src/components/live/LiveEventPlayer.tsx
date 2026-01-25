import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Film,
  Video
} from 'lucide-react';
import { LiveEvent, VideoChunk } from '@/contexts/LiveBroadcastContext';
import { LiveEventReplayModal } from './LiveEventReplayModal';
import { getEventLabel, getEventIcon } from '@/lib/eventLabels';

interface LiveEventPlayerProps {
  events: LiveEvent[];
  videoElement: HTMLVideoElement | null;
  recordingTime: number;
  isRecording: boolean;
  getClipChunks: (startTime: number, endTime: number) => VideoChunk[];
}

export function LiveEventPlayer({
  events, 
  recordingTime,
  getClipChunks 
}: LiveEventPlayerProps) {
  const [selectedEvent, setSelectedEvent] = useState<LiveEvent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Sort events by time (most recent first) - handle undefined timestamps safely
  const sortedEvents = [...events]
    .filter(e => e && e.id) // Filter out invalid events
    .sort((a, b) => {
      const timestampA = a.recordingTimestamp ?? 0;
      const timestampB = b.recordingTimestamp ?? 0;
      return timestampB - timestampA;
    });

  // Handle event click - open modal to play clip
  const handleEventClick = (event: LiveEvent) => {
    console.log('[LiveEventPlayer] Event clicked:', event.type, event.recordingTimestamp);
    setSelectedEvent(event);
    setIsModalOpen(true);
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

  // Count events with clips available
  const eventsWithClips = sortedEvents.filter(e => e.clipUrl || e.recordingTimestamp !== undefined).length;

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
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Video className="h-3 w-3" />
              {eventsWithClips} clip{eventsWithClips !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>

        {/* Info Banner */}
        <div className="mb-3 p-2 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-xs text-primary">
            Clique em um evento para assistir o replay em tempo real
          </p>
        </div>

        {/* Events Timeline */}
        <ScrollArea className="h-[250px]">
          <div className="space-y-2 pr-2">
            {sortedEvents.map((event) => {
              const hasClip = event.clipUrl || event.recordingTimestamp !== undefined;
              
              return (
                <button
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  disabled={!hasClip}
                  className={`w-full p-3 rounded-lg border transition-all text-left hover:scale-[1.02] ${
                    hasClip
                      ? 'bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-primary/30 cursor-pointer'
                      : 'bg-muted/10 border-border/30 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{getEventIcon(event.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-sm">{getEventLabel(event.type)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(event.recordingTimestamp || 0)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {event.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge 
                        variant={event.clipUrl ? 'default' : 'secondary'} 
                        className="text-[10px] px-1.5"
                      >
                        {event.clipUrl ? 'Salvo' : 'Memória'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {getRelativeTime(event.recordingTimestamp || 0)}
                      </span>
                    </div>
                    {hasClip && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-primary hover:bg-primary/10 shrink-0"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Replay Modal */}
      <LiveEventReplayModal
        event={selectedEvent}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedEvent(null);
        }}
        getClipChunks={getClipChunks}
      />
    </>
  );
}
