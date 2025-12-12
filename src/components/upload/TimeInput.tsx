import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimeInputProps {
  value: number; // Total seconds
  onChange: (seconds: number) => void;
  label?: string;
  className?: string;
  showButtons?: boolean;
}

export function TimeInput({ value, onChange, label, className, showButtons = true }: TimeInputProps) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  const updateTime = (h: number, m: number, s: number) => {
    const total = h * 3600 + m * 60 + s;
    onChange(Math.max(0, total));
  };

  const adjust = (delta: number) => {
    onChange(Math.max(0, value + delta));
  };

  return (
    <div className={cn("space-y-1", className)}>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      <div className="flex items-center gap-1">
        {showButtons && (
          <Button 
            type="button"
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 shrink-0"
            onClick={() => adjust(-60)}
          >
            <Minus className="h-3 w-3" />
          </Button>
        )}
        
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-1">
          <Input
            type="number"
            min={0}
            max={23}
            value={hours.toString().padStart(2, '0')}
            onChange={(e) => updateTime(parseInt(e.target.value) || 0, minutes, seconds)}
            className="w-10 h-7 text-center text-sm p-0 border-0 bg-transparent"
          />
          <span className="text-muted-foreground font-mono">:</span>
          <Input
            type="number"
            min={0}
            max={59}
            value={minutes.toString().padStart(2, '0')}
            onChange={(e) => updateTime(hours, parseInt(e.target.value) || 0, seconds)}
            className="w-10 h-7 text-center text-sm p-0 border-0 bg-transparent"
          />
          <span className="text-muted-foreground font-mono">:</span>
          <Input
            type="number"
            min={0}
            max={59}
            value={seconds.toString().padStart(2, '0')}
            onChange={(e) => updateTime(hours, minutes, parseInt(e.target.value) || 0)}
            className="w-10 h-7 text-center text-sm p-0 border-0 bg-transparent"
          />
        </div>

        {showButtons && (
          <Button 
            type="button"
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 shrink-0"
            onClick={() => adjust(60)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

// Helper to format seconds as MM:SS or HH:MM:SS
export function formatTimeFromSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Helper to convert minutes to seconds
export function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}

// Helper to convert seconds to minutes
export function secondsToMinutes(seconds: number): number {
  return Math.floor(seconds / 60);
}
