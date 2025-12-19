import { useState, useRef, useEffect } from "react";
import Hls from "hls.js";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link2, Play, ExternalLink, Loader2, ChevronDown, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const TEST_STREAMS = [
  { label: "HLS Local (live.m3u8)", url: "http://localhost:8000/streams/live.m3u8" },
  { label: "HLS Test (Mux)", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  { label: "MJPEG Local", url: "http://localhost:8000/stream/mjpeg" },
  { label: "Big Buck Bunny (MP4)", url: "https://live-hls-abr-cdn.livepush.io/vod/bigbuckbunnyclip.mp4" },
];

// Check if running in Lovable preview (not localhost)
const isLovablePreview = (): boolean => {
  const hostname = window.location.hostname;
  return hostname.includes('lovable.app') || hostname.includes('lovableproject.com');
};

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
  const [localStreamError, setLocalStreamError] = useState(false);
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
    setLocalStreamError(false);

    const isLocal = isLocalStream(previewUrl);

    // Check if trying to use local stream in Lovable preview
    if (isLocal && isLovablePreview()) {
      setIsLoading(false);
      setLocalStreamError(true);
      return;
    }

    if (isHlsStream(previewUrl)) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
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

  // Check if URL is MJPEG stream (must not be HLS)
  const isMjpegStream = (url: string): boolean => {
    const lowercaseUrl = url.toLowerCase();
    // Don't treat as MJPEG if it's an HLS stream
    if (lowercaseUrl.includes('.m3u8')) return false;
    // Check for explicit MJPEG indicators
    return lowercaseUrl.includes('mjpeg') || lowercaseUrl.includes('mjpg') || lowercaseUrl.endsWith('/stream');
  };

  // Check if URL is a local stream (localhost, 127.0.0.1, or local network)
  const isLocalStream = (url: string): boolean => {
    const lowercaseUrl = url.toLowerCase();
    return lowercaseUrl.includes('localhost') || 
           lowercaseUrl.includes('127.0.0.1') || 
           lowercaseUrl.includes('192.168.') ||
           lowercaseUrl.includes('10.0.') ||
           lowercaseUrl.includes('172.16.');
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

    // Show error for local streams in Lovable preview
    if (localStreamError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6">
          <Alert className="max-w-md bg-yellow-500/10 border-yellow-500/50">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <AlertTitle className="text-yellow-500">Stream Local Bloqueado</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              <p className="mb-2">
                Streams locais (localhost) não funcionam no preview do Lovable devido a políticas de segurança do navegador.
              </p>
              <p className="font-medium">Para testar, rode localmente:</p>
              <code className="block mt-1 px-2 py-1 bg-muted rounded text-xs">
                npm run dev
              </code>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    // MJPEG streams - use img tag
    if (isMjpegStream(previewUrl)) {
      const isLocal = isLocalStream(previewUrl);
      
      return (
        <div className="relative w-full h-full">
          <img
            src={previewUrl}
            alt="MJPEG Stream"
            className="w-full h-full object-contain"
            {...(!isLocal && { crossOrigin: "anonymous" })}
            onError={(e) => {
              console.error('MJPEG stream failed to load:', previewUrl);
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.parentElement?.insertAdjacentHTML(
                'beforeend',
                `<div class="w-full h-full flex flex-col items-center justify-center text-red-400"><p class="text-center">Erro ao carregar stream MJPEG${isLocal ? ' local' : ''}.<br/>Verifique se o servidor está rodando.</p></div>`
              );
            }}
            onLoad={() => console.log('MJPEG stream loaded successfully')}
          />
          {/* Badges */}
          <div className="absolute top-2 left-2 flex gap-2">
            <div className="px-2 py-1 rounded bg-orange-500/80 text-white text-xs font-medium">
              MJPEG
            </div>
            {isLocal && (
              <div className="px-2 py-1 rounded bg-green-500/80 text-white text-xs font-medium">
                LOCAL
              </div>
            )}
          </div>
        </div>
      );
    }

    // Direct video files or HLS streams - use video element with HLS.js
    if (isDirectVideo(previewUrl) || isHlsStream(previewUrl)) {
      const isLocal = isLocalStream(previewUrl);
      const isHls = isHlsStream(previewUrl);
      
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
            autoPlay
            muted
            playsInline
          />
          {/* Badges */}
          <div className="absolute top-2 left-2 flex gap-2">
            {isHls && (
              <div className="px-2 py-1 rounded bg-blue-500/80 text-white text-xs font-medium">
                HLS
              </div>
            )}
            {isLocal && (
              <div className="px-2 py-1 rounded bg-green-500/80 text-white text-xs font-medium">
                LOCAL
              </div>
            )}
          </div>
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
            placeholder="Cole o link da transmissão (YouTube, Twitch, MP4, HLS, MJPEG...)"
            value={streamUrl}
            onChange={(e) => onStreamUrlChange(e.target.value)}
            disabled={isRecording}
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isRecording}>
              Teste
              <ChevronDown className="h-4 w-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {TEST_STREAMS.map((stream) => (
              <DropdownMenuItem
                key={stream.url}
                onClick={() => {
                  onStreamUrlChange(stream.url);
                  setPreviewUrl(stream.url);
                }}
              >
                {stream.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
          <span className="px-2 py-1 rounded bg-muted">MJPEG</span>
        </div>
      </div>

      {/* Video Preview */}
      <div className="aspect-video bg-black/50 rounded-lg overflow-hidden border border-border">
        {renderVideoPreview()}
      </div>
    </div>
  );
};
