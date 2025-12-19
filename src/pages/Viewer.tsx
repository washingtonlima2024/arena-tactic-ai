import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Maximize, 
  Minimize, 
  Volume2, 
  VolumeX, 
  ArrowLeft,
  Play,
  Pause,
  Settings,
  Radio
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Viewer = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const streamUrl = searchParams.get("url") || "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState("00:00");
  const [playbackRate, setPlaybackRate] = useState(1);

  // Auto-hide controls after 3 seconds of inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("touchstart", handleMouseMove);
    }

    return () => {
      clearTimeout(timeout);
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove);
        container.removeEventListener("touchstart", handleMouseMove);
      }
    };
  }, [isPlaying]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Update current time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      const minutes = Math.floor(video.currentTime / 60);
      const seconds = Math.floor(video.currentTime % 60);
      setCurrentTime(`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
    };

    video.addEventListener("timeupdate", updateTime);
    return () => video.removeEventListener("timeupdate", updateTime);
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    const newVolume = value[0];
    video.volume = newVolume / 100;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    if (!isFullscreen) {
      await container.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = rate;
    setPlaybackRate(rate);
  };

  // Check if URL is HLS stream
  const isHlsStream = streamUrl.toLowerCase().includes('.m3u8');

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen bg-black overflow-hidden"
      onClick={togglePlay}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={streamUrl}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted={isMuted}
      />

      {/* Live Indicator */}
      <div 
        className={`absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/90 backdrop-blur-sm transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
        </span>
        <span className="text-white text-sm font-semibold">AO VIVO</span>
      </div>

      {/* ArenaPlay Logo */}
      <div 
        className={`absolute top-4 right-4 flex items-center gap-2 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm">
          <Radio className="h-5 w-5 text-primary" />
          <span className="text-white font-bold">ArenaPlay</span>
        </div>
      </div>

      {/* Back Button */}
      <Button
        variant="ghost"
        size="icon"
        className={`absolute top-4 left-1/2 -translate-x-1/2 text-white hover:bg-white/20 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          navigate(-1);
        }}
      >
        <ArrowLeft className="h-6 w-6" />
      </Button>

      {/* Center Play/Pause Overlay */}
      <div 
        className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
          showControls && !isPlaying ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="p-6 rounded-full bg-white/20 backdrop-blur-sm">
          <Play className="h-16 w-16 text-white" />
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-20 pb-4 px-4 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Time Display */}
        <div className="flex items-center justify-center mb-4">
          <div className="px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm">
            <span className="text-white font-mono text-lg">{currentTime}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          {/* Left Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </Button>

            <div className="flex items-center gap-2 group">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={toggleMute}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </Button>
              <div className="w-0 group-hover:w-24 overflow-hidden transition-all duration-300">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  onValueChange={handleVolumeChange}
                  max={100}
                  step={1}
                  className="w-24"
                />
              </div>
            </div>
          </div>

          {/* Center - Stream Info */}
          <div className="text-white/70 text-sm hidden md:block">
            {isHlsStream ? "HLS Stream" : "Video Stream"}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-black/90 border-white/20">
                <DropdownMenuItem 
                  className={`text-white hover:bg-white/20 ${playbackRate === 0.5 ? "bg-white/10" : ""}`}
                  onClick={() => handlePlaybackRateChange(0.5)}
                >
                  0.5x
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`text-white hover:bg-white/20 ${playbackRate === 1 ? "bg-white/10" : ""}`}
                  onClick={() => handlePlaybackRateChange(1)}
                >
                  1x (Normal)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`text-white hover:bg-white/20 ${playbackRate === 1.5 ? "bg-white/10" : ""}`}
                  onClick={() => handlePlaybackRateChange(1.5)}
                >
                  1.5x
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`text-white hover:bg-white/20 ${playbackRate === 2 ? "bg-white/10" : ""}`}
                  onClick={() => handlePlaybackRateChange(2)}
                >
                  2x
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Viewer;
