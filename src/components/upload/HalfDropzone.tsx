import { useCallback, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileVideo, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VideoType } from './VideoSegmentCard';
import { Button } from '@/components/ui/button';

interface HalfDropzoneProps {
  half: 'first' | 'second';
  videoCount: number;
  srtFile?: File | null;
  onFileDrop: (files: File[], half: 'first' | 'second') => void;
  onSrtDrop?: (file: File, half: 'first' | 'second') => void;
  onSrtRemove?: (half: 'first' | 'second') => void;
  className?: string;
}

export function HalfDropzone({ 
  half, 
  videoCount, 
  srtFile,
  onFileDrop, 
  onSrtDrop,
  onSrtRemove,
  className 
}: HalfDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isSrtDragging, setIsSrtDragging] = useState(false);

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

  // SRT Handlers
  const handleSrtDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSrtDragging(true);
  }, []);

  const handleSrtDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSrtDragging(false);
  }, []);

  const handleSrtDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSrtDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.name.endsWith('.srt') || file.name.endsWith('.vtt') || file.name.endsWith('.txt')
    );

    if (droppedFiles.length > 0 && onSrtDrop) {
      onSrtDrop(droppedFiles[0], half);
    }
  }, [half, onSrtDrop]);

  const handleSrtFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onSrtDrop) {
      onSrtDrop(e.target.files[0], half);
      e.target.value = '';
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
        {/* Video Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative flex flex-col items-center justify-center py-6 px-4 rounded-t-xl border-2 border-dashed transition-all",
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
            "flex h-10 w-10 items-center justify-center rounded-full mb-2",
            isFirstHalf ? "bg-blue-500/10" : "bg-orange-500/10"
          )}>
            {videoCount > 0 ? (
              <FileVideo className={cn("h-5 w-5", iconColor)} />
            ) : (
              <Upload className={cn("h-5 w-5", iconColor)} />
            )}
          </div>

          {/* Label */}
          <p className={cn("font-semibold text-base", iconColor)}>{label}</p>
          <p className="text-xs text-muted-foreground">{timeRange}</p>
          
          {/* Drop hint */}
          <p className="text-xs text-muted-foreground mt-1">
            Arraste vídeos ou clique
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

        {/* SRT Dropzone */}
        <div
          onDragOver={handleSrtDragOver}
          onDragLeave={handleSrtDragLeave}
          onDrop={handleSrtDrop}
          className={cn(
            "relative flex items-center justify-between px-4 py-3 border-t transition-all",
            isFirstHalf ? "border-blue-500/20" : "border-orange-500/20",
            isSrtDragging && (isFirstHalf ? "bg-blue-500/10" : "bg-orange-500/10")
          )}
        >
          <div className="flex items-center gap-2">
            <FileText className={cn("h-4 w-4", srtFile ? "text-emerald-400" : "text-muted-foreground")} />
            {srtFile ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400 truncate max-w-[120px]">
                  {srtFile.name}
                </span>
                {onSrtRemove && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSrtRemove(half);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Legenda SRT (opcional)
              </span>
            )}
          </div>

          {/* Hidden SRT input */}
          <input
            type="file"
            accept=".srt,.vtt,.txt"
            onChange={handleSrtFileSelect}
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
