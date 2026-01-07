import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Loader2, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Download,
  Film,
  Wand2,
  Scissors,
  Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompilationProgress as CompilationProgressType } from '@/hooks/useVideoCompilation';

interface CompilationProgressProps {
  progress: CompilationProgressType;
  onCancel: () => void;
  onComplete?: () => void;
}

const stageIcons: Record<CompilationProgressType['stage'], React.ReactNode> = {
  idle: null,
  loading: <Loader2 className="h-6 w-6 animate-spin text-primary" />,
  downloading: <Download className="h-6 w-6 text-blue-500 animate-bounce" />,
  'generating-vignettes': <Wand2 className="h-6 w-6 text-purple-500 animate-pulse" />,
  processing: <Scissors className="h-6 w-6 text-orange-500 animate-pulse" />,
  concatenating: <Film className="h-6 w-6 text-primary animate-spin" />,
  complete: <CheckCircle2 className="h-6 w-6 text-green-500" />,
  error: <AlertCircle className="h-6 w-6 text-destructive" />
};

const stageLabels: Record<CompilationProgressType['stage'], string> = {
  idle: 'Aguardando',
  loading: 'Carregando FFmpeg',
  downloading: 'Baixando vídeos',
  'generating-vignettes': 'Gerando vinhetas',
  processing: 'Processando clips',
  concatenating: 'Concatenando vídeo',
  complete: 'Concluído',
  error: 'Erro'
};

export function CompilationProgress({ progress, onCancel, onComplete }: CompilationProgressProps) {
  const isActive = progress.stage !== 'idle' && progress.stage !== 'complete' && progress.stage !== 'error';
  const isComplete = progress.stage === 'complete';
  const isError = progress.stage === 'error';

  if (progress.stage === 'idle') return null;

  return (
    <Card className={cn(
      "fixed bottom-4 right-4 w-80 z-50 shadow-lg border-2",
      isComplete && "border-green-500/50",
      isError && "border-destructive/50",
      isActive && "border-primary/50"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {stageIcons[progress.stage]}
            <div>
              <p className="font-semibold text-sm">{stageLabels[progress.stage]}</p>
              {progress.currentStep && progress.totalSteps && (
                <p className="text-xs text-muted-foreground">
                  Etapa {progress.currentStep} de {progress.totalSteps}
                </p>
              )}
            </div>
          </div>
          {isActive && (
            <Button 
              variant="ghost" 
              size="icon-sm" 
              onClick={onCancel}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Progress value={progress.progress} className="h-2 mb-2" />

        <p className="text-xs text-muted-foreground truncate">
          {progress.message}
        </p>

        {isComplete && onComplete && (
          <Button 
            variant="arena" 
            size="sm" 
            className="w-full mt-3"
            onClick={onComplete}
          >
            <Download className="h-4 w-4 mr-2" />
            Baixar Vídeo
          </Button>
        )}

        {isError && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full mt-3"
            onClick={onCancel}
          >
            Fechar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
