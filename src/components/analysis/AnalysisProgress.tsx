import { useEffect, useRef, useState, useMemo } from 'react';
import { AnalysisJob } from '@/types/arena';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotificationSound } from '@/hooks/useNotificationSound';

interface AnalysisProgressProps {
  job: AnalysisJob;
}

// Estimated time per step in seconds (based on typical video analysis)
const STEP_TIME_ESTIMATES: Record<string, number> = {
  'Preparação do vídeo': 5,
  'Download do vídeo': 30,
  'Extração de frames': 15,
  'Análise visual (kakttus Vision)': 120, // Most time-consuming
  'Extração de áudio': 20,
  'Transcrição (kakttus.ai)': 60,
  'Identificação de eventos': 30,
  'Análise tática': 20,
  'Finalização': 5,
};

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Concluindo...';
  if (seconds < 60) return `~${Math.ceil(seconds)}s restantes`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (secs === 0) return `~${minutes}min restantes`;
  return `~${minutes}min ${secs}s restantes`;
}

export function AnalysisProgress({ job }: AnalysisProgressProps) {
  const { playSuccessSound, playErrorSound } = useNotificationSound();
  const previousStatusRef = useRef<string | null>(null);
  const [startTime] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Calculate estimated time remaining
  const estimatedTimeRemaining = useMemo(() => {
    let remainingSeconds = 0;
    let foundCurrentStep = false;
    
    for (const step of job.steps) {
      const stepTime = STEP_TIME_ESTIMATES[step.name] || 15;
      
      if (step.status === 'processing') {
        foundCurrentStep = true;
        // For current step, estimate based on progress
        const stepProgressFraction = step.progress / 100;
        remainingSeconds += stepTime * (1 - stepProgressFraction);
      } else if (step.status === 'pending' && foundCurrentStep) {
        // Add full time for pending steps after current
        remainingSeconds += stepTime;
      }
    }
    
    return remainingSeconds;
  }, [job.steps]);

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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{formatTimeRemaining(estimatedTimeRemaining)}</span>
            </div>
            <span className="text-2xl font-bold text-primary">{job.progress}%</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Tempo decorrido: {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
        </p>
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
