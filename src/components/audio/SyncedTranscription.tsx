import { useRef, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface SyncedTranscriptionProps {
  transcription: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

/**
 * Synchronized transcription component that auto-scrolls
 * based on audio playback position
 */
export function SyncedTranscription({
  transcription,
  currentTime,
  duration,
  isPlaying
}: SyncedTranscriptionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Split transcription into lines/segments for highlighting
  const lines = useMemo(() => {
    if (!transcription) return [];
    
    // Split by sentence endings or line breaks
    const segments = transcription
      .split(/(?<=[.!?])\s+|\n+/)
      .filter(line => line.trim().length > 0);
    
    // Calculate approximate time for each line based on word count
    const totalWords = transcription.split(/\s+/).length;
    let cumulativeWords = 0;
    
    return segments.map((text, index) => {
      const wordCount = text.split(/\s+/).length;
      const startProgress = cumulativeWords / totalWords;
      cumulativeWords += wordCount;
      const endProgress = cumulativeWords / totalWords;
      
      return {
        id: index,
        text,
        startProgress,
        endProgress
      };
    });
  }, [transcription]);

  // Calculate current progress
  const progress = duration > 0 ? currentTime / duration : 0;
  
  // Find current line index
  const currentLineIndex = useMemo(() => {
    if (lines.length === 0 || progress === 0) return 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (progress >= lines[i].startProgress && progress < lines[i].endProgress) {
        return i;
      }
    }
    return lines.length - 1;
  }, [lines, progress]);

  // Auto-scroll to current line when playing
  useEffect(() => {
    if (!scrollRef.current || !isPlaying) return;
    
    const container = scrollRef.current;
    const lineElements = container.querySelectorAll('[data-line-id]');
    const currentElement = lineElements[currentLineIndex] as HTMLElement;
    
    if (currentElement) {
      const containerRect = container.getBoundingClientRect();
      const elementRect = currentElement.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top;
      
      // Scroll if element is not visible or near edges
      if (relativeTop < 40 || relativeTop > containerRect.height - 40) {
        currentElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }
  }, [currentLineIndex, isPlaying]);

  const wordCount = transcription ? transcription.split(/\s+/).length : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Transcrição da Narração</p>
        <Badge variant="outline" className="text-xs">
          {wordCount} palavras
        </Badge>
      </div>
      
      <ScrollArea 
        className="h-48 rounded-lg border bg-muted/30"
        viewportRef={scrollRef}
      >
        <div className="p-4 space-y-2">
          {lines.map((line, index) => {
            const isCurrentLine = index === currentLineIndex;
            const isPastLine = index < currentLineIndex;
            
            return (
              <p
                key={line.id}
                data-line-id={line.id}
                className={cn(
                  "text-sm leading-relaxed transition-all duration-300 py-1 px-2 -mx-2 rounded",
                  isCurrentLine && "bg-primary/20 text-foreground font-medium border-l-2 border-primary pl-3",
                  isPastLine && "text-muted-foreground",
                  !isCurrentLine && !isPastLine && "text-muted-foreground/70"
                )}
              >
                {line.text}
              </p>
            );
          })}
        </div>
      </ScrollArea>
      
      {isPlaying && (
        <p className="text-xs text-muted-foreground text-center">
          Linha {currentLineIndex + 1} de {lines.length}
        </p>
      )}
    </div>
  );
}
