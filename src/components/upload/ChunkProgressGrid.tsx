/**
 * Arena Play - Chunk Progress Grid
 * Visual display of individual chunk upload status.
 */

import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';

interface ChunkProgressGridProps {
  totalChunks: number;
  currentChunk: number;
  completedChunks?: Set<number>;
  className?: string;
}

export function ChunkProgressGrid({
  totalChunks,
  currentChunk,
  completedChunks,
  className
}: ChunkProgressGridProps) {
  // If no completedChunks provided, assume sequential completion
  const isCompleted = (index: number): boolean => {
    if (completedChunks) {
      return completedChunks.has(index);
    }
    return index < currentChunk - 1;
  };

  const isCurrent = (index: number): boolean => {
    return index === currentChunk - 1;
  };

  // Limit display for very large chunk counts
  const maxDisplay = 100;
  const displayAll = totalChunks <= maxDisplay;
  
  // Group chunks for large files
  const groupSize = displayAll ? 1 : Math.ceil(totalChunks / maxDisplay);
  const groups = displayAll ? totalChunks : Math.ceil(totalChunks / groupSize);

  const getGroupStatus = (groupIndex: number): 'pending' | 'partial' | 'complete' | 'current' => {
    const startChunk = groupIndex * groupSize;
    const endChunk = Math.min(startChunk + groupSize, totalChunks);
    
    let completed = 0;
    let hasCurrent = false;
    
    for (let i = startChunk; i < endChunk; i++) {
      if (isCompleted(i)) completed++;
      if (isCurrent(i)) hasCurrent = true;
    }
    
    if (hasCurrent) return 'current';
    if (completed === endChunk - startChunk) return 'complete';
    if (completed > 0) return 'partial';
    return 'pending';
  };

  return (
    <div className={cn('', className)}>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: displayAll ? totalChunks : groups }).map((_, i) => {
          const status = displayAll 
            ? (isCompleted(i) ? 'complete' : isCurrent(i) ? 'current' : 'pending')
            : getGroupStatus(i);

          return (
            <div
              key={i}
              className={cn(
                'w-6 h-6 rounded flex items-center justify-center text-xs transition-colors',
                {
                  'bg-muted text-muted-foreground': status === 'pending',
                  'bg-primary/20 text-primary': status === 'partial',
                  'bg-primary text-primary-foreground': status === 'complete',
                  'bg-yellow-500 text-yellow-950': status === 'current'
                }
              )}
              title={displayAll 
                ? `Parte ${i + 1}` 
                : `Partes ${i * groupSize + 1}-${Math.min((i + 1) * groupSize, totalChunks)}`
              }
            >
              {status === 'complete' ? (
                <Check className="h-3 w-3" />
              ) : status === 'current' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : displayAll ? (
                i + 1
              ) : null}
            </div>
          );
        })}
      </div>
      
      {!displayAll && (
        <p className="text-xs text-muted-foreground mt-2">
          Cada bloco representa {groupSize} partes ({totalChunks} partes no total)
        </p>
      )}
    </div>
  );
}

export default ChunkProgressGrid;
