import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TimeInput } from './TimeInput';
import { Clock } from 'lucide-react';

interface MatchTimes {
  firstHalfStart: number; // seconds
  firstHalfEnd: number;
  secondHalfStart: number;
  secondHalfEnd: number;
}

interface MatchTimesConfigProps {
  times: MatchTimes;
  onChange: (times: MatchTimes) => void;
}

export function MatchTimesConfig({ times, onChange }: MatchTimesConfigProps) {
  const firstHalfDuration = times.firstHalfEnd - times.firstHalfStart;
  const secondHalfDuration = times.secondHalfEnd - times.secondHalfStart;
  const totalDuration = firstHalfDuration + secondHalfDuration;
  
  // Expected match duration (90 minutes = 5400 seconds)
  const expectedDuration = 90 * 60;
  
  const firstHalfProgress = Math.min(100, (firstHalfDuration / (45 * 60)) * 100);
  const secondHalfProgress = Math.min(100, (secondHalfDuration / (45 * 60)) * 100);

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" />
          Tempos da Partida
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* First Half */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-400">1º Tempo</span>
            <span className="text-xs text-muted-foreground">
              {Math.floor(firstHalfDuration / 60)} min
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TimeInput
              label="Início"
              value={times.firstHalfStart}
              onChange={(v) => onChange({ ...times, firstHalfStart: v })}
            />
            <TimeInput
              label="Fim"
              value={times.firstHalfEnd}
              onChange={(v) => onChange({ ...times, firstHalfEnd: v })}
            />
          </div>
          <Progress value={firstHalfProgress} className="h-1.5 bg-muted [&>div]:bg-blue-500" />
        </div>

        {/* Second Half */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-orange-400">2º Tempo</span>
            <span className="text-xs text-muted-foreground">
              {Math.floor(secondHalfDuration / 60)} min
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TimeInput
              label="Início"
              value={times.secondHalfStart}
              onChange={(v) => onChange({ ...times, secondHalfStart: v })}
            />
            <TimeInput
              label="Fim"
              value={times.secondHalfEnd}
              onChange={(v) => onChange({ ...times, secondHalfEnd: v })}
            />
          </div>
          <Progress value={secondHalfProgress} className="h-1.5 bg-muted [&>div]:bg-orange-500" />
        </div>

        {/* Total Summary */}
        <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
          <span>Duração Total</span>
          <span className={totalDuration >= expectedDuration ? 'text-emerald-400' : 'text-yellow-400'}>
            {Math.floor(totalDuration / 60)} minutos
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// Default match times (standard 90-minute match)
export const defaultMatchTimes: MatchTimes = {
  firstHalfStart: 0,
  firstHalfEnd: 45 * 60, // 45 minutes in seconds
  secondHalfStart: 45 * 60,
  secondHalfEnd: 90 * 60, // 90 minutes in seconds
};

export type { MatchTimes };
