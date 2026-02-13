import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Maximize2, SkipBack, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeStorageUrl } from '@/lib/apiClient';
import { getApiBase } from '@/lib/apiMode';
import { getEventIcon } from '@/lib/eventLabels';

interface SrtBlock {
  start: number;
  end: number;
  text: string;
}

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

function parseSrt(srt: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  const parts = srt.trim().split(/\n\n+/);
  for (const part of parts) {
    const lines = part.split('\n');
    if (lines.length < 3) continue;
    const timeMatch = lines[1]?.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!timeMatch) continue;
    const start = +timeMatch[1]*3600 + +timeMatch[2]*60 + +timeMatch[3] + +timeMatch[4]/1000;
    const end = +timeMatch[5]*3600 + +timeMatch[6]*60 + +timeMatch[7] + +timeMatch[8]/1000;
    const rawText = lines.slice(2).join(' ').replace(/<[^>]*>/g, '').trim();
    // Split long text into sentences and create sub-blocks with evenly distributed time
    const sentences = rawText.split(/(?<=[.!?])\s+/).filter(s => s.length > 0);
    if (sentences.length <= 1) {
      blocks.push({ start, end, text: rawText });
    } else {
      const duration = end - start;
      const sliceDur = duration / sentences.length;
      sentences.forEach((sentence, i) => {
        blocks.push({
          start: start + i * sliceDur,
          end: start + (i + 1) * sliceDur,
          text: sentence,
        });
      });
    }
  }
  return blocks;
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
  const [subtitle, setSubtitle] = useState('');
  const [srtBlocks, setSrtBlocks] = useState<SrtBlock[]>([]);

  // Fetch SRT
  useEffect(() => {
    if (!matchId) return;
    const fetchSrt = async () => {
      try {
        const apiBase = getApiBase();
        // Try first_half then full
        for (const type of ['first_half', 'second_half', 'full']) {
          try {
            const res = await fetch(`${apiBase}/api/storage/${matchId}/srt/${type}.srt`);
            if (res.ok) {
              const text = await res.text();
              const blocks = parseSrt(text);
              if (blocks.length > 0) {
                setSrtBlocks(prev => [...prev, ...blocks]);
              }
            }
          } catch { /* continue */ }
        }
      } catch { /* ignore */ }
    };
    fetchSrt();
  }, [matchId]);

  // Sync subtitle
  useEffect(() => {
    const block = srtBlocks.find(b => currentTime >= b.start && currentTime <= b.end);
    setSubtitle(block?.text || '');
  }, [currentTime, srtBlocks]);

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
    <div className="relative rounded-xl overflow-hidden bg-black border border-primary/20">
      <div className="relative aspect-video">
        {resolvedUrl ? (
          <>
            <video
              ref={videoRef}
              src={resolvedUrl}
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
            />

            {/* SRT Subtitle overlay */}
            {subtitle && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 max-w-[80%] pointer-events-none">
                <div className="bg-black/80 backdrop-blur-sm px-4 py-1.5 rounded-md">
                  <p className="text-white text-sm text-center leading-snug font-medium line-clamp-2">
                    {subtitle}
                  </p>
                </div>
              </div>
            )}

            {/* Controls overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 md:p-4">
              {/* Timeline with event markers */}
              <div
                className="relative h-2 mb-3 rounded-full bg-white/20 cursor-pointer group"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  seekTo(pct * duration);
                }}
              >
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
                {/* Playhead */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progress}% - 8px)` }}
                />
                {/* Event dots */}
                {eventMarkers.map((em) => (
                  <div
                    key={em.id}
                    className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-white/50 cursor-pointer hover:scale-150 transition-transform z-10"
                    style={{
                      left: `${em.pct}%`,
                      backgroundColor: EVENT_COLORS[em.event_type] || '#9ca3af',
                    }}
                    title={`${getEventIcon(em.event_type)} ${em.minute}'`}
                    onClick={(e) => { e.stopPropagation(); seekTo(Math.max(0, em.sec - 5)); onSeekToEvent?.(em); }}
                  />
                ))}
              </div>

              {/* Controls row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={togglePlay}>
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={() => skip(-10)}>
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={() => skip(10)}>
                    <SkipForward className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={toggleMute}>
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  <span className="text-xs text-white/70 ml-2 font-mono">
                    {formatTime(currentTime)} / {formatTime(duration || 0)}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={() => videoRef.current?.requestFullscreen()}>
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
  );
}
