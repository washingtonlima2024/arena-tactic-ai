import { cn } from '@/lib/utils';
import { VideoSegment } from './VideoSegmentCard';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

interface CoverageTimelineProps {
  segments: VideoSegment[];
}

export function CoverageTimeline({ segments }: CoverageTimelineProps) {
  const totalMinutes = 90;
  const halfTimeMinute = 45;

  // Calculate coverage for first and second half separately
  const calculateHalfCoverage = (half: 'first' | 'second') => {
    const startRange = half === 'first' ? 0 : halfTimeMinute;
    const endRange = half === 'first' ? halfTimeMinute : totalMinutes;
    const covered = new Set<number>();

    segments.forEach(seg => {
      const start = Math.max(Math.floor(seg.startMinute), startRange);
      const end = Math.min(Math.ceil(seg.endMinute || (seg.startMinute + (seg.durationSeconds ? seg.durationSeconds / 60 : 10))), endRange);
      for (let i = start; i < end && i < endRange; i++) {
        if (i >= startRange) covered.add(i);
      }
    });

    return Math.round((covered.size / halfTimeMinute) * 100);
  };

  const firstHalfCoverage = calculateHalfCoverage('first');
  const secondHalfCoverage = calculateHalfCoverage('second');
  const totalCoverage = Math.round((firstHalfCoverage + secondHalfCoverage) / 2);

  // Get coverage bars for a specific half
  const getHalfBars = (half: 'first' | 'second') => {
    const startRange = half === 'first' ? 0 : halfTimeMinute;
    const endRange = half === 'first' ? halfTimeMinute : totalMinutes;

    return segments.filter(seg => {
      const segStart = seg.startMinute;
      const segEnd = seg.endMinute || (segStart + 10);
      return segStart < endRange && segEnd > startRange;
    }).map(seg => {
      const segStart = Math.max(seg.startMinute, startRange);
      const segEnd = Math.min(seg.endMinute || (seg.startMinute + 10), endRange);
      const left = ((segStart - startRange) / halfTimeMinute) * 100;
      const width = ((segEnd - segStart) / halfTimeMinute) * 100;

      const colors: Record<string, string> = {
        full: 'bg-emerald-500',
        first_half: 'bg-blue-500',
        second_half: 'bg-orange-500',
        clip: 'bg-purple-500',
      };

      return {
        id: seg.id,
        left,
        width: Math.min(width, 100 - left),
        color: colors[seg.videoType] || 'bg-primary',
        title: seg.title || seg.name,
        startMinute: seg.startMinute,
        endMinute: seg.endMinute,
      };
    });
  };

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

    const gaps: { start: number; end: number; half: 'first' | 'second' }[] = [];
    let gapStart: number | null = null;

    covered.forEach((isCovered, minute) => {
      if (!isCovered && gapStart === null) {
        gapStart = minute;
      } else if (isCovered && gapStart !== null) {
        gaps.push({ 
          start: gapStart, 
          end: minute,
          half: gapStart < halfTimeMinute ? 'first' : 'second'
        });
        gapStart = null;
      }
    });

    if (gapStart !== null) {
      gaps.push({ 
        start: gapStart, 
        end: totalMinutes,
        half: gapStart < halfTimeMinute ? 'first' : 'second'
      });
    }

    return gaps;
  };

  const gaps = findGaps();
  const firstHalfBars = getHalfBars('first');
  const secondHalfBars = getHalfBars('second');

  // Gap bars for each half
  const getGapBars = (half: 'first' | 'second') => {
    const startRange = half === 'first' ? 0 : halfTimeMinute;
    const endRange = half === 'first' ? halfTimeMinute : totalMinutes;

    return gaps.filter(gap => {
      return gap.start < endRange && gap.end > startRange;
    }).map((gap, i) => {
      const gapStart = Math.max(gap.start, startRange);
      const gapEnd = Math.min(gap.end, endRange);
      const left = ((gapStart - startRange) / halfTimeMinute) * 100;
      const width = ((gapEnd - gapStart) / halfTimeMinute) * 100;

      return { id: `gap-${half}-${i}`, left, width };
    });
  };

  const firstHalfGaps = getGapBars('first');
  const secondHalfGaps = getGapBars('second');

  return (
    <div className="space-y-4">
      {/* Header with Total Badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Cobertura do Jogo</span>
        <Badge 
          className={cn(
            "font-bold",
            totalCoverage === 100 ? "bg-emerald-500 text-white" : 
            totalCoverage >= 80 ? "bg-yellow-500 text-black" : 
            "bg-destructive text-white"
          )}
        >
          Total: {totalCoverage}%
        </Badge>
      </div>

      {/* Split Timeline */}
      <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
        {/* First Half */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-400">1º Tempo</span>
            <span className={cn(
              "text-xs font-bold",
              firstHalfCoverage === 100 ? "text-emerald-400" : "text-muted-foreground"
            )}>
              {firstHalfCoverage}%
            </span>
          </div>
          <div className="h-8 bg-muted/30 rounded-lg relative overflow-hidden border border-blue-500/30">
            {/* Coverage Bars */}
            {firstHalfBars.map(bar => (
              <div
                key={bar.id}
                className={cn("absolute top-1 bottom-1 rounded", bar.color)}
                style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                title={`${bar.title}: ${bar.startMinute}' - ${bar.endMinute}'`}
              />
            ))}
            {/* Gap indicators */}
            {firstHalfGaps.map(gap => (
              <div
                key={gap.id}
                className="absolute top-1 bottom-1 border-2 border-dashed border-destructive/60 rounded"
                style={{ left: `${gap.left}%`, width: `${gap.width}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0'</span>
            <span>45'</span>
          </div>
        </div>

        {/* Interval Marker */}
        <div className="flex flex-col items-center justify-center px-1">
          <div className="w-px h-8 bg-border" />
          <span className="text-[10px] font-medium text-muted-foreground mt-1">INT</span>
        </div>

        {/* Second Half */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-orange-400">2º Tempo</span>
            <span className={cn(
              "text-xs font-bold",
              secondHalfCoverage === 100 ? "text-emerald-400" : "text-muted-foreground"
            )}>
              {secondHalfCoverage}%
            </span>
          </div>
          <div className="h-8 bg-muted/30 rounded-lg relative overflow-hidden border border-orange-500/30">
            {/* Coverage Bars */}
            {secondHalfBars.map(bar => (
              <div
                key={bar.id}
                className={cn("absolute top-1 bottom-1 rounded", bar.color)}
                style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                title={`${bar.title}: ${bar.startMinute}' - ${bar.endMinute}'`}
              />
            ))}
            {/* Gap indicators */}
            {secondHalfGaps.map(gap => (
              <div
                key={gap.id}
                className="absolute top-1 bottom-1 border-2 border-dashed border-destructive/60 rounded"
                style={{ left: `${gap.left}%`, width: `${gap.width}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>45'</span>
            <span>90'</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span>1º Tempo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-orange-500" />
          <span>2º Tempo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-emerald-500" />
          <span>Completo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-purple-500" />
          <span>Trecho</span>
        </div>
        {gaps.length > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded border-2 border-dashed border-destructive/60" />
            <span className="text-destructive">Sem cobertura</span>
          </div>
        )}
      </div>

      {/* Gap warnings */}
      {gaps.length > 0 && (
        <div className="flex items-start gap-2 text-sm bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <span className="text-destructive font-medium">Atenção</span>
            <span className="text-muted-foreground"> - Falta cobertura: </span>
            {gaps.map((gap, i) => (
              <span key={i}>
                {i > 0 && ', '}
                <strong className={gap.half === 'first' ? 'text-blue-400' : 'text-orange-400'}>
                  {gap.half === 'first' ? '1º Tempo' : '2º Tempo'}: {gap.start}' - {gap.end}'
                </strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
