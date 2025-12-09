import { useEffect, useRef } from 'react';
import { AnalysisJob } from '@/types/arena';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotificationSound } from '@/hooks/useNotificationSound';

interface AnalysisProgressProps {
  job: AnalysisJob;
}

export function AnalysisProgress({ job }: AnalysisProgressProps) {
  const { playSuccessSound, playErrorSound } = useNotificationSound();
  const previousStatusRef = useRef<string | null>(null);

  // Play sound when analysis completes
  useEffect(() => {
    if (previousStatusRef.current === 'processing' && job.status === 'completed') {
      playSuccessSound();
    } else if (previousStatusRef.current === 'processing' && job.status === 'failed') {
      playErrorSound();
    }
    previousStatusRef.current = job.status ?? null;
  }, [job.status, playSuccessSound, playErrorSound]);
  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <Card variant="glow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Análise em Andamento
          </CardTitle>
          <span className="text-2xl font-bold text-primary">{job.progress}%</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <Progress value={job.progress} className="h-3" />
          <p className="text-sm text-muted-foreground">{job.currentStep}</p>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {job.steps.map((step, index) => (
            <div 
              key={index}
              className={cn(
                "flex items-center gap-3 rounded-lg p-3 transition-colors",
                step.status === 'processing' && "bg-primary/5 border border-primary/20",
                step.status === 'completed' && "opacity-60"
              )}
            >
              {getStepIcon(step.status)}
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className={cn(
                    "text-sm font-medium",
                    step.status === 'pending' && "text-muted-foreground"
                  )}>
                    {step.name}
                  </p>
                  <span className={cn(
                    "text-xs tabular-nums",
                    step.status === 'completed' && "text-success",
                    step.status === 'processing' && "text-primary",
                    step.status === 'pending' && "text-muted-foreground"
                  )}>
                    {step.progress}%
                  </span>
                </div>
                <Progress 
                  value={step.progress} 
                  className={cn(
                    "h-1.5",
                    step.status === 'pending' && "opacity-40"
                  )} 
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
