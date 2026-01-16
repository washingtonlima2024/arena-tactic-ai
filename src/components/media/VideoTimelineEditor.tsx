import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface VideoTimelineEditorProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  eventSecond: number;       // Segundo do vídeo onde o evento ocorre
  videoDuration: number;     // Duração total do vídeo
  initialTrim?: {
    startOffset: number;     // Offset do início (default -15)
    endOffset: number;       // Offset do fim (default +15)
  };
  onTrimChange?: (trim: { startOffset: number; endOffset: number }) => void;
  onSave?: (trim: { startOffset: number; endOffset: number }) => void;
}

const PIXELS_PER_SECOND = 12;
const DEFAULT_START_OFFSET = -15;
const DEFAULT_END_OFFSET = 15;
const MIN_CLIP_DURATION = 5;
const MAX_OFFSET = 30;

export function VideoTimelineEditor({
  videoRef,
  eventSecond,
  videoDuration,
  initialTrim,
  onTrimChange,
  onSave
}: VideoTimelineEditorProps) {
  const [startOffset, setStartOffset] = useState(initialTrim?.startOffset ?? DEFAULT_START_OFFSET);
  const [endOffset, setEndOffset] = useState(initialTrim?.endOffset ?? DEFAULT_END_OFFSET);
  const [isDraggingStart, setIsDraggingStart] = useState(false);
  const [isDraggingEnd, setIsDraggingEnd] = useState(false);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [timelineOffset, setTimelineOffset] = useState(0);
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const duration = endOffset - startOffset;
  
  // Notify parent of changes
  useEffect(() => {
    onTrimChange?.({ startOffset, endOffset });
  }, [startOffset, endOffset, onTrimChange]);
  
  // Sync video position with timeline dragging
  useEffect(() => {
    if (videoRef.current && !isDraggingStart && !isDraggingEnd) {
      const targetTime = Math.max(0, Math.min(videoDuration, eventSecond + timelineOffset));
      videoRef.current.currentTime = targetTime;
    }
  }, [timelineOffset, eventSecond, videoDuration, videoRef, isDraggingStart, isDraggingEnd]);
  
  // Calculate timeline width based on offsets
  const timelineWidth = (MAX_OFFSET * 2 + 10) * PIXELS_PER_SECOND;
  const centerX = timelineWidth / 2;
  
  // Convert offset to pixel position
  const offsetToPixel = useCallback((offset: number) => {
    return centerX + (offset * PIXELS_PER_SECOND);
  }, [centerX]);
  
  // Convert pixel position to offset
  const pixelToOffset = useCallback((pixel: number) => {
    return (pixel - centerX) / PIXELS_PER_SECOND;
  }, [centerX]);
  
  // Handle start handle drag
  const handleStartDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingStart(true);
    
    const handleMove = (moveEvent: MouseEvent) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = moveEvent.clientX - rect.left + timelineRef.current!.scrollLeft;
      const newOffset = pixelToOffset(x);
      
      // Clamp: can't go past end handle, minimum duration
      const maxStart = endOffset - MIN_CLIP_DURATION;
      const clampedOffset = Math.max(-MAX_OFFSET, Math.min(newOffset, maxStart));
      
      setStartOffset(clampedOffset);
      
      // Update video preview
      if (videoRef.current) {
        const previewTime = Math.max(0, eventSecond + clampedOffset);
        videoRef.current.currentTime = previewTime;
      }
    };
    
    const handleUp = () => {
      setIsDraggingStart(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [endOffset, eventSecond, pixelToOffset, videoRef]);
  
  // Handle end handle drag
  const handleEndDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingEnd(true);
    
    const handleMove = (moveEvent: MouseEvent) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = moveEvent.clientX - rect.left + timelineRef.current!.scrollLeft;
      const newOffset = pixelToOffset(x);
      
      // Clamp: can't go before start handle, minimum duration
      const minEnd = startOffset + MIN_CLIP_DURATION;
      const clampedOffset = Math.min(MAX_OFFSET, Math.max(newOffset, minEnd));
      
      setEndOffset(clampedOffset);
      
      // Update video preview
      if (videoRef.current) {
        const previewTime = Math.max(0, eventSecond + clampedOffset);
        videoRef.current.currentTime = previewTime;
      }
    };
    
    const handleUp = () => {
      setIsDraggingEnd(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [startOffset, eventSecond, pixelToOffset, videoRef]);
  
  // Handle timeline drag (moves both handles together)
  const handleTimelineDrag = useCallback((e: React.MouseEvent) => {
    // Only start timeline drag if not on handles
    if ((e.target as HTMLElement).dataset.handle) return;
    
    e.preventDefault();
    setIsDraggingTimeline(true);
    
    const startX = e.clientX;
    const startTimelineOffset = timelineOffset;
    
    const handleMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaSeconds = -deltaX / PIXELS_PER_SECOND;
      const newOffset = startTimelineOffset + deltaSeconds;
      
      // Clamp to valid range
      const clampedOffset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, newOffset));
      setTimelineOffset(clampedOffset);
    };
    
    const handleUp = () => {
      setIsDraggingTimeline(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [timelineOffset]);
  
  // Reset to default
  const handleReset = () => {
    setStartOffset(DEFAULT_START_OFFSET);
    setEndOffset(DEFAULT_END_OFFSET);
    setTimelineOffset(0);
    if (videoRef.current) {
      videoRef.current.currentTime = eventSecond;
    }
  };
  
  // Save handler
  const handleSave = () => {
    onSave?.({ startOffset, endOffset });
  };
  
  // Generate ruler marks
  const rulerMarks = [];
  for (let s = -MAX_OFFSET; s <= MAX_OFFSET; s += 1) {
    const isMajor = s % 5 === 0;
    const isCenter = s === 0;
    rulerMarks.push(
      <div 
        key={s}
        className="absolute flex flex-col items-center"
        style={{ left: offsetToPixel(s) }}
      >
        <div 
          className={cn(
            "w-px",
            isCenter ? "h-4 bg-primary" : isMajor ? "h-3 bg-muted-foreground/50" : "h-2 bg-muted-foreground/30"
          )}
        />
        {isMajor && (
          <span className={cn(
            "text-[10px] mt-0.5",
            isCenter ? "text-primary font-bold" : "text-muted-foreground"
          )}>
            {s > 0 ? `+${s}` : s}s
          </span>
        )}
      </div>
    );
  }
  
  // Selected region
  const startPixel = offsetToPixel(startOffset);
  const endPixel = offsetToPixel(endOffset);
  const regionWidth = endPixel - startPixel;
  
  return (
    <div className="space-y-3">
      {/* Timeline Container */}
      <div 
        ref={containerRef}
        className="relative bg-muted/30 rounded-lg border border-border/50 overflow-hidden"
      >
        {/* Scrollable Timeline */}
        <div 
          ref={timelineRef}
          className={cn(
            "relative overflow-x-auto py-6 px-4",
            isDraggingTimeline && "cursor-grabbing",
            !isDraggingTimeline && "cursor-grab"
          )}
          onMouseDown={handleTimelineDrag}
          style={{ touchAction: 'none' }}
        >
          {/* Timeline Track */}
          <div 
            className="relative h-12"
            style={{ width: timelineWidth }}
          >
            {/* Background Track */}
            <div className="absolute inset-y-0 left-0 right-0 bg-muted/50 rounded" />
            
            {/* Selected Region */}
            <div 
              className="absolute inset-y-0 bg-primary/20 border-y border-primary/40"
              style={{ 
                left: startPixel, 
                width: regionWidth 
              }}
            />
            
            {/* Start Handle */}
            <div
              data-handle="start"
              className={cn(
                "absolute top-0 bottom-0 w-3 cursor-ew-resize z-10",
                "bg-blue-500 hover:bg-blue-400 rounded-l",
                "flex items-center justify-center",
                "transition-colors",
                isDraggingStart && "bg-blue-400"
              )}
              style={{ left: startPixel - 6 }}
              onMouseDown={handleStartDrag}
            >
              <div className="w-0.5 h-6 bg-white/70 rounded" />
            </div>
            
            {/* End Handle */}
            <div
              data-handle="end"
              className={cn(
                "absolute top-0 bottom-0 w-3 cursor-ew-resize z-10",
                "bg-orange-500 hover:bg-orange-400 rounded-r",
                "flex items-center justify-center",
                "transition-colors",
                isDraggingEnd && "bg-orange-400"
              )}
              style={{ left: endPixel - 6 }}
              onMouseDown={handleEndDrag}
            >
              <div className="w-0.5 h-6 bg-white/70 rounded" />
            </div>
            
            {/* Center Playhead (Event Marker) */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-primary z-20"
              style={{ left: centerX }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-transparent border-t-primary" />
            </div>
            
            {/* Ruler */}
            <div className="absolute -top-6 left-0 right-0 h-6">
              {rulerMarks}
            </div>
          </div>
        </div>
      </div>
      
      {/* Info Bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-4">
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-blue-500 mr-1" />
            Início: <strong className="text-foreground">{startOffset.toFixed(1)}s</strong>
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-primary mr-1" />
            Evento: <strong className="text-foreground">0.0s</strong>
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-orange-500 mr-1" />
            Fim: <strong className="text-foreground">+{endOffset.toFixed(1)}s</strong>
          </span>
        </div>
        <span>
          Duração: <strong className="text-foreground">{duration.toFixed(1)}s</strong>
        </span>
      </div>
      
      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleReset}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ↺ Resetar (30s)
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
        >
          💾 Salvar Ajuste
        </button>
      </div>
    </div>
  );
}
