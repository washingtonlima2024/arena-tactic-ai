import { useEffect, useState, useRef } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface VolumeIndicatorProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  className?: string;
}

export const VolumeIndicator = ({ analyser, isActive, className }: VolumeIndicatorProps) => {
  const [volumeLevel, setVolumeLevel] = useState(0);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!analyser || !isActive) {
      setVolumeLevel(0);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume (0-255) and normalize to 0-100
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      const normalized = Math.min(100, (average / 128) * 100);
      
      setVolumeLevel(normalized);
      animationRef.current = requestAnimationFrame(updateVolume);
    };

    updateVolume();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [analyser, isActive]);

  const barCount = 5;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const threshold = ((i + 1) / barCount) * 100;
    const isActive = volumeLevel >= threshold * 0.5;
    const intensity = Math.min(1, volumeLevel / (threshold * 0.8));
    
    return { isActive, intensity };
  });

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {volumeLevel > 5 ? (
        <Volume2 className="h-4 w-4 text-primary animate-pulse" />
      ) : (
        <VolumeX className="h-4 w-4 text-muted-foreground" />
      )}
      
      <div className="flex items-end gap-0.5 h-5">
        {bars.map((bar, i) => (
          <div
            key={i}
            className={cn(
              "w-1 rounded-full transition-all duration-75",
              bar.isActive
                ? i < 2
                  ? "bg-green-500"
                  : i < 4
                  ? "bg-yellow-500"
                  : "bg-red-500"
                : "bg-muted-foreground/30"
            )}
            style={{
              height: bar.isActive 
                ? `${Math.max(4, (i + 1) * 4 * bar.intensity)}px` 
                : "4px",
            }}
          />
        ))}
      </div>
      
      <span className="text-xs text-muted-foreground w-8 text-right">
        {Math.round(volumeLevel)}%
      </span>
    </div>
  );
};
