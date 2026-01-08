// Floating indicator showing clip generation progress
import { useState, useEffect } from 'react';
import { useClipSync } from '@/contexts/ClipSyncContext';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { X, Film, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ClipSyncIndicator() {
  const { queue, isProcessing, currentEventId, cancelAll } = useClipSync();
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Only show when there are items in queue
  if (queue.length === 0) return null;
  
  const currentItem = queue.find(q => q.eventId === currentEventId);
  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const processingCount = queue.filter(q => q.status === 'processing').length;
  const completedCount = queue.filter(q => q.status === 'done').length;
  const errorCount = queue.filter(q => q.status === 'error').length;
  
  const overallProgress = queue.length > 0
    ? (completedCount / queue.length) * 100 + 
      (processingCount > 0 && currentItem ? (currentItem.progress / queue.length) : 0)
    : 0;
  
  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 z-50 cursor-pointer"
        onClick={() => setIsMinimized(false)}
      >
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-lg animate-pulse">
            <Film className="h-5 w-5 text-primary-foreground" />
          </div>
          {queue.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent text-accent-foreground text-xs rounded-full flex items-center justify-center font-bold">
              {queue.length}
            </span>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 p-4 shadow-xl border-primary/20 bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Sincronização de Clips</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsMinimized(true)}
          >
            <span className="text-xs">−</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={cancelAll}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      {/* Overall progress */}
      <Progress value={overallProgress} className="h-2 mb-3" />
      
      {/* Current task */}
      {currentItem && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="truncate">{currentItem.message}</span>
        </div>
      )}
      
      {/* Queue summary */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {pendingCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
            {pendingCount} aguardando
          </span>
        )}
        {processingCount > 0 && (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            {processingCount} processando
          </span>
        )}
        {completedCount > 0 && (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            {completedCount} concluído
          </span>
        )}
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" />
            {errorCount} erro
          </span>
        )}
      </div>
    </Card>
  );
}
