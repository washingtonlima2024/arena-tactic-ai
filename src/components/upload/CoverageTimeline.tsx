import { cn } from '@/lib/utils';
import { VideoSegment } from './VideoSegmentCard';

interface CoverageTimelineProps {
  segments: VideoSegment[];
}

export function CoverageTimeline({ segments }: CoverageTimelineProps) {
  const totalMinutes = 90;
  const markers = [0, 15, 30, 45, 60, 75, 90];

  // Calculate coverage for each segment
  const getCoverageStyle = (segment: VideoSegment) => {
    const start = segment.startMinute;
    const end = segment.endMinute || (start + (segment.durationSeconds ? segment.durationSeconds / 60 : 10));
    const left = (start / totalMinutes) * 100;
    const width = ((end - start) / totalMinutes) * 100;

    const colors: Record<string, string> = {
      full: 'bg-emerald-500/70',
      first_half: 'bg-blue-500/70',
      second_half: 'bg-orange-500/70',
      clip: 'bg-purple-500/70',
    };

    return {
      left: `${left}%`,
      width: `${Math.min(width, 100 - left)}%`,
      className: colors[segment.videoType] || 'bg-primary/70',
    };
  };

  // Calculate total coverage
  const calculateCoverage = () => {
    const covered = new Set<number>();
    segments.forEach(seg => {
      const start = Math.floor(seg.startMinute);
      const end = Math.ceil(seg.endMinute || (start + (seg.durationSeconds ? seg.durationSeconds / 60 : 10)));
      for (let i = start; i < end && i <= totalMinutes; i++) {
        covered.add(i);
      }
    });
    return Math.round((covered.size / totalMinutes) * 100);
  };

  const coveragePercentage = calculateCoverage();

  // Find gaps in coverage
  const findGaps = () => {
    const covered = new Array(totalMinutes).fill(false);
    segments.forEach(seg => {
      const start = Math.floor(seg.startMinute);
      const end = Math.ceil(seg.endMinute || (start + (seg.durationSeconds ? seg.durationSeconds / 60 : 10)));
      for (let i = start; i < end && i < totalMinutes; i++) {
        covered[i] = true;
      }
    });

    const gaps: { start: number; end: number }[] = [];
    let gapStart: number | null = null;

    covered.forEach((isCovered, minute) => {
      if (!isCovered && gapStart === null) {
        gapStart = minute;
      } else if (isCovered && gapStart !== null) {
        gaps.push({ start: gapStart, end: minute });
        gapStart = null;
      }
    });

    if (gapStart !== null) {
      gaps.push({ start: gapStart, end: totalMinutes });
    }

    return gaps;
  };

  const gaps = findGaps();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Cobertura do Jogo</span>
        <span className={cn(
          "text-sm font-bold",
          coveragePercentage === 100 ? "text-emerald-400" : 
          coveragePercentage >= 80 ? "text-yellow-400" : "text-muted-foreground"
        )}>
          {coveragePercentage}%
        </span>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Background */}
        <div className="h-8 bg-muted/30 rounded-lg relative overflow-hidden">
          {/* Half-time marker */}
          <div 
            className="absolute top-0 bottom-0 w-px bg-border z-10"
            style={{ left: '50%' }}
          />

          {/* Coverage bars */}
          {segments.map((segment, i) => {
            const style = getCoverageStyle(segment);
            return (
              <div
                key={segment.id}
                className={cn(
                  "absolute top-1 bottom-1 rounded transition-all",
                  style.className
                )}
                style={{ left: style.left, width: style.width }}
                title={`${segment.title || segment.name}: ${segment.startMinute}' - ${segment.endMinute || '?'}'`}
              />
            );
          })}

          {/* Gap indicators */}
          {gaps.map((gap, i) => (
            <div
              key={`gap-${i}`}
              className="absolute top-1 bottom-1 border-2 border-dashed border-destructive/50 rounded pointer-events-none"
              style={{
                left: `${(gap.start / totalMinutes) * 100}%`,
                width: `${((gap.end - gap.start) / totalMinutes) * 100}%`,
              }}
            />
          ))}
        </div>

        {/* Time markers */}
        <div className="flex justify-between mt-1">
          {markers.map((minute) => (
            <span key={minute} className="text-xs text-muted-foreground">
              {minute}'
            </span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-500/70" />
          <span>1º Tempo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-orange-500/70" />
          <span>2º Tempo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-emerald-500/70" />
          <span>Completo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-purple-500/70" />
          <span>Trecho</span>
        </div>
        {gaps.length > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded border-2 border-dashed border-destructive/50" />
            <span className="text-destructive">Sem cobertura</span>
          </div>
        )}
      </div>

      {/* Gap warnings */}
      {gaps.length > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-2">
          <span className="text-destructive font-medium">Atenção:</span> Falta cobertura entre{' '}
          {gaps.map((gap, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <strong>{gap.start}' - {gap.end}'</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
