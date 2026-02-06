// Simple indicator showing clip status for current match
import { useClipSync } from '@/contexts/ClipSyncContext';
import { Card } from '@/components/ui/card';
import { Film, CheckCircle2, Clock } from 'lucide-react';

export function ClipSyncIndicator() {
  const { pendingCount, readyCount } = useClipSync();
  
  // Only show when there are pending clips
  if (pendingCount === 0) return null;
  
  return (
    <Card className="fixed bottom-20 right-4 z-40 px-4 py-3 shadow-lg border-primary/20 bg-background/95 backdrop-blur">
      <div className="flex items-center gap-3">
        <Film className="h-4 w-4 text-primary" />
        
        <div className="flex items-center gap-3 text-xs">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {pendingCount} pendentes
            </span>
          )}
          {readyCount > 0 && (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              {readyCount} prontos
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
