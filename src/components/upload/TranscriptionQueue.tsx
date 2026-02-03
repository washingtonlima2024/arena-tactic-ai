import { TranscriptionQueueItem } from '@/hooks/useTranscriptionQueue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileVideo, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Clock,
  Trash2,
  Play,
  Layers,
  Scissors,
  Music,
  MessageSquare,
  Combine
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TranscriptionQueueProps {
  queue: TranscriptionQueueItem[];
  isProcessing: boolean;
  currentItemId: string | null;
  onStart: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  overallProgress: { completed: number; total: number; overallProgress: number };
}

type ProcessingStage = 'pending' | 'splitting' | 'extracting_audio' | 'transcribing' | 'combining' | 'complete' | 'error';

const STAGE_CONFIG: Record<ProcessingStage, { icon: React.ReactNode; label: string; color: string }> = {
  pending: { icon: <Clock className="h-4 w-4" />, label: 'Aguardando', color: 'text-muted-foreground' },
  splitting: { icon: <Scissors className="h-4 w-4" />, label: 'Dividindo', color: 'text-blue-500' },
  extracting_audio: { icon: <Music className="h-4 w-4" />, label: 'Extraindo Áudio', color: 'text-purple-500' },
  transcribing: { icon: <MessageSquare className="h-4 w-4" />, label: 'Transcrevendo', color: 'text-primary' },
  combining: { icon: <Combine className="h-4 w-4" />, label: 'Combinando', color: 'text-orange-500' },
  complete: { icon: <CheckCircle2 className="h-4 w-4" />, label: 'Concluído', color: 'text-green-500' },
  error: { icon: <AlertCircle className="h-4 w-4" />, label: 'Erro', color: 'text-destructive' }
};

// Map queue item status to processing stage
function getStageFromStatus(item: TranscriptionQueueItem): ProcessingStage {
  if (item.status === 'pending') return 'pending';
  if (item.status === 'complete') return 'complete';
  if (item.status === 'error') return 'error';
  
  // For transcribing status, check message for more specific stage
  const msg = item.message?.toLowerCase() || '';
  if (msg.includes('dividindo') || msg.includes('split')) return 'splitting';
  if (msg.includes('extraindo') || msg.includes('audio')) return 'extracting_audio';
  if (msg.includes('combinando') || msg.includes('combining')) return 'combining';
  return 'transcribing';
}

export function TranscriptionQueue({
  queue,
  isProcessing,
  currentItemId,
  onStart,
  onRemove,
  onClear,
  overallProgress
}: TranscriptionQueueProps) {
  if (queue.length === 0) return null;

  const getStatusIcon = (item: TranscriptionQueueItem) => {
    const stage = getStageFromStatus(item);
    const config = STAGE_CONFIG[stage];
    
    if (item.status === 'transcribing') {
      return <Loader2 className={cn("h-4 w-4 animate-spin", config.color)} />;
    }
    
    return <span className={config.color}>{config.icon}</span>;
  };

  const getStatusBadge = (item: TranscriptionQueueItem) => {
    const stage = getStageFromStatus(item);
    const config = STAGE_CONFIG[stage];
    
    switch (item.status) {
      case 'pending':
        return <Badge variant="secondary">{config.label}</Badge>;
      case 'transcribing':
        return <Badge variant="default" className="bg-primary">{config.label}</Badge>;
      case 'complete':
        return <Badge variant="default" className="bg-green-500">{config.label}</Badge>;
      case 'error':
        return <Badge variant="destructive">{config.label}</Badge>;
    }
  };

  const pendingCount = queue.filter(i => i.status === 'pending').length;
  const processingCount = queue.filter(i => i.status === 'transcribing').length;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Fila de Transcrição
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {overallProgress.completed}/{overallProgress.total}
            </Badge>
            {!isProcessing && pendingCount > 0 && (
              <Button size="sm" onClick={onStart}>
                <Play className="h-4 w-4 mr-1" />
                Iniciar Fila
              </Button>
            )}
            {!isProcessing && queue.length > 0 && (
              <Button size="sm" variant="outline" onClick={onClear}>
                <Trash2 className="h-4 w-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>
        </div>
        
        {isProcessing && (
          <Progress value={overallProgress.overallProgress} className="h-2 mt-2" />
        )}
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-3">
            {queue.map((item) => (
              <div 
                key={item.id}
                className={cn(
                  "p-3 rounded-lg border transition-all",
                  item.id === currentItemId && "border-primary bg-primary/5",
                  item.status === 'complete' && "bg-green-500/5 border-green-500/20",
                  item.status === 'error' && "bg-destructive/5 border-destructive/20"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {getStatusIcon(item)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate max-w-[200px]">
                          {item.fileName}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {item.halfType === 'first' ? '1º Tempo' : '2º Tempo'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {item.sizeMB.toFixed(0)} MB
                        </span>
                      </div>
                      
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.message}
                      </p>
                      
                      {item.status === 'transcribing' && item.totalParts && item.totalParts > 1 && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">
                              Parte {item.currentPart}/{item.totalParts}
                            </span>
                            <Progress value={item.progress} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground">
                              {item.progress.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {item.status === 'transcribing' && (!item.totalParts || item.totalParts === 1) && (
                        <Progress value={item.progress} className="h-1.5 mt-2" />
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {getStatusBadge(item)}
                    {item.status === 'pending' && !isProcessing && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6"
                        onClick={() => onRemove(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
