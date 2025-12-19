import { useState, useRef, useEffect } from "react";
import Hls from "hls.js";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link2, Play, ExternalLink, Loader2 } from "lucide-react";

interface LiveStreamInputProps {
  streamUrl: string;
  onStreamUrlChange: (url: string) => void;
  isRecording: boolean;
}

export const LiveStreamInput = ({
  streamUrl,
  onStreamUrlChange,
  isRecording,
}: LiveStreamInputProps) => {
  const [previewUrl, setPreviewUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Cleanup HLS instance on unmount or URL change
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // Initialize video when previewUrl changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewUrl) return;

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsLoading(true);

    if (isHlsStream(previewUrl)) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        
        hlsRef.current = hls;
        hls.loadSource(previewUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          video.play().catch(console.error);
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.error("HLS error:", data);
            setIsLoading(false);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = previewUrl;
        video.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          video.play().catch(console.error);
        }, { once: true });
      }
    } else if (isDirectVideo(previewUrl)) {
      video.src = previewUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        video.play().catch(console.error);
      }, { once: true });
      video.addEventListener('error', () => {
        setIsLoading(false);
      }, { once: true });
    } else {
      // For YouTube/Twitch, loading handled by iframe
      setIsLoading(false);
    }
  }, [previewUrl]);

  const handlePreview = () => {
    setPreviewUrl(streamUrl);
  };

  // Check if URL is a direct video file
  const isDirectVideo = (url: string): boolean => {
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.m4v'];
    const lowercaseUrl = url.toLowerCase();
    return videoExtensions.some(ext => lowercaseUrl.includes(ext));
  };

  // Check if URL is HLS stream
  const isHlsStream = (url: string): boolean => {
    return url.toLowerCase().includes('.m3u8');
  };

  const getEmbedUrl = (url: string): string => {
    // YouTube
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      const videoId = url.includes("youtu.be")
        ? url.split("/").pop()
        : new URL(url).searchParams.get("v");
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }
    // Twitch
    if (url.includes("twitch.tv")) {
      const channel = url.split("/").pop();
      return `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}`;
    }
    // Direct video or HLS - handled separately
    return url;
  };

  const renderVideoPreview = () => {
    if (!previewUrl) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
          <ExternalLink className="h-12 w-12 mb-2 opacity-50" />
          <p>Cole um link e clique em Preview</p>
        </div>
      );
    }

    // Direct video files or HLS streams - use video element with HLS.js
    if (isDirectVideo(previewUrl) || isHlsStream(previewUrl)) {
      return (
        <div className="relative w-full h-full">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          )}
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            controls
            muted
            playsInline
            crossOrigin="anonymous"
          />
        </div>
      );
    }

    // YouTube, Twitch, and other embeddable URLs
    return (
      <iframe
        src={getEmbedUrl(previewUrl)}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cole o link da transmissão (YouTube, Twitch, MP4, HLS...)"
            value={streamUrl}
            onChange={(e) => onStreamUrlChange(e.target.value)}
            disabled={isRecording}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={handlePreview}
          disabled={!streamUrl || isRecording}
        >
          <Play className="h-4 w-4 mr-2" />
          Preview
        </Button>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>Formatos suportados:</p>
        <div className="flex flex-wrap gap-2">
          <span className="px-2 py-1 rounded bg-muted">YouTube Live</span>
          <span className="px-2 py-1 rounded bg-muted">Twitch</span>
          <span className="px-2 py-1 rounded bg-muted">MP4 / WebM</span>
          <span className="px-2 py-1 rounded bg-muted">HLS (.m3u8)</span>
        </div>
      </div>

      {/* Video Preview */}
      <div className="aspect-video bg-black/50 rounded-lg overflow-hidden border border-border">
        {renderVideoPreview()}
      </div>
    </div>
  );
};
