import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Volume2, VolumeX, Maximize2, X, Sparkles } from 'lucide-react';
import { normalizeStorageUrl } from '@/lib/apiClient';
import { getApiBase } from '@/lib/apiMode';
import { getEventLabel, getEventIcon } from '@/lib/eventLabels';

interface ClipPlayerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clipUrl?: string | null;
  eventType: string;
  minute?: number | null;
  aiComment?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
}

export function ClipPlayerModal({
  open, onOpenChange, clipUrl, eventType, minute, aiComment, description, thumbnailUrl
}: ClipPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const resolvedUrl = clipUrl
    ? normalizeStorageUrl(clipUrl.startsWith('http') ? clipUrl : `${getApiBase()}${clipUrl}`)
    : null;

  useEffect(() => {
    if (!open) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [open]);

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
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [open]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    isPlaying ? v.pause() : v.play();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 bg-black border-border/30 overflow-hidden gap-0 [&>button]:hidden">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 z-50 text-white/70 hover:text-white hover:bg-white/10 rounded-full h-9 w-9"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Video area */}
        <div className="relative aspect-video bg-black">
          {resolvedUrl ? (
            <>
              <video
                ref={videoRef}
                src={resolvedUrl}
                className="w-full h-full object-contain cursor-pointer"
                onClick={togglePlay}
                poster={thumbnailUrl ? normalizeStorageUrl(thumbnailUrl) || undefined : undefined}
                autoPlay
              />

              {/* Cinematic vignette */}
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.4)_100%)]" />

              {/* Controls */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-3">
                {/* Progress bar */}
                <div
                  className="relative h-1.5 mb-3 rounded-full bg-white/20 cursor-pointer group hover:h-2.5 transition-all"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    const v = videoRef.current;
                    if (v) { v.currentTime = pct * duration; }
                  }}
                >
                  <div
                    className="absolute top-0 left-0 h-full rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ left: `calc(${progress}% - 8px)` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={togglePlay}>
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={toggleMute}>
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <span className="text-xs text-white/70 ml-2 font-mono">
                      {formatTime(currentTime)} / {formatTime(duration || 0)}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8"
                    onClick={() => videoRef.current?.requestFullscreen()}>
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Play className="h-16 w-16 opacity-30" />
            </div>
          )}
        </div>

        {/* Info bar */}
        <div className="p-4 md:p-5 bg-card border-t border-border/20 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getEventIcon(eventType)}</span>
            <span className="font-bold text-lg text-foreground">{getEventLabel(eventType)}</span>
            {minute != null && (
              <Badge variant="secondary" className="text-sm">{minute}'</Badge>
            )}
          </div>
          {aiComment && (
            <div className="flex items-start gap-2 mt-2">
              <Sparkles className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
              <p className="text-base text-muted-foreground leading-relaxed">{aiComment}</p>
            </div>
          )}
          {!aiComment && description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
