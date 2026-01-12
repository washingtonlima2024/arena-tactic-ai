import { useRef, useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Clock, Maximize2, Volume2, VolumeX, SkipBack, SkipForward, RotateCcw, Smartphone, Monitor, Square, Tablet } from 'lucide-react';
import { ClipVignette } from './ClipVignette';
import { DeviceMockup } from './DeviceMockup';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { normalizeStorageUrl } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

type DeviceFormat = '9:16' | '16:9' | '1:1' | '4:5';

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
    eventMs?: number;
    videoSecond?: number;
    totalSeconds?: number;
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
  videoCoverUrl?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  showVignette: boolean;
  onVignetteComplete: () => void;
}

const formatIcons: Record<DeviceFormat, React.ReactNode> = {
  '9:16': <Smartphone className="h-4 w-4" />,
  '16:9': <Monitor className="h-4 w-4" />,
  '1:1': <Square className="h-4 w-4" />,
  '4:5': <Tablet className="h-4 w-4" />,
};

const formatLabels: Record<DeviceFormat, string> = {
  '9:16': 'Story',
  '16:9': 'Landscape',
  '1:1': 'Quadrado',
  '4:5': 'Portrait',
};

export function VideoPlayerModal({
  isOpen,
  onClose,
  clip,
  thumbnail,
  matchVideo,
  videoCoverUrl,
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
  const [deviceFormat, setDeviceFormat] = useState<DeviceFormat>('16:9');

  // Normalize URLs for tunnel compatibility
  const normalizedClipUrl = normalizeStorageUrl(clip?.clipUrl);
  const normalizedVideoUrl = normalizeStorageUrl(matchVideo?.file_url);
  
  const hasDirectClip = !!normalizedClipUrl;
  const hasValidMatchVideo = !!normalizedVideoUrl && normalizedVideoUrl.length > 0;

  // Get video duration for validation
  const getVideoDuration = useCallback(() => {
    if (!matchVideo) return 90 * 60;
    return matchVideo.duration_seconds ?? ((matchVideo.end_minute ?? 90) - (matchVideo.start_minute ?? 0)) * 60;
  }, [matchVideo]);

  // Calculate initial timestamp
  const calculateInitialTimestamp = useCallback(() => {
    if (!clip || hasDirectClip) return 0;
    
    const videoDuration = getVideoDuration();
    const videoStartMinute = matchVideo?.start_minute ?? 0;
    
    // Use 5 seconds before event for better context
    const PRE_EVENT_BUFFER = 5;
    
    if (clip.videoSecond !== undefined && clip.videoSecond >= 0 && clip.videoSecond <= videoDuration) {
      const targetTs = Math.max(0, clip.videoSecond - PRE_EVENT_BUFFER);
      return Math.min(targetTs, Math.max(0, videoDuration - 1));
    }
    
    if (clip.eventMs !== undefined && clip.eventMs >= 0) {
      const eventSeconds = clip.eventMs / 1000;
      if (eventSeconds <= videoDuration) {
        const targetTs = Math.max(0, eventSeconds - PRE_EVENT_BUFFER);
        return Math.min(targetTs, Math.max(0, videoDuration - 1));
      }
    }
    
    if (clip.totalSeconds !== undefined && clip.totalSeconds >= 0 && clip.totalSeconds <= videoDuration) {
      const targetTs = Math.max(0, clip.totalSeconds - PRE_EVENT_BUFFER);
      return Math.min(targetTs, Math.max(0, videoDuration - 1));
    }
    
    const gameTimeSeconds = (clip.minute * 60) + (clip.second || 0);
    
    if (gameTimeSeconds <= videoDuration) {
      const targetTs = Math.max(0, gameTimeSeconds - PRE_EVENT_BUFFER);
      return Math.min(targetTs, Math.max(0, videoDuration - 1));
    }
    
    let effectiveStartMinute = videoStartMinute;
    if (effectiveStartMinute === 0 && gameTimeSeconds > videoDuration) {
      effectiveStartMinute = Math.max(0, clip.minute - 5);
    }
    
    const videoRelativeSeconds = (clip.minute - effectiveStartMinute) * 60 + (clip.second || 0);
    const targetTs = Math.max(0, Math.min(videoRelativeSeconds - PRE_EVENT_BUFFER, videoDuration - 1));
    
    return targetTs;
  }, [clip, hasDirectClip, getVideoDuration, matchVideo?.start_minute]);

  // Initialize timestamp when modal opens or clip changes
  useEffect(() => {
    if (isOpen && clip) {
      const initialTs = calculateInitialTimestamp();
      setCurrentTimestamp(initialTs);
      setIframeKey(prev => prev + 1);
    }
  }, [isOpen, clip?.id, calculateInitialTimestamp]);

  if (!clip) return null;
  if (!hasDirectClip && !hasValidMatchVideo) return null;

  const isEmbed = normalizedVideoUrl ? (normalizedVideoUrl.includes('xtream.tech') || normalizedVideoUrl.includes('embed')) : false;
  
  // Navigation handlers
  const handleSeek = (delta: number) => {
    const videoDuration = getVideoDuration();
    const newTimestamp = Math.max(0, Math.min(currentTimestamp + delta, videoDuration - 1));
    setCurrentTimestamp(newTimestamp);
    
    if (videoRef.current && !isEmbed) {
      videoRef.current.currentTime = newTimestamp;
    } else if (isEmbed) {
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

  const videoDuration = getVideoDuration();
  const eventSeconds = clip.eventMs !== undefined 
    ? clip.eventMs / 1000 
    : clip.totalSeconds ?? clip.videoSecond ?? (clip.minute * 60 + (clip.second || 0));
  const hasTimestampMismatch = eventSeconds > videoDuration;

  // Video content component
  const VideoContent = () => {
    if (showVignette && thumbnail?.imageUrl) {
      return (
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
      );
    }
    
    if (hasDirectClip) {
      return (
        <video 
          ref={videoRef} 
          src={normalizedClipUrl!}
          poster={videoCoverUrl || undefined}
          className="w-full h-full object-cover"
          controls
          autoPlay
          muted={isMuted}
        />
      );
    }
    
    if (isEmbed) {
      return (
        <iframe
          key={iframeKey}
          src={normalizedVideoUrl!}
          className="w-full h-full"
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
          title="Match Video"
        />
      );
    }
    
    if (normalizedVideoUrl) {
      return (
        <video 
          ref={videoRef} 
          src={normalizedVideoUrl}
          poster={videoCoverUrl || undefined}
          className="w-full h-full object-cover"
          controls
          autoPlay
          muted={isMuted}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              videoRef.current.currentTime = currentTimestamp;
            }
          }}
        />
      );
    }
    
    return null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        hideCloseButton
        className="max-w-[95vw] w-[900px] max-h-[95vh] p-0 border-0 bg-transparent overflow-hidden"
      >
        <VisuallyHidden>
          <DialogTitle>{clip.title}</DialogTitle>
        </VisuallyHidden>
        
        {/* Main container */}
        <div className="relative rounded-2xl overflow-hidden bg-background/95 backdrop-blur-xl border border-border shadow-2xl">
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
            <div className="flex items-center gap-3">
              <Badge variant="arena" className="uppercase tracking-wider text-xs">
                {clip.type.replace(/_/g, ' ')}
              </Badge>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-sm font-medium">{clip.minute}'</span>
              </div>
              {hasTimestampMismatch && (
                <Badge variant="warning" className="gap-1 text-xs">
                  ⚠️ Timestamp
                </Badge>
              )}
            </div>
            
            {/* Format selector */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(Object.keys(formatIcons) as DeviceFormat[]).map((format) => (
                <Button
                  key={format}
                  variant={deviceFormat === format ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 px-2 gap-1.5",
                    deviceFormat === format && "bg-primary text-primary-foreground"
                  )}
                  onClick={() => setDeviceFormat(format)}
                  title={formatLabels[format]}
                >
                  {formatIcons[format]}
                  <span className="hidden sm:inline text-xs">{formatLabels[format]}</span>
                </Button>
              ))}
            </div>
            
            <Button 
              variant="ghost" 
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Device mockup container */}
          <div className="flex items-center justify-center p-6 bg-gradient-to-b from-muted/30 to-background min-h-[400px]">
            <DeviceMockup format={deviceFormat} size="md" allowRotation>
              <VideoContent />
            </DeviceMockup>
          </div>

          {/* Controls bar */}
          <div className="p-4 border-t border-border bg-muted/50 space-y-3">
            {/* Navigation controls - only for direct video, not embeds */}
            {!isEmbed && !hasDirectClip && normalizedVideoUrl && (
              <div className="flex items-center justify-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleSeek(-3)}
                >
                  <SkipBack className="h-4 w-4" />
                  -3s
                </Button>
                
                <Button 
                  variant="default" 
                  size="sm"
                  className="gap-1.5"
                  onClick={handleResetToEvent}
                >
                  <RotateCcw className="h-4 w-4" />
                  {clip.videoSecond !== undefined 
                    ? formatTime(Math.max(0, clip.videoSecond - 3))
                    : `${clip.minute}'`}
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleSeek(3)}
                >
                  +3s
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            {/* Info and controls row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate text-foreground">{clip.title}</h3>
                <p className="text-muted-foreground text-sm truncate">{clip.description}</p>
              </div>
              
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground hidden sm:block mr-2">
                  {homeTeam} {homeScore} - {awayScore} {awayTeam}
                </span>
                
                {hasDirectClip && (
                  <Badge variant="secondary" className="text-xs">
                    Clip Extraído
                  </Badge>
                )}
                
                {!isEmbed && (
                  <>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setIsMuted(!isMuted)}
                    >
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => videoRef.current?.requestFullscreen?.()}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}