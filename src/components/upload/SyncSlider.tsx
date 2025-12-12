import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SyncSliderProps {
  startMinute: number;
  endMinute: number;
  onStartChange: (minute: number) => void;
  onEndChange: (minute: number) => void;
  maxMinute?: number;
  className?: string;
}

export function SyncSlider({ 
  startMinute, 
  endMinute, 
  onStartChange, 
  onEndChange, 
  maxMinute = 120,
  className 
}: SyncSliderProps) {
  // Quick select buttons
  const quickSelects = [
    { label: "0'", start: 0, end: 45 },
    { label: "45'", start: 45, end: 90 },
    { label: "45'+", start: 45, end: 90 },
    { label: "90'", start: 0, end: 90 },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      {/* Quick Select Buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {quickSelects.map((qs, i) => (
          <Button
            key={i}
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-7 px-2.5 text-xs",
              startMinute === qs.start && endMinute === qs.end && "bg-primary text-primary-foreground"
            )}
            onClick={() => {
              onStartChange(qs.start);
              onEndChange(qs.end);
            }}
          >
            {qs.label}
          </Button>
        ))}
      </div>

      {/* Visual Slider */}
      <div className="relative pt-4 pb-6">
        {/* Timeline Background */}
        <div className="h-3 bg-muted/50 rounded-full relative overflow-hidden">
          {/* First Half Zone */}
          <div 
            className="absolute top-0 bottom-0 left-0 bg-blue-500/20"
            style={{ width: '50%' }}
          />
          {/* Second Half Zone */}
          <div 
            className="absolute top-0 bottom-0 right-0 bg-orange-500/20"
            style={{ width: '50%' }}
          />
          {/* Half-time marker */}
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-border z-10" />
          
          {/* Selected Range */}
          <div 
            className="absolute top-0 bottom-0 bg-primary/60 rounded-full"
            style={{
              left: `${(startMinute / maxMinute) * 100}%`,
              width: `${((endMinute - startMinute) / maxMinute) * 100}%`,
            }}
          />
        </div>

        {/* Start Handle */}
        <div className="mt-2">
          <Slider
            value={[startMinute]}
            min={0}
            max={endMinute - 1}
            step={1}
            onValueChange={([v]) => onStartChange(v)}
            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:bg-blue-500"
          />
        </div>

        {/* End Handle */}
        <div className="mt-1">
          <Slider
            value={[endMinute]}
            min={startMinute + 1}
            max={maxMinute}
            step={1}
            onValueChange={([v]) => onEndChange(v)}
            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:bg-orange-500"
          />
        </div>

        {/* Time Labels */}
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>0'</span>
          <span>45' (INT)</span>
          <span>90'</span>
        </div>
      </div>

      {/* Current Selection Display */}
      <div className="flex items-center justify-center gap-3 text-sm">
        <span className="font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded">
          {startMinute}'
        </span>
        <span className="text-muted-foreground">→</span>
        <span className="font-mono bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded">
          {endMinute}'
        </span>
        <span className="text-xs text-muted-foreground ml-2">
          ({endMinute - startMinute} min)
        </span>
      </div>
    </div>
  );
}
