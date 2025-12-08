import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Download, 
  Play,
  Film,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GenerationProgress } from '@/hooks/useVideoGeneration';

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
  const getStageIcon = () => {
    switch (progress.stage) {
      case 'complete':
        return <CheckCircle2 className="h-8 w-8 text-success" />;
      case 'error':
        return <XCircle className="h-8 w-8 text-destructive" />;
      default:
        return <Loader2 className="h-8 w-8 text-primary animate-spin" />;
    }
  };

  const getStageColor = () => {
    switch (progress.stage) {
      case 'complete':
        return 'text-success';
      case 'error':
        return 'text-destructive';
      default:
        return 'text-primary';
    }
  };

  return (
    <div className="space-y-6 py-4">
      {/* Progress Header */}
      <div className="flex flex-col items-center gap-4">
        <div className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full",
          progress.stage === 'complete' ? "bg-success/20" :
          progress.stage === 'error' ? "bg-destructive/20" :
          "bg-primary/20"
        )}>
          {getStageIcon()}
        </div>
        
        <div className="text-center">
          <h3 className={cn("font-semibold text-lg", getStageColor())}>
            {progress.stage === 'loading' && 'Inicializando...'}
            {progress.stage === 'processing' && 'Processando Clipes'}
            {progress.stage === 'encoding' && 'Codificando Vídeo'}
            {progress.stage === 'finalizing' && 'Finalizando'}
            {progress.stage === 'complete' && 'Vídeo Pronto!'}
            {progress.stage === 'error' && 'Erro na Geração'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {progress.message}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {progress.stage !== 'complete' && progress.stage !== 'error' && (
        <div className="space-y-2">
          <Progress value={progress.progress} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress.currentClip && progress.totalClips && (
                <>Clipe {progress.currentClip}/{progress.totalClips}</>
              )}
            </span>
            <span>{Math.round(progress.progress)}%</span>
          </div>
        </div>
      )}

      {/* Clip Progress Indicator */}
      {progress.currentClip && progress.totalClips && progress.stage !== 'complete' && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: progress.totalClips }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-2 w-8 rounded-full transition-colors",
                i < (progress.currentClip || 0) ? "bg-primary" :
                i === (progress.currentClip || 0) - 1 ? "bg-primary animate-pulse" :
                "bg-muted"
              )}
            />
          ))}
        </div>
      )}

      {/* Video Preview */}
      {progress.stage === 'complete' && videoUrl && (
        <div className="space-y-4">
          <div className="aspect-video bg-muted rounded-lg overflow-hidden border">
            <video 
              src={videoUrl} 
              controls 
              className="w-full h-full object-contain"
              poster=""
            />
          </div>
          
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={onPreview}
            >
              <Play className="mr-2 h-4 w-4" />
              Visualizar
            </Button>
            <Button 
              variant="arena" 
              className="flex-1"
              onClick={onDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              Baixar Vídeo
            </Button>
          </div>
          
          <Button 
            variant="ghost" 
            className="w-full"
            onClick={onReset}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Gerar Novo Vídeo
          </Button>
        </div>
      )}

      {/* Error State */}
      {progress.stage === 'error' && (
        <div className="space-y-4">
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">
              {progress.message}
            </p>
          </div>
          <Button 
            variant="outline" 
            className="w-full"
            onClick={onReset}
          >
            Tentar Novamente
          </Button>
        </div>
      )}

      {/* Processing Tips */}
      {progress.stage !== 'complete' && progress.stage !== 'error' && (
        <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
          <Film className="h-5 w-5 text-primary mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Processamento no navegador</p>
            <p>
              O vídeo está sendo processado localmente usando FFmpeg WebAssembly. 
              Isso pode levar alguns minutos dependendo do número de clipes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
