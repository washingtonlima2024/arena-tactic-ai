import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Maximize2, SkipBack, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeStorageUrl } from '@/lib/apiClient';
import { getApiBase } from '@/lib/apiMode';
import { getEventIcon } from '@/lib/eventLabels';

interface VideoEvent {
  id: string;
  event_type: string;
  minute: number | null;
  metadata?: Record<string, any> | null;
}

interface FuturisticVideoPlayerProps {
  videoUrl?: string | null;
  events: VideoEvent[];
  matchId?: string | null;
  onSeekToEvent?: (event: VideoEvent) => void;
  selectedEventId?: string | null;
}

const EVENT_COLORS: Record<string, string> = {
  goal: '#10b981',
  yellow_card: '#eab308',
  red_card: '#ef4444',
  penalty: '#8b5cf6',
  save: '#3b82f6',
  foul: '#f97316',
  corner: '#06b6d4',
  shot: '#ec4899',
};

export function FuturisticVideoPlayer({
  videoUrl, events, matchId, onSeekToEvent, selectedEventId
}: FuturisticVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Seek to selected event
  useEffect(() => {
    if (!selectedEventId) return;
    const event = events.find(e => e.id === selectedEventId);
    if (!event) return;
    const sec = event.metadata?.videoSecond ?? ((event.minute || 0) * 60);
    const v = videoRef.current;
    if (v && sec > 0) {
      v.currentTime = Math.max(0, sec - 5);
      v.play().catch(() => {});
    }
  }, [selectedEventId, events]);

  // Video listeners
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onDur = () => setDuration(v.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('durationchange', onDur); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); };
  }, []);

  const togglePlay = () => { const v = videoRef.current; if (!v) return; isPlaying ? v.pause() : v.play(); };
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !isMuted; setIsMuted(!isMuted); };
  const skip = (s: number) => { const v = videoRef.current; if (v) v.currentTime += s; };
  const seekTo = useCallback((t: number) => { const v = videoRef.current; if (v) { v.currentTime = t; v.play(); } }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Event markers on timeline
  const eventMarkers = events
    .filter(e => e.metadata?.videoSecond != null || e.minute != null)
    .map(e => {
      const sec = e.metadata?.videoSecond ?? ((e.minute || 0) * 60);
      const pct = duration > 0 ? (sec / duration) * 100 : 0;
      return { ...e, pct, sec };
    })
    .filter(e => e.pct >= 0 && e.pct <= 100);

  const resolvedUrl = videoUrl ? (videoUrl.startsWith('http') ? videoUrl : `${getApiBase()}${videoUrl}`) : null;

  return (
    <div className="space-y-2">
      {/* Video container */}
      <div className="relative rounded-xl overflow-hidden bg-black border border-primary/20 shadow-xl shadow-black/20">
        <div className="relative aspect-video">
          {resolvedUrl ? (
            <>
              <video
                ref={videoRef}
                src={resolvedUrl}
                className="w-full h-full object-contain cursor-pointer"
                onClick={togglePlay}
              />

              {/* Cinematic vignette overlay */}
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.35)_100%)]" />

              {/* Controls overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 md:p-4">
                {/* Controls row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-9 w-9" onClick={togglePlay}>
                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={() => skip(-10)}>
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={() => skip(10)}>
                      <SkipForward className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={toggleMute}>
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <span className="text-xs text-white/70 ml-2 font-mono">
                      {formatTime(currentTime)} / {formatTime(duration || 0)}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-9 w-9" onClick={() => videoRef.current?.requestFullscreen()}>
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <Play className="h-16 w-16 mb-4 opacity-30" />
              <p>Vídeo não disponível</p>
            </div>
          )}
        </div>
      </div>

      {/* Timeline with event markers - below the player */}
      {duration > 0 && (
        <div className="rounded-lg bg-card border border-border p-2.5">
          <div
            className="relative h-2 rounded-full bg-muted cursor-pointer group hover:h-3 transition-all"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              seekTo(pct * duration);
            }}
          >
            <div
              className="absolute top-0 left-0 h-full rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.5)] transition-all"
              style={{ width: `${progress}%` }}
            />
            {/* Playhead */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)] opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 8px)` }}
            />
            {/* Event dots */}
            {eventMarkers.map((em) => (
              <div
                key={em.id}
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white/50 cursor-pointer hover:scale-[2] transition-transform z-10"
                style={{
                  left: `${em.pct}%`,
                  backgroundColor: EVENT_COLORS[em.event_type] || '#9ca3af',
                  boxShadow: `0 0 6px ${EVENT_COLORS[em.event_type] || '#9ca3af'}80`,
                }}
                title={`${getEventIcon(em.event_type)} ${em.minute}'`}
                onClick={(e) => { e.stopPropagation(); seekTo(Math.max(0, em.sec - 5)); onSeekToEvent?.(em); }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}