import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  HardDrive, 
  Scissors, 
  ChevronDown, 
  ChevronUp,
  Check,
  Loader2,
  Clock,
  AlertCircle,
  Video
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ClipGenerationProgress {
  eventId: string;
  eventType: string;
  minute: number;
  second: number;
  status: 'queued' | 'preparing' | 'generating' | 'uploading' | 'complete' | 'error';
  progress: number;
  error?: string;
  startedAt: Date;
}

export interface StorageProgress {
  totalChunks: number;
  uploadedChunks: number;
  totalSizeMB: number;
  uploadedSizeMB: number;
  lastUploadedAt: Date | null;
}

interface LiveClipProgressProps {
  clipQueue: ClipGenerationProgress[];
  storageProgress: StorageProgress;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  className?: string;
}

const getEventIcon = (type: string) => {
  switch (type) {
    case "goal":
    case "goal_home":
    case "goal_away":
      return "⚽";
    case "yellow_card":
      return "🟨";
    case "red_card":
      return "🟥";
    case "shot":
      return "🎯";
    case "foul":
      return "⚠️";
    case "substitution":
      return "🔄";
    default:
      return "📌";
  }
};

const getEventLabel = (type: string) => {
  switch (type) {
    case "goal":
      return "Gol";
    case "goal_home":
      return "Gol Casa";
    case "goal_away":
      return "Gol Fora";
    case "yellow_card":
      return "Cartão Amarelo";
    case "red_card":
      return "Cartão Vermelho";
    case "shot":
      return "Finalização";
    case "foul":
      return "Falta";
    case "substitution":
      return "Substituição";
    default:
      return type;
  }
};

const getStatusIcon = (status: ClipGenerationProgress['status']) => {
  switch (status) {
    case 'queued':
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    case 'preparing':
    case 'generating':
    case 'uploading':
      return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
    case 'complete':
      return <Check className="h-3.5 w-3.5 text-green-500" />;
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
    default:
      return null;
  }
};

const getStatusLabel = (status: ClipGenerationProgress['status'], progress: number) => {
  switch (status) {
    case 'queued':
      return 'Na fila';
    case 'preparing':
      return 'Preparando...';
    case 'generating':
      return `Gerando... ${progress}%`;
    case 'uploading':
      return 'Enviando...';
    case 'complete':
      return 'Pronto';
    case 'error':
      return 'Erro';
    default:
      return status;
  }
};

export const LiveClipProgress = ({
  clipQueue,
  storageProgress,
  isMinimized = false,
  onToggleMinimize,
  className,
}: LiveClipProgressProps) => {
  const [isExpanded, setIsExpanded] = useState(!isMinimized);

  useEffect(() => {
    setIsExpanded(!isMinimized);
  }, [isMinimized]);

  const completedClips = clipQueue.filter(c => c.status === 'complete').length;
  const generatingClips = clipQueue.filter(c => ['preparing', 'generating', 'uploading'].includes(c.status)).length;
  const queuedClips = clipQueue.filter(c => c.status === 'queued').length;
  const errorClips = clipQueue.filter(c => c.status === 'error').length;

  const storagePercent = storageProgress.totalChunks > 0 
    ? Math.round((storageProgress.uploadedChunks / storageProgress.totalChunks) * 100)
    : 0;

  const hasActiveProgress = generatingClips > 0 || queuedClips > 0 || storageProgress.totalChunks > storageProgress.uploadedChunks;

  // Don't render if there's nothing to show
  if (clipQueue.length === 0 && storageProgress.totalChunks === 0) {
    return null;
  }

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    onToggleMinimize?.();
  };

  const activeClips = clipQueue.filter(c => c.status !== 'complete');
  const recentCompleted = clipQueue.filter(c => c.status === 'complete').slice(-3);

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 bg-card/95 backdrop-blur-sm border rounded-xl shadow-lg transition-all duration-300",
        isExpanded ? "w-80" : "w-auto",
        hasActiveProgress && "ring-2 ring-primary/30",
        className
      )}
    >
      {/* Header */}
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-xl"
        onClick={handleToggle}
      >
        <div className={cn(
          "p-1.5 rounded-lg bg-gradient-to-br",
          hasActiveProgress 
            ? "from-primary/20 to-primary/10 border border-primary/30" 
            : "from-muted to-muted/50 border border-border"
        )}>
          {generatingClips > 0 ? (
            <Scissors className="h-4 w-4 text-primary animate-pulse" />
          ) : (
            <Video className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {isExpanded ? (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Progresso</span>
              {hasActiveProgress && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {completedClips > 0 && <span>✓ {completedClips}</span>}
              {generatingClips > 0 && <span>⟳ {generatingClips}</span>}
              {queuedClips > 0 && <span>⏳ {queuedClips}</span>}
              {errorClips > 0 && <span className="text-destructive">✕ {errorClips}</span>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {completedClips > 0 && (
              <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">
                ✓ {completedClips}
              </Badge>
            )}
            {generatingClips > 0 && (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30 text-xs animate-pulse">
                ⟳ {generatingClips}
              </Badge>
            )}
            {queuedClips > 0 && (
              <Badge variant="secondary" className="text-xs">
                ⏳ {queuedClips}
              </Badge>
            )}
          </div>
        )}

        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t">
          {/* Storage Progress */}
          {storageProgress.totalChunks > 0 && (
            <div className="p-3 border-b bg-muted/10">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">Armazenamento</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {storageProgress.totalSizeMB.toFixed(1)} MB
                </span>
              </div>
              <Progress value={storagePercent} className="h-1.5" />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">
                  {storageProgress.uploadedChunks}/{storageProgress.totalChunks} chunks
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {storagePercent}%
                </span>
              </div>
            </div>
          )}

          {/* Clips List */}
          <div className="p-2">
            <div className="flex items-center gap-2 px-1 mb-2">
              <Scissors className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Clips</span>
              <span className="text-xs text-muted-foreground">
                ({clipQueue.length} total)
              </span>
            </div>

            <ScrollArea className="max-h-48">
              <div className="space-y-1.5">
                {/* Active clips first */}
                {activeClips.map((clip) => (
                  <div
                    key={clip.eventId}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg text-xs transition-all",
                      clip.status === 'error' 
                        ? "bg-destructive/10 border border-destructive/30"
                        : ['preparing', 'generating', 'uploading'].includes(clip.status)
                          ? "bg-primary/5 border border-primary/20"
                          : "bg-muted/30"
                    )}
                  >
                    <span className="text-base">{getEventIcon(clip.eventType)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">
                          {getEventLabel(clip.eventType)}
                        </span>
                        <span className="text-muted-foreground">
                          {clip.minute}'{clip.second > 0 ? clip.second + '"' : ''}
                        </span>
                      </div>
                      {['preparing', 'generating', 'uploading'].includes(clip.status) && (
                        <Progress value={clip.progress} className="h-1 mt-1" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {getStatusIcon(clip.status)}
                      <span className={cn(
                        "text-[10px]",
                        clip.status === 'error' ? "text-destructive" : 
                        clip.status === 'complete' ? "text-green-500" :
                        ['preparing', 'generating', 'uploading'].includes(clip.status) ? "text-primary" :
                        "text-muted-foreground"
                      )}>
                        {getStatusLabel(clip.status, clip.progress)}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Recent completed clips */}
                {recentCompleted.length > 0 && activeClips.length > 0 && (
                  <div className="text-[10px] text-muted-foreground px-2 py-1">
                    Concluídos recentemente:
                  </div>
                )}
                {recentCompleted.map((clip) => (
                  <div
                    key={clip.eventId}
                    className="flex items-center gap-2 p-2 rounded-lg text-xs bg-green-500/5 border border-green-500/20"
                  >
                    <span className="text-base">{getEventIcon(clip.eventType)}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate">
                        {getEventLabel(clip.eventType)}
                      </span>
                      <span className="text-muted-foreground ml-1.5">
                        {clip.minute}'
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-green-500">
                      <Check className="h-3.5 w-3.5" />
                      <span className="text-[10px]">Pronto</span>
                    </div>
                  </div>
                ))}

                {clipQueue.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    Nenhum clip na fila
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
};
