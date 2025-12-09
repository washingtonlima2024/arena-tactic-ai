import { useRef, useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Clock, Maximize2, Volume2, VolumeX, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { ClipVignette } from './ClipVignette';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: {
    id: string;
    title: string;
    type: string;
    minute: number;
    second?: number;
    description: string;
    clipUrl?: string | null;
    videoSecond?: number; // Real timestamp in the video file (in seconds)
  } | null;
  thumbnail?: {
    imageUrl: string;
  };
  matchVideo: {
    file_url: string;
    start_minute?: number | null;
    end_minute?: number | null;
    duration_seconds?: number | null;
  } | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  showVignette: boolean;
  onVignetteComplete: () => void;
}

export function VideoPlayerModal({
  isOpen,
  onClose,
  clip,
  thumbnail,
  matchVideo,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  showVignette,
  onVignetteComplete
}: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [iframeKey, setIframeKey] = useState(0);

  const hasDirectClip = !!clip?.clipUrl;

  // Check if we have video metadata for timestamp calculation
  const hasVideoMetadata = matchVideo && (
    matchVideo.duration_seconds || 
    (matchVideo.end_minute && matchVideo.end_minute > 0)
  );

  // Get video duration for validation
  const getVideoDuration = useCallback(() => {
    if (!matchVideo) return 90 * 60; // Default 90 minutes
    return matchVideo.duration_seconds ?? ((matchVideo.end_minute ?? 90) - (matchVideo.start_minute ?? 0)) * 60;
  }, [matchVideo]);

  // Calculate initial timestamp - prioritize videoSecond from event metadata
  // CRITICAL: Ensure timestamp never exceeds video duration
  const calculateInitialTimestamp = useCallback(() => {
    if (!clip || hasDirectClip) return 0;
    
    const videoDuration = getVideoDuration();
    
    // If we have a precise videoSecond from analysis, use it directly
    if (clip.videoSecond !== undefined && clip.videoSecond >= 0) {
      const targetTs = Math.max(0, clip.videoSecond - 3); // 3 second buffer before event
      // CRITICAL: Clamp to video duration to prevent seeking beyond end
      return Math.min(targetTs, Math.max(0, videoDuration - 1));
    }
    
    // Fallback: calculate from minute/second
    if (!matchVideo) return 0;
    
    const videoStartMinute = matchVideo.start_minute ?? 0;
    const videoEndMinute = matchVideo.end_minute ?? 90;
    
    const matchMinutesSpan = videoEndMinute - videoStartMinute;
    const eventMatchMinute = clip.minute;
    
    // Check if event is within valid video range
    if (eventMatchMinute < videoStartMinute || eventMatchMinute > videoEndMinute || matchMinutesSpan <= 0) {
      // Event is outside video range - clamp to valid range
      console.warn('Event minute', eventMatchMinute, 'is outside video range', videoStartMinute, '-', videoEndMinute);
      return 0; // Start from beginning instead of invalid timestamp
    }
    
    const relativePosition = (eventMatchMinute - videoStartMinute) / matchMinutesSpan;
    const eventVideoSeconds = relativePosition * videoDuration;
    const targetTs = Math.max(0, eventVideoSeconds - 3); // 3 second buffer before event
    
    // CRITICAL: Clamp to video duration
    return Math.min(targetTs, Math.max(0, videoDuration - 1));
  }, [clip, matchVideo, hasDirectClip, getVideoDuration]);

  // Initialize timestamp when modal opens or clip changes
  useEffect(() => {
    if (isOpen && clip) {
      const initialTs = calculateInitialTimestamp();
      setCurrentTimestamp(initialTs);
      setIframeKey(prev => prev + 1);
    }
  }, [isOpen, clip?.id, calculateInitialTimestamp]);

  if (!clip) return null;
  if (!hasDirectClip && !matchVideo) return null;

  const isEmbed = matchVideo ? (matchVideo.file_url.includes('xtream.tech') || matchVideo.file_url.includes('embed')) : false;
  
  // Build embed URL with current timestamp
  const buildEmbedUrl = (timestamp: number) => {
    if (!matchVideo || hasDirectClip) return '';
    const baseUrl = matchVideo.file_url;
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}start=${Math.round(timestamp)}&t=${Math.round(timestamp)}`;
  };

  const embedUrl = buildEmbedUrl(currentTimestamp);

  // Navigation handlers - clamp to video duration
  const handleSeek = (delta: number) => {
    const videoDuration = getVideoDuration();
    const newTimestamp = Math.max(0, Math.min(currentTimestamp + delta, videoDuration - 1));
    setCurrentTimestamp(newTimestamp);
    
    if (videoRef.current && !isEmbed) {
      videoRef.current.currentTime = newTimestamp;
    } else if (isEmbed) {
      // Reload iframe with new timestamp
      setIframeKey(prev => prev + 1);
    }
  };

  const handleResetToEvent = () => {
    const initialTs = calculateInitialTimestamp();
    setCurrentTimestamp(initialTs);
    
    if (videoRef.current && !isEmbed) {
      videoRef.current.currentTime = initialTs;
    } else if (isEmbed) {
      setIframeKey(prev => prev + 1);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  console.log('Video sync debug:', {
    eventMinute: clip.minute,
    eventSecond: clip.second,
    videoSecond: clip.videoSecond,
    currentTimestamp,
    isEmbed,
    embedUrl
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        hideCloseButton
        className="max-w-[95vw] w-[1200px] max-h-[95vh] p-0 border-0 bg-transparent overflow-hidden"
        style={{
          background: 'transparent',
        }}
      >
        <VisuallyHidden>
          <DialogTitle>{clip.title}</DialogTitle>
        </VisuallyHidden>
        
        {/* Main container with glass effect */}
        <div className="relative rounded-2xl overflow-hidden bg-black/80 backdrop-blur-xl border border-white/10 shadow-[0_0_100px_rgba(16,185,129,0.2)]">
          {/* Header bar */}
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-3">
              <Badge variant="arena" className="uppercase tracking-wider">
                {clip.type.replace(/_/g, ' ')}
              </Badge>
              <div className="flex items-center gap-2 text-white/80">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">{clip.minute}'</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/60 hidden sm:block">
                {homeTeam} {homeScore} - {awayScore} {awayTeam}
              </span>
              <Button 
                variant="ghost" 
                size="icon"
                className="text-white/80 hover:text-white hover:bg-white/10"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Video container */}
          <div className="relative aspect-video w-full">
            {/* Vinheta animada - Full screen opening */}
            {showVignette && thumbnail?.imageUrl ? (
              <div className="absolute inset-0 z-40">
                <ClipVignette
                  thumbnailUrl={thumbnail.imageUrl}
                  eventType={clip.type}
                  minute={clip.minute}
                  title={clip.description || clip.title}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  homeScore={homeScore}
                  awayScore={awayScore}
                  onComplete={onVignetteComplete}
                  duration={4000}
                />
              </div>
            ) : hasDirectClip ? (
              <video 
                ref={videoRef} 
                src={clip.clipUrl!}
                className="w-full h-full object-contain bg-black"
                controls
                autoPlay
                muted={isMuted}
              />
            ) : isEmbed ? (
              <div className="relative w-full h-full">
                <iframe
                  key={iframeKey}
                  src={embedUrl}
                  className="absolute inset-0 w-full h-full"
                  frameBorder="0"
                  allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
                  title="Match Video"
                />
                
                {/* Navigation controls for embeds */}
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 z-20">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-white/80 hover:text-white hover:bg-white/10 gap-1"
                    onClick={() => handleSeek(-30)}
                  >
                    <SkipBack className="h-4 w-4" />
                    30s
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-white/80 hover:text-white hover:bg-white/10 gap-1"
                    onClick={() => handleSeek(-10)}
                  >
                    <SkipBack className="h-4 w-4" />
                    10s
                  </Button>
                  
                  <div className="px-3 py-1 bg-primary/20 rounded-lg text-white font-mono text-sm">
                    {formatTime(currentTimestamp)}
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-white/80 hover:text-white hover:bg-white/10 gap-1"
                    onClick={() => handleSeek(10)}
                  >
                    10s
                    <SkipForward className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-white/80 hover:text-white hover:bg-white/10 gap-1"
                    onClick={() => handleSeek(30)}
                  >
                    30s
                    <SkipForward className="h-4 w-4" />
                  </Button>
                  
                  <div className="w-px h-6 bg-white/20" />
                  
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-primary hover:text-primary hover:bg-primary/10 gap-1"
                    onClick={handleResetToEvent}
                    title="Voltar ao início do evento"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Evento
                  </Button>
                </div>
                
                {/* Timestamp indicator */}
                <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm font-medium backdrop-blur-sm z-10 pointer-events-none">
                  Minuto do jogo: {clip.minute}'
                </div>
              </div>
            ) : matchVideo ? (
              <div className="relative w-full h-full">
                <video 
                  ref={videoRef} 
                  src={matchVideo.file_url}
                  className="w-full h-full object-contain bg-black"
                  controls
                  autoPlay
                  muted={isMuted}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = currentTimestamp;
                    }
                  }}
                />
                
                {/* Navigation controls for direct video */}
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 z-20">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-white/80 hover:text-white hover:bg-white/10 gap-1"
                    onClick={() => handleSeek(-10)}
                  >
                    <SkipBack className="h-4 w-4" />
                    10s
                  </Button>
                  
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-primary hover:text-primary hover:bg-primary/10 gap-1"
                    onClick={handleResetToEvent}
                    title="Voltar ao início do evento"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {clip.videoSecond !== undefined 
                      ? `${formatTime(Math.max(0, clip.videoSecond - 3))}` 
                      : `Min ${clip.minute}'`}
                  </Button>
                  
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-white/80 hover:text-white hover:bg-white/10 gap-1"
                    onClick={() => handleSeek(10)}
                  >
                    10s
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Decorative corners */}
            <div className="absolute top-0 left-0 w-16 h-16 pointer-events-none z-30">
              <div className="absolute top-4 left-4 w-8 h-0.5 bg-primary/60" />
              <div className="absolute top-4 left-4 h-8 w-0.5 bg-primary/60" />
            </div>
            <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none z-30">
              <div className="absolute top-4 right-4 w-8 h-0.5 bg-primary/60" />
              <div className="absolute top-4 right-4 h-8 w-0.5 bg-primary/60" />
            </div>
            <div className="absolute bottom-0 left-0 w-16 h-16 pointer-events-none z-30">
              <div className="absolute bottom-4 left-4 w-8 h-0.5 bg-primary/60" />
              <div className="absolute bottom-4 left-4 h-8 w-0.5 bg-primary/60" />
            </div>
            <div className="absolute bottom-0 right-0 w-16 h-16 pointer-events-none z-30">
              <div className="absolute bottom-4 right-4 w-8 h-0.5 bg-primary/60" />
              <div className="absolute bottom-4 right-4 h-8 w-0.5 bg-primary/60" />
            </div>
          </div>

          {/* Bottom info bar */}
          <div className="absolute bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-black/90 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold truncate">{clip.title}</h3>
                <p className="text-white/60 text-sm truncate">{clip.description}</p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {!isEmbed && !hasDirectClip && (
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-white/80 hover:text-white hover:bg-white/10"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </Button>
                )}
                {!isEmbed && (
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-white/80 hover:text-white hover:bg-white/10"
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.requestFullscreen?.();
                      }
                    }}
                  >
                    <Maximize2 className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Ambient glow effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 blur-2xl pointer-events-none opacity-50" />
        </div>
      </DialogContent>
    </Dialog>
  );
}