import { useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Clock, Maximize2, Volume2, VolumeX } from 'lucide-react';
import { ClipVignette } from './ClipVignette';
import { useState } from 'react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: {
    id: string;
    title: string;
    type: string;
    minute: number;
    description: string;
  } | null;
  thumbnail?: {
    imageUrl: string;
  };
  matchVideo: {
    file_url: string;
    start_minute?: number;
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

  if (!clip || !matchVideo) return null;

  const videoStartMinute = matchVideo.start_minute || 0;
  const eventSeconds = (clip.minute - videoStartMinute) * 60;
  const startSeconds = Math.max(0, eventSeconds - 10);

  // Build URL with time parameter
  const baseUrl = matchVideo.file_url;
  const separator = baseUrl.includes('?') ? '&' : '?';
  const embedUrl = `${baseUrl}${separator}t=${startSeconds}`;
  const isEmbed = baseUrl.includes('xtream.tech') || baseUrl.includes('embed');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
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
            ) : isEmbed ? (
              <iframe
                src={embedUrl}
                className="absolute inset-0 w-full h-full"
                frameBorder="0"
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
                title="Match Video"
              />
            ) : (
              <video 
                ref={videoRef} 
                src={matchVideo.file_url}
                className="w-full h-full object-contain bg-black"
                controls
                autoPlay
                muted={isMuted}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = startSeconds;
                  }
                }}
              />
            )}

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
                {!isEmbed && (
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-white/80 hover:text-white hover:bg-white/10"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </Button>
                )}
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
