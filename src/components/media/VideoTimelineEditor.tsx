import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface VideoTimelineEditorProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  eventSecond: number;       // Segundo do vídeo onde o evento ocorre
  videoDuration: number;     // Duração total do vídeo
  currentVideoTime?: number; // Tempo atual do vídeo para playhead
  mode?: 'relative' | 'absolute'; // Modo: relative usa offsets, absolute usa timestamps
  initialTrim?: {
    startOffset: number;     // Offset do início (default -15)
    endOffset: number;       // Offset do fim (default +15)
  };
  // Absolute mode props
  absoluteStart?: number;    // Tempo absoluto de início (para modo absolute)
  absoluteEnd?: number;      // Tempo absoluto de fim (para modo absolute)
  onAbsoluteChange?: (start: number, end: number) => void; // Callback para mudanças absolutas
  onTrimChange?: (trim: { startOffset: number; endOffset: number }) => void;
  onSave?: (trim: { startOffset: number; endOffset: number }) => void;
  onAbsoluteSave?: (start: number, end: number) => void; // Save para modo absolute
  onSeek?: (time: number) => void; // Callback para seek quando clicar na timeline
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
  currentVideoTime,
  mode = 'relative',
  initialTrim,
  absoluteStart: propAbsoluteStart,
  absoluteEnd: propAbsoluteEnd,
  onAbsoluteChange,
  onTrimChange,
  onSave,
  onAbsoluteSave,
  onSeek
}: VideoTimelineEditorProps) {
  // Calculate effective eventSecond that stays within video bounds
  // Critical when timestamp exceeds duration (e.g., highlights videos)
  const effectiveEventSecond = eventSecond > videoDuration 
    ? Math.min(videoDuration / 2, 30)  // Fallback to center or 30s
    : Math.max(0, eventSecond);
  
  // Relative mode state
  const [startOffset, setStartOffset] = useState(initialTrim?.startOffset ?? DEFAULT_START_OFFSET);
  const [endOffset, setEndOffset] = useState(initialTrim?.endOffset ?? DEFAULT_END_OFFSET);
  
  // Absolute mode state - store absolute timestamps (using effectiveEventSecond)
  const [absStart, setAbsStart] = useState(propAbsoluteStart ?? Math.max(0, effectiveEventSecond - 15));
  const [absEnd, setAbsEnd] = useState(propAbsoluteEnd ?? Math.min(videoDuration, effectiveEventSecond + 15));
  
  const [isDraggingStart, setIsDraggingStart] = useState(false);
  const [isDraggingEnd, setIsDraggingEnd] = useState(false);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [timelineOffset, setTimelineOffset] = useState(0);
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Effective offset for absolute mode - calculate MAX_OFFSET dynamically
  const effectiveMaxOffset = mode === 'absolute' 
    ? Math.max(60, Math.ceil(videoDuration / 2)) 
    : MAX_OFFSET;
  
  const duration = mode === 'absolute' 
    ? absEnd - absStart 
    : endOffset - startOffset;
  
  // Notify parent of changes (relative mode)
  useEffect(() => {
    if (mode === 'relative') {
      onTrimChange?.({ startOffset, endOffset });
    }
  }, [startOffset, endOffset, onTrimChange, mode]);
  
  // Notify parent of absolute changes
  useEffect(() => {
    if (mode === 'absolute') {
      onAbsoluteChange?.(absStart, absEnd);
    }
  }, [absStart, absEnd, onAbsoluteChange, mode]);
  
  // Sync video position with timeline dragging
  useEffect(() => {
    if (videoRef.current && !isDraggingStart && !isDraggingEnd) {
      const targetTime = Math.max(0, Math.min(videoDuration, effectiveEventSecond + timelineOffset));
      videoRef.current.currentTime = targetTime;
    }
  }, [timelineOffset, effectiveEventSecond, videoDuration, videoRef, isDraggingStart, isDraggingEnd]);
  
  // Calculate timeline width based on offsets
  const timelineWidth = (effectiveMaxOffset * 2 + 10) * PIXELS_PER_SECOND;
  const centerX = timelineWidth / 2;
  
  // Convert offset to pixel position
  const offsetToPixel = useCallback((offset: number) => {
    return centerX + (offset * PIXELS_PER_SECOND);
  }, [centerX]);
  
  // Convert pixel position to offset
  const pixelToOffset = useCallback((pixel: number) => {
    return (pixel - centerX) / PIXELS_PER_SECOND;
  }, [centerX]);
  
  // Get effective start/end for rendering (works for both modes)
  const effectiveStartOffset = mode === 'absolute' ? absStart - effectiveEventSecond : startOffset;
  const effectiveEndOffset = mode === 'absolute' ? absEnd - effectiveEventSecond : endOffset;
  
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
      
      if (mode === 'absolute') {
        // In absolute mode, convert offset to absolute time
        const newAbsStart = effectiveEventSecond + newOffset;
        const maxStart = absEnd - MIN_CLIP_DURATION;
        const clampedStart = Math.max(0, Math.min(newAbsStart, maxStart));
        setAbsStart(clampedStart);
        
        // Update video preview
        if (videoRef.current) {
          videoRef.current.currentTime = clampedStart;
        }
      } else {
        // Relative mode
        const maxStart = endOffset - MIN_CLIP_DURATION;
        const clampedOffset = Math.max(-MAX_OFFSET, Math.min(newOffset, maxStart));
        setStartOffset(clampedOffset);
        
        // Update video preview
        if (videoRef.current) {
          const previewTime = Math.max(0, effectiveEventSecond + clampedOffset);
          videoRef.current.currentTime = previewTime;
        }
      }
    };
    
    const handleUp = () => {
      setIsDraggingStart(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [mode, endOffset, absEnd, effectiveEventSecond, pixelToOffset, videoRef]);
  
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
      
      if (mode === 'absolute') {
        // In absolute mode, convert offset to absolute time
        const newAbsEnd = effectiveEventSecond + newOffset;
        const minEnd = absStart + MIN_CLIP_DURATION;
        const clampedEnd = Math.min(videoDuration, Math.max(newAbsEnd, minEnd));
        setAbsEnd(clampedEnd);
        
        // Update video preview
        if (videoRef.current) {
          videoRef.current.currentTime = clampedEnd;
        }
      } else {
        // Relative mode
        const minEnd = startOffset + MIN_CLIP_DURATION;
        const clampedOffset = Math.min(MAX_OFFSET, Math.max(newOffset, minEnd));
        setEndOffset(clampedOffset);
        
        // Update video preview
        if (videoRef.current) {
          const previewTime = Math.max(0, effectiveEventSecond + clampedOffset);
          videoRef.current.currentTime = previewTime;
        }
      }
    };
    
    const handleUp = () => {
      setIsDraggingEnd(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [mode, startOffset, absStart, effectiveEventSecond, videoDuration, pixelToOffset, videoRef]);
  
  // Handle click on timeline to seek
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    // Don't process if clicked on handles
    if ((e.target as HTMLElement).dataset.handle) return;
    
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left + timelineRef.current!.scrollLeft;
    const clickedOffset = pixelToOffset(x);
    
    // Move video to clicked position
    const targetTime = Math.max(0, Math.min(videoDuration, effectiveEventSecond + clickedOffset));
    
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
    
    onSeek?.(targetTime);
  }, [eventSecond, videoDuration, pixelToOffset, videoRef, onSeek]);
  
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
    if (mode === 'absolute') {
      setAbsStart(Math.max(0, effectiveEventSecond - 15));
      setAbsEnd(Math.min(videoDuration, effectiveEventSecond + 15));
    } else {
      setStartOffset(DEFAULT_START_OFFSET);
      setEndOffset(DEFAULT_END_OFFSET);
    }
    setTimelineOffset(0);
    if (videoRef.current) {
      videoRef.current.currentTime = effectiveEventSecond;
    }
  };
  
  // Save handler
  const handleSave = () => {
    if (mode === 'absolute') {
      onAbsoluteSave?.(absStart, absEnd);
    } else {
      onSave?.({ startOffset, endOffset });
    }
  };
  
  // Generate ruler marks
  const rulerMarks = [];
  for (let s = -effectiveMaxOffset; s <= effectiveMaxOffset; s += mode === 'absolute' ? 5 : 1) {
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
            {mode === 'absolute' 
              ? `${Math.floor((effectiveEventSecond + s) / 60)}:${String(Math.floor((effectiveEventSecond + s) % 60)).padStart(2, '0')}`
              : s > 0 ? `+${s}` : `${s}`}s
          </span>
        )}
      </div>
    );
  }
  
  // Selected region
  const startPixel = offsetToPixel(effectiveStartOffset);
  const endPixel = offsetToPixel(effectiveEndOffset);
  const regionWidth = endPixel - startPixel;
  
  // Calculate playhead position from currentVideoTime
  const playheadOffset = currentVideoTime !== undefined 
    ? currentVideoTime - effectiveEventSecond 
    : undefined;
  const playheadPixel = playheadOffset !== undefined 
    ? offsetToPixel(playheadOffset) 
    : undefined;
  const isPlayheadVisible = playheadOffset !== undefined && 
    playheadOffset >= -effectiveMaxOffset && 
    playheadOffset <= effectiveMaxOffset;
  
  return (
    <div className="space-y-2">
      {/* Timeline Container */}
      <div 
        ref={containerRef}
        className="relative bg-muted/30 rounded-lg border border-border/50 overflow-hidden"
      >
        {/* Scrollable Timeline */}
        <div 
          ref={timelineRef}
          className={cn(
            "relative overflow-x-auto py-4 px-4",
            isDraggingTimeline && "cursor-grabbing",
            !isDraggingTimeline && "cursor-pointer"
          )}
          onMouseDown={handleTimelineDrag}
          onClick={handleTimelineClick}
          style={{ touchAction: 'none' }}
        >
          {/* Timeline Track */}
          <div 
            className="relative h-10"
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
              <div className="w-0.5 h-5 bg-white/70 rounded" />
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
              <div className="w-0.5 h-5 bg-white/70 rounded" />
            </div>
            
            {/* Current Playhead (follows video currentTime) */}
            {isPlayheadVisible && playheadPixel !== undefined && (
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-30 transition-[left] duration-100 ease-linear pointer-events-none"
                style={{ left: playheadPixel }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-green-500 rounded-full shadow-sm" />
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-green-500 rounded-full shadow-sm" />
              </div>
            )}
            
            {/* Center Event Marker */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
              style={{ left: centerX }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-transparent border-t-primary" />
            </div>
            
            {/* Ruler */}
            <div className="absolute -top-5 left-0 right-0 h-5">
              {rulerMarks}
            </div>
          </div>
        </div>
      </div>
      
      {/* Info Bar + Actions */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <div className="flex items-center gap-3">
          <span>
            <span className="inline-block w-1.5 h-1.5 rounded-sm bg-blue-500 mr-1" />
            <strong className="text-foreground">
              {mode === 'absolute' 
                ? `${Math.floor(absStart / 60)}:${String(Math.floor(absStart % 60)).padStart(2, '0')}`
                : `${startOffset.toFixed(1)}s`}
            </strong>
          </span>
          <span>
            <span className="inline-block w-1.5 h-1.5 rounded-sm bg-primary mr-1" />
            <strong className="text-foreground">
              {mode === 'absolute' 
                ? `${Math.floor(effectiveEventSecond / 60)}:${String(Math.floor(effectiveEventSecond % 60)).padStart(2, '0')}`
                : '0.0s'}
            </strong>
          </span>
          <span>
            <span className="inline-block w-1.5 h-1.5 rounded-sm bg-orange-500 mr-1" />
            <strong className="text-foreground">
              {mode === 'absolute' 
                ? `${Math.floor(absEnd / 60)}:${String(Math.floor(absEnd % 60)).padStart(2, '0')}`
                : `+${endOffset.toFixed(1)}s`}
            </strong>
          </span>
          <span className="text-muted-foreground">
            ({duration.toFixed(1)}s)
          </span>
          {isPlayheadVisible && playheadOffset !== undefined && (
            <span className="text-green-500 font-medium">
              ▶ {playheadOffset >= 0 ? '+' : ''}{playheadOffset.toFixed(1)}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ↺ Resetar
          </button>
          <button
            onClick={handleSave}
            className="px-2.5 py-1 text-[11px] font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            💾 Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
