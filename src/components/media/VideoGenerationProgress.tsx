import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { SoccerBallLoader } from '@/components/ui/SoccerBallLoader';
import { 
  CheckCircle2, 
  XCircle, 
  Download, 
  Play,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerationProgress {
  stage: string;
  progress: number;
  message: string;
}

interface VideoGenerationProgressProps {
  progress: GenerationProgress;
  videoUrl: string | null;
  onDownload: () => void;
  onPreview: () => void;
  onReset: () => void;
}

export function VideoGenerationProgress({
  progress,
  videoUrl,
  onDownload,
  onPreview,
  onReset
}: VideoGenerationProgressProps) {
  if (progress.stage !== 'complete' && progress.stage !== 'error') {
    return (
      <SoccerBallLoader
        message={progress.message}
        progress={progress.progress}
        showProgress={true}
      />
    );
  }

  const getStageColor = () => {
    switch (progress.stage) {
      case 'complete': return 'text-success';
      case 'error': return 'text-destructive';
      default: return 'text-primary';
    }
  };

  const getStageIcon = () => {
    if (progress.stage === 'complete') {
      return <CheckCircle2 className="h-8 w-8 text-success" />;
    }
    return <XCircle className="h-8 w-8 text-destructive" />;
  };

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col items-center gap-4">
        <div className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full",
          progress.stage === 'complete' ? "bg-success/20" : "bg-destructive/20"
        )}>
          {getStageIcon()}
        </div>
        <div className="text-center">
          <h3 className={cn("font-semibold text-lg", getStageColor())}>
            {progress.stage === 'complete' && 'Vídeo Pronto!'}
            {progress.stage === 'error' && 'Erro na Geração'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{progress.message}</p>
        </div>
      </div>

      {progress.stage === 'complete' && videoUrl && (
        <div className="space-y-4">
          <div className="aspect-video bg-muted rounded-lg overflow-hidden border">
            <video src={videoUrl} controls className="w-full h-full object-contain" />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onPreview}>
              <Play className="mr-2 h-4 w-4" />Visualizar
            </Button>
            <Button variant="arena" className="flex-1" onClick={onDownload}>
              <Download className="mr-2 h-4 w-4" />Baixar Vídeo
            </Button>
          </div>
          <Button variant="ghost" className="w-full" onClick={onReset}>
            <Sparkles className="mr-2 h-4 w-4" />Gerar Novo Vídeo
          </Button>
        </div>
      )}

      {progress.stage === 'error' && (
        <div className="space-y-4">
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{progress.message}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={onReset}>Tentar Novamente</Button>
        </div>
      )}
    </div>
  );
}
