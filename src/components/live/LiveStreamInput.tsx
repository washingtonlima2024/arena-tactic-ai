import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link2, Play, ExternalLink } from "lucide-react";

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

  const handlePreview = () => {
    setPreviewUrl(streamUrl);
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
    // Direct HLS/RTMP or other embeddable URL
    return url;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cole o link da transmissão (YouTube, Twitch, HLS...)"
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
          <span className="px-2 py-1 rounded bg-muted">HLS (.m3u8)</span>
          <span className="px-2 py-1 rounded bg-muted">Embed URL</span>
        </div>
      </div>

      {/* Video Preview */}
      <div className="aspect-video bg-black/50 rounded-lg overflow-hidden border border-border">
        {previewUrl ? (
          <iframe
            src={getEmbedUrl(previewUrl)}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <ExternalLink className="h-12 w-12 mb-2 opacity-50" />
            <p>Cole um link e clique em Preview</p>
          </div>
        )}
      </div>
    </div>
  );
};
