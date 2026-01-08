import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  Clock, 
  FileVideo,
  FileAudio,
  MessageSquare,
  Brain,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProcessingStage = 
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'extracting_audio'
  | 'transcribing'
  | 'analyzing'
  | 'detecting_events'
  | 'saving'
  | 'complete'
  | 'error';

export interface ProcessingStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  detail?: string;
}

interface ProcessingProgressProps {
  stage: ProcessingStage;
  currentStep?: string;
  progress: number;
  message?: string;
  error?: string;
  transcriptionProgress?: string;
  isTranscribing?: boolean;
  isAnalyzing?: boolean;
}

const PROCESSING_STEPS: Omit<ProcessingStep, 'status' | 'progress' | 'detail'>[] = [
  { id: 'prepare', name: 'Preparação', description: 'Validando arquivos e configurações' },
  { id: 'upload', name: 'Upload', description: 'Enviando vídeo para processamento' },
  { id: 'audio', name: 'Extração de Áudio', description: 'Extraindo faixa de áudio com FFmpeg' },
  { id: 'transcribe', name: 'Transcrição', description: 'Transcrevendo áudio com Whisper AI' },
  { id: 'analyze', name: 'Análise', description: 'Identificando eventos com IA' },
  { id: 'save', name: 'Salvando', description: 'Persistindo eventos no banco' },
];

function getStageIndex(stage: ProcessingStage): number {
  switch (stage) {
    case 'idle': return -1;
    case 'preparing': return 0;
    case 'uploading': return 1;
    case 'extracting_audio': return 2;
    case 'transcribing': return 3;
    case 'analyzing':
    case 'detecting_events': return 4;
    case 'saving': return 5;
    case 'complete': return 6;
    case 'error': return -2;
    default: return -1;
  }
}

function getStepIcon(step: ProcessingStep) {
  const iconClass = "h-5 w-5";
  
  if (step.status === 'completed') {
    return <CheckCircle2 className={cn(iconClass, "text-success")} />;
  }
  if (step.status === 'error') {
    return <AlertCircle className={cn(iconClass, "text-destructive")} />;
  }
  if (step.status === 'processing') {
    return <Loader2 className={cn(iconClass, "text-primary animate-spin")} />;
  }
  
  // Pending icons by step
  switch (step.id) {
    case 'prepare': return <FileVideo className={cn(iconClass, "text-muted-foreground")} />;
    case 'upload': return <FileVideo className={cn(iconClass, "text-muted-foreground")} />;
    case 'audio': return <FileAudio className={cn(iconClass, "text-muted-foreground")} />;
    case 'transcribe': return <MessageSquare className={cn(iconClass, "text-muted-foreground")} />;
    case 'analyze': return <Brain className={cn(iconClass, "text-muted-foreground")} />;
    case 'save': return <Sparkles className={cn(iconClass, "text-muted-foreground")} />;
    default: return <Circle className={cn(iconClass, "text-muted-foreground")} />;
  }
}

function formatTimeElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function ProcessingProgress({ 
  stage, 
  currentStep,
  progress, 
  message,
  error,
  transcriptionProgress,
  isTranscribing,
  isAnalyzing
}: ProcessingProgressProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime] = useState(() => Date.now());
  
  // Timer for elapsed time
  useEffect(() => {
    if (stage === 'idle' || stage === 'complete' || stage === 'error') return;
    
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [stage, startTime]);
  
  // Build steps with current status
  const steps = useMemo<ProcessingStep[]>(() => {
    const stageIndex = getStageIndex(stage);
    
    return PROCESSING_STEPS.map((step, index) => {
      let status: ProcessingStep['status'] = 'pending';
      let stepProgress = 0;
      let detail: string | undefined;
      
      if (stage === 'error' && index === stageIndex) {
        status = 'error';
        detail = error;
      } else if (index < stageIndex || stage === 'complete') {
        status = 'completed';
        stepProgress = 100;
      } else if (index === stageIndex) {
        status = 'processing';
        
        // Calculate step progress based on overall progress
        if (stage === 'transcribing') {
          stepProgress = progress;
          detail = transcriptionProgress || 'Processando áudio...';
        } else if (stage === 'analyzing' || stage === 'detecting_events') {
          stepProgress = progress;
          detail = message || 'Analisando transcrição...';
        } else {
          stepProgress = Math.min(progress, 100);
          detail = message;
        }
      }
      
      return { ...step, status, progress: stepProgress, detail };
    });
  }, [stage, progress, message, error, transcriptionProgress]);
  
  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (stage === 'complete') return 100;
    if (stage === 'idle') return 0;
    
    const stageIndex = getStageIndex(stage);
    const baseProgress = Math.max(0, stageIndex) * (100 / PROCESSING_STEPS.length);
    const stageProgress = progress * (100 / PROCESSING_STEPS.length) / 100;
    
    return Math.min(Math.round(baseProgress + stageProgress), 99);
  }, [stage, progress]);
  
  if (stage === 'idle') return null;
  
  const isComplete = stage === 'complete';
  const hasError = stage === 'error';
  
  return (
    <Card variant={hasError ? 'glass' : 'glow'} className={cn(hasError && "border-destructive/50")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : hasError ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {isComplete ? 'Análise Concluída' : hasError ? 'Erro no Processamento' : 'Processando Vídeo'}
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{formatTimeElapsed(elapsedSeconds)}</span>
            </div>
            <span className={cn(
              "text-2xl font-bold",
              isComplete && "text-success",
              hasError && "text-destructive",
              !isComplete && !hasError && "text-primary"
            )}>
              {overallProgress}%
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Overall Progress Bar */}
        <div className="space-y-2">
          <Progress 
            value={overallProgress} 
            className={cn(
              "h-3",
              hasError && "[&>div]:bg-destructive"
            )} 
          />
          {currentStep && (
            <p className="text-sm text-muted-foreground">{currentStep}</p>
          )}
        </div>
        
        {/* Step-by-step progress */}
        <div className="space-y-3">
          {steps.map((step) => (
            <div 
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-lg p-3 transition-all duration-300",
                step.status === 'processing' && "bg-primary/5 border border-primary/20",
                step.status === 'completed' && "opacity-60",
                step.status === 'error' && "bg-destructive/5 border border-destructive/20"
              )}
            >
              <div className="mt-0.5">
                {getStepIcon(step)}
              </div>
              
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      step.status === 'pending' && "text-muted-foreground"
                    )}>
                      {step.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {step.detail || step.description}
                    </p>
                  </div>
                  
                  <span className={cn(
                    "text-xs tabular-nums shrink-0",
                    step.status === 'completed' && "text-success",
                    step.status === 'processing' && "text-primary",
                    step.status === 'error' && "text-destructive",
                    step.status === 'pending' && "text-muted-foreground"
                  )}>
                    {step.status === 'completed' ? '✓' : 
                     step.status === 'error' ? '✗' :
                     step.status === 'processing' ? `${step.progress}%` : '—'}
                  </span>
                </div>
                
                {step.status === 'processing' && (
                  <Progress 
                    value={step.progress} 
                    className="h-1.5"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* Error message */}
        {hasError && error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
        
        {/* Success message */}
        {isComplete && (
          <div className="rounded-lg bg-success/10 border border-success/30 p-3">
            <p className="text-sm text-success">
              ✓ Processamento concluído com sucesso! Redirecionando...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
