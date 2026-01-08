import { ProcessingStatus } from '@/hooks/useAsyncProcessing';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Clock, 
  Loader2, 
  XCircle, 
  FileVideo, 
  Scissors, 
  Brain, 
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AsyncProcessingProgressProps {
  status: ProcessingStatus | null;
  onCancel?: () => void;
  onRetry?: () => void;
  onComplete?: () => void;
}

const stageConfig = {
  queued: { icon: Clock, label: 'Na fila', color: 'text-muted-foreground' },
  preparing: { icon: FileVideo, label: 'Preparando', color: 'text-blue-500' },
  splitting: { icon: Scissors, label: 'Dividindo vídeos', color: 'text-purple-500' },
  transcribing: { icon: FileVideo, label: 'Transcrevendo', color: 'text-amber-500' },
  analyzing: { icon: Brain, label: 'Analisando com IA', color: 'text-arena-500' },
  clipping: { icon: Sparkles, label: 'Gerando clips', color: 'text-green-500' },
  complete: { icon: CheckCircle2, label: 'Concluído', color: 'text-green-500' },
  error: { icon: XCircle, label: 'Erro', color: 'text-destructive' },
};

const partStatusConfig: Record<string, { icon: any; color: string; animate?: boolean }> = {
  pending: { icon: Clock, color: 'bg-muted text-muted-foreground' },
  splitting: { icon: Scissors, color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30' },
  transcribing: { icon: Loader2, color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30', animate: true },
  done: { icon: CheckCircle2, color: 'bg-green-100 text-green-600 dark:bg-green-900/30' },
  error: { icon: XCircle, color: 'bg-red-100 text-red-600 dark:bg-red-900/30' },
};

export function AsyncProcessingProgress({ 
  status, 
  onCancel, 
  onRetry, 
  onComplete 
}: AsyncProcessingProgressProps) {
  if (!status) {
    return (
      <Card className="border-muted">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Aguardando início...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentStage = stageConfig[status.status] || stageConfig.queued;
  const StageIcon = currentStage.icon;
  const isComplete = status.status === 'complete';
  const isError = status.status === 'error';
  const isActive = !isComplete && !isError;

  // Format estimated time
  const formatTime = (seconds?: number) => {
    if (!seconds || seconds < 0) return null;
    if (seconds < 60) return `~${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~${mins}m ${secs}s`;
  };

  return (
    <Card className={cn(
      "border-2 transition-colors",
      isComplete && "border-green-500/50 bg-green-500/5",
      isError && "border-destructive/50 bg-destructive/5",
      isActive && "border-arena-500/50"
    )}>
      <CardContent className="p-6 space-y-6">
        {/* Header with stage info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              isComplete && "bg-green-100 dark:bg-green-900/30",
              isError && "bg-destructive/10",
              isActive && "bg-arena-500/10"
            )}>
              <StageIcon className={cn(
                "h-6 w-6",
                currentStage.color,
                isActive && status.status !== 'queued' && "animate-pulse"
              )} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{currentStage.label}</h3>
              <p className="text-sm text-muted-foreground">
                {status.progressMessage || 'Processando...'}
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">
              {status.progress}%
            </div>
            {status.estimatedTimeRemaining && isActive && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                <Clock className="h-3 w-3" />
                {formatTime(status.estimatedTimeRemaining)}
              </div>
            )}
          </div>
        </div>

        {/* Main progress bar */}
        <div className="space-y-2">
          <Progress 
            value={status.progress} 
            className={cn(
              "h-3",
              isComplete && "[&>div]:bg-green-500",
              isError && "[&>div]:bg-destructive"
            )}
          />
          {status.totalParts > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Partes: {status.partsCompleted}/{status.totalParts}</span>
              {status.eventsDetected !== undefined && (
                <span>{status.eventsDetected} eventos detectados</span>
              )}
            </div>
          )}
        </div>

        {/* Parts status grid */}
        {status.partsStatus && status.partsStatus.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              Progresso por parte
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {status.partsStatus.map((part) => {
                const partConfig = partStatusConfig[part.status] || partStatusConfig.pending;
                const PartIcon = partConfig.icon;
                return (
                  <div
                    key={`${part.halfType}-${part.part}`}
                    className={cn(
                      "p-3 rounded-lg flex items-center gap-2 transition-all",
                      partConfig.color
                    )}
                  >
                    <PartIcon className={cn(
                      "h-4 w-4 flex-shrink-0",
                      partConfig.animate && "animate-spin"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {part.halfType === 'first' ? '1º' : '2º'} T - P{part.part}
                      </div>
                      {part.status === 'transcribing' && (
                        <div className="text-[10px] opacity-75">
                          {part.progress}%
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Error message */}
        {isError && status.error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">{status.error}</div>
          </div>
        )}

        {/* Results summary on complete */}
        {isComplete && (
          <div className="flex items-center gap-4 p-3 rounded-lg bg-green-500/10">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <div className="flex-1">
              <div className="font-medium">Processamento concluído!</div>
              <div className="text-sm text-muted-foreground">
                {status.eventsDetected !== undefined && `${status.eventsDetected} eventos detectados`}
                {status.clipsGenerated !== undefined && ` • ${status.clipsGenerated} clips gerados`}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          {isActive && onCancel && (
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancelar
            </Button>
          )}
          {isError && onRetry && (
            <Button variant="arena" onClick={onRetry} className="flex-1">
              Tentar Novamente
            </Button>
          )}
          {isComplete && onComplete && (
            <Button variant="arena" onClick={onComplete} className="flex-1">
              Ver Eventos
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
