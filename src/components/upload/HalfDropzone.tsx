import { useCallback, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileVideo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VideoType } from './VideoSegmentCard';

interface HalfDropzoneProps {
  half: 'first' | 'second';
  videoCount: number;
  onFileDrop: (files: File[], half: 'first' | 'second') => void;
  className?: string;
}

export function HalfDropzone({ half, videoCount, onFileDrop, className }: HalfDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const isFirstHalf = half === 'first';
  const label = isFirstHalf ? '1º Tempo' : '2º Tempo';
  const timeRange = isFirstHalf ? "0' - 45'" : "45' - 90'";
  const colorClasses = isFirstHalf 
    ? 'border-blue-500 bg-blue-500/5 hover:border-blue-400' 
    : 'border-orange-500 bg-orange-500/5 hover:border-orange-400';
  const iconColor = isFirstHalf ? 'text-blue-400' : 'text-orange-400';
  const badgeColor = isFirstHalf ? 'bg-blue-500' : 'bg-orange-500';

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type.startsWith('video/')
    );

    if (droppedFiles.length > 0) {
      onFileDrop(droppedFiles, half);
    }
  }, [half, onFileDrop]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFileDrop(Array.from(e.target.files), half);
      e.target.value = ''; // Reset input
    }
  };

  return (
    <Card 
      variant="glass" 
      className={cn(
        "relative transition-all",
        colorClasses,
        isDragging && "scale-[1.02] shadow-lg",
        className
      )}
    >
      <CardContent className="p-0">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative flex flex-col items-center justify-center py-8 px-4 rounded-xl border-2 border-dashed transition-all",
            isDragging 
              ? isFirstHalf ? "border-blue-400 bg-blue-500/10" : "border-orange-400 bg-orange-500/10"
              : "border-transparent"
          )}
        >
          {/* Badge with count */}
          <div className="absolute top-3 right-3">
            <Badge className={cn("text-white", badgeColor)}>
              {videoCount} {videoCount === 1 ? 'vídeo' : 'vídeos'}
            </Badge>
          </div>

          {/* Icon */}
          <div className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full mb-3",
            isFirstHalf ? "bg-blue-500/10" : "bg-orange-500/10"
          )}>
            {videoCount > 0 ? (
              <FileVideo className={cn("h-6 w-6", iconColor)} />
            ) : (
              <Upload className={cn("h-6 w-6", iconColor)} />
            )}
          </div>

          {/* Label */}
          <p className={cn("font-semibold text-lg", iconColor)}>{label}</p>
          <p className="text-sm text-muted-foreground">{timeRange}</p>
          
          {/* Drop hint */}
          <p className="text-xs text-muted-foreground mt-2">
            Arraste vídeos ou clique para selecionar
          </p>

          {/* Hidden file input */}
          <input
            type="file"
            accept="video/*"
            multiple
            onChange={handleFileSelect}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// Helper to get the default video type based on half
export function getDefaultVideoType(half: 'first' | 'second'): VideoType {
  return half === 'first' ? 'first_half' : 'second_half';
}

// Helper to get default start/end minutes based on half
export function getDefaultMinutes(half: 'first' | 'second'): { start: number; end: number } {
  return half === 'first' 
    ? { start: 0, end: 45 }
    : { start: 45, end: 90 };
}
