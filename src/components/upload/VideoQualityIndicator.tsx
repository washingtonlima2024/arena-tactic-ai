import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  HardDrive, 
  Zap, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  Film,
  FileVideo
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoQualityIndicatorProps {
  video: {
    original_url?: string | null;
    proxy_url?: string | null;
    proxy_status?: 'pending' | 'converting' | 'ready' | 'error' | null;
    proxy_progress?: number;
    original_size_bytes?: number | null;
    proxy_size_bytes?: number | null;
    original_resolution?: string | null;
    proxy_resolution?: string | null;
    savings_percent?: number;
  };
  compact?: boolean;
  className?: string;
}

const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return '—';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

export function VideoQualityIndicator({ 
  video, 
  compact = false,
  className 
}: VideoQualityIndicatorProps) {
  const {
    proxy_status = 'pending',
    proxy_progress = 0,
    original_size_bytes,
    proxy_size_bytes,
    original_resolution,
    proxy_resolution = '480p',
    savings_percent
  } = video;

  // Calculate savings if not provided
  const calculatedSavings = savings_percent ?? (
    original_size_bytes && proxy_size_bytes
      ? Math.round((1 - proxy_size_bytes / original_size_bytes) * 100)
      : 0
  );

  const getStatusIcon = () => {
    switch (proxy_status) {
      case 'ready':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'converting':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Loader2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (proxy_status) {
      case 'ready':
        return 'Proxy pronto';
      case 'converting':
        return `Convertendo... ${proxy_progress}%`;
      case 'error':
        return 'Erro na conversão';
      default:
        return 'Aguardando';
    }
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {getStatusIcon()}
        <span className="text-xs text-muted-foreground">
          {proxy_status === 'ready' ? (
            <>Proxy {proxy_resolution} • {calculatedSavings}% menor</>
          ) : (
            getStatusText()
          )}
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-lg border bg-card/50 p-4 space-y-3",
      className
    )}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          Sistema de Qualidade Dupla
        </h4>
        {proxy_status === 'ready' && calculatedSavings > 0 && (
          <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400">
            {calculatedSavings}% economia
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Original */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Film className="h-3.5 w-3.5" />
            <span>Original (Export)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {formatBytes(original_size_bytes)}
            </span>
            {original_resolution && (
              <Badge variant="outline" className="text-xs">
                {original_resolution}
              </Badge>
            )}
          </div>
        </div>

        {/* Proxy */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileVideo className="h-3.5 w-3.5" />
            <span>Proxy (Processamento)</span>
          </div>
          <div className="flex items-center gap-2">
            {proxy_status === 'ready' ? (
              <>
                <span className="font-medium text-sm text-green-600 dark:text-green-400">
                  {formatBytes(proxy_size_bytes)}
                </span>
                <Badge variant="outline" className="text-xs">
                  {proxy_resolution}
                </Badge>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </>
            ) : proxy_status === 'converting' ? (
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="text-sm text-muted-foreground">
                    Convertendo...
                  </span>
                </div>
                <Progress value={proxy_progress} className="h-1.5" />
              </div>
            ) : proxy_status === 'error' ? (
              <span className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Erro
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Pendente
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Storage indicator */}
      {proxy_status === 'ready' && original_size_bytes && proxy_size_bytes && (
        <div className="pt-2 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5" />
            <span>
              Economia de espaço: {formatBytes(original_size_bytes - proxy_size_bytes)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
