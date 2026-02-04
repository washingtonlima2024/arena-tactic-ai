/**
 * Arena Play - Large File Upload Panel
 * Displays detailed progress for chunked file uploads.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UploadState } from '@/lib/chunkedUpload';
import { useChunkedUpload } from '@/hooks/useChunkedUpload';
import { ChunkProgressGrid } from './ChunkProgressGrid';
import {
  Upload,
  Pause,
  Play,
  X,
  File,
  Loader2,
  CheckCircle,
  AlertCircle,
  Zap,
  Clock,
  HardDrive,
  Scissors,
  Mic,
  Video,
  AudioLines
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LargeFileUploadPanelProps {
  matchId: string;
  onComplete?: (result: { uploadId: string; outputPath: string }) => void;
  onError?: (error: Error) => void;
  className?: string;
}

const STAGE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  'idle': { icon: File, label: 'Aguardando', color: 'text-muted-foreground' },
  'preparing': { icon: File, label: 'Preparando arquivo', color: 'text-blue-500' },
  'uploading': { icon: Upload, label: 'Enviando', color: 'text-yellow-500' },
  'paused': { icon: Pause, label: 'Pausado', color: 'text-orange-500' },
  'assembling': { icon: HardDrive, label: 'Montando arquivo', color: 'text-purple-500' },
  'converting': { icon: Video, label: 'Convertendo vídeo', color: 'text-orange-500' },
  'extracting': { icon: AudioLines, label: 'Extraindo áudio', color: 'text-teal-500' },
  'segmenting': { icon: Scissors, label: 'Fatiando áudio', color: 'text-pink-500' },
  'transcribing': { icon: Mic, label: 'Transcrevendo', color: 'text-green-500' },
  'complete': { icon: CheckCircle, label: 'Concluído', color: 'text-green-500' },
  'error': { icon: AlertCircle, label: 'Erro', color: 'text-destructive' },
  'cancelled': { icon: X, label: 'Cancelado', color: 'text-muted-foreground' }
};

export function LargeFileUploadPanel({
  matchId,
  onComplete,
  onError,
  className
}: LargeFileUploadPanelProps) {
  const [dragActive, setDragActive] = useState(false);
  const [showChunkGrid, setShowChunkGrid] = useState(false);

  const {
    state,
    isUploading,
    isPaused,
    isProcessing,
    progress,
    startUpload,
    pause,
    resume,
    cancel,
    formatSpeed,
    formatTime,
    formatBytes,
    pendingUploads,
    clearPendingUpload
  } = useChunkedUpload({
    matchId,
    onComplete,
    onError
  });

  const handleFileSelect = async (file: File) => {
    try {
      await startUpload(file);
    } catch (error) {
      console.error('[LargeFileUploadPanel] Upload error:', error);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const stageConfig = state ? STAGE_CONFIG[state.status] || STAGE_CONFIG['idle'] : STAGE_CONFIG['idle'];
  const StageIcon = stageConfig.icon;

  // Calculate overall progress based on stage
  const getOverallProgress = (): number => {
    if (!state) return 0;
    
    switch (state.status) {
      case 'preparing':
        return 5;
      case 'uploading':
        return 5 + (progress * 0.45); // 5-50%
      case 'assembling':
        return 50 + (state.conversionProgress * 0.1); // 50-60%
      case 'converting':
        return 60 + (state.conversionProgress * 0.15); // 60-75%
      case 'extracting':
        return 75 + 5; // 75-80%
      case 'segmenting':
        return 80 + 5; // 80-85%
      case 'transcribing':
        return 85 + (state.transcriptionProgress * 0.15); // 85-100%
      case 'complete':
        return 100;
      case 'error':
      case 'cancelled':
        return progress;
      default:
        return 0;
    }
  };

  const overallProgress = getOverallProgress();

  // If no upload in progress, show dropzone
  if (!state || state.status === 'idle') {
    return (
      <Card
        className={cn(
          'border-2 border-dashed transition-colors cursor-pointer',
          dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
          className
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Upload className={cn('h-12 w-12 mb-4', dragActive ? 'text-primary' : 'text-muted-foreground')} />
          <h3 className="text-lg font-medium mb-2">Upload de Arquivo Grande</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
            Arraste um vídeo ou áudio aqui, ou clique para selecionar.
            <br />
            Suporta arquivos de até 4GB com retomada automática.
          </p>
          
          <Button
            variant="outline"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'video/*,audio/*,.mp4,.mov,.mkv,.avi,.mpeg,.webm,.mp3,.wav,.m4a,.aac,.ogg,.flac';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFileSelect(file);
              };
              input.click();
            }}
          >
            <Upload className="h-4 w-4 mr-2" />
            Selecionar Arquivo
          </Button>
          
          <div className="mt-4 flex flex-wrap gap-2 justify-center text-xs text-muted-foreground">
            <Badge variant="outline">MP4</Badge>
            <Badge variant="outline">MOV</Badge>
            <Badge variant="outline">MKV</Badge>
            <Badge variant="outline">AVI</Badge>
            <Badge variant="outline">MP3</Badge>
            <Badge variant="outline">WAV</Badge>
            <Badge variant="outline">M4A</Badge>
          </div>
          
          {/* Pending uploads */}
          {pendingUploads.length > 0 && (
            <div className="mt-6 w-full max-w-md">
              <p className="text-sm font-medium mb-2">Uploads pendentes:</p>
              {pendingUploads.map(upload => (
                <div
                  key={upload.uploadId}
                  className="flex items-center justify-between p-2 bg-muted/50 rounded-lg mb-2"
                >
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4" />
                    <span className="text-sm truncate max-w-[200px]">{upload.filename}</span>
                    <Badge variant="secondary">{upload.progress}%</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearPendingUpload(upload.uploadId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <File className="h-5 w-5" />
            <span className="truncate max-w-[300px]">{state.filename}</span>
          </CardTitle>
          <Badge variant="outline">{formatBytes(state.totalBytes)}</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {state.status === 'uploading' || isProcessing ? (
                <Loader2 className={cn('h-4 w-4 animate-spin', stageConfig.color)} />
              ) : (
                <StageIcon className={cn('h-4 w-4', stageConfig.color)} />
              )}
              <span className={stageConfig.color}>{stageConfig.label}</span>
            </div>
            <span className="font-medium">{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="h-3" showStripes animate />
        </div>

        {/* Upload Details */}
        {state.status === 'uploading' && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span>
                Parte {state.currentChunk}/{state.totalChunks}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span>{formatSpeed(state.speedBps)}</span>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                {formatBytes(state.uploadedBytes)} / {formatBytes(state.totalBytes)}
                {state.estimatedSecondsRemaining > 0 && (
                  <span className="text-muted-foreground ml-2">
                    • ~{formatTime(state.estimatedSecondsRemaining)} restantes
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Transcription Progress */}
        {state.status === 'transcribing' && state.transcriptionSegment.total > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <Mic className="h-4 w-4 text-green-500" />
            <span>
              Segmento {state.transcriptionSegment.current}/{state.transcriptionSegment.total}
            </span>
            <Progress 
              value={(state.transcriptionSegment.current / state.transcriptionSegment.total) * 100} 
              className="h-2 flex-1" 
            />
          </div>
        )}

        {/* Chunk Grid Toggle */}
        {state.status === 'uploading' && state.totalChunks > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowChunkGrid(!showChunkGrid)}
            className="w-full"
          >
            {showChunkGrid ? 'Ocultar partes' : 'Mostrar partes'}
          </Button>
        )}

        {showChunkGrid && state.status === 'uploading' && (
          <ChunkProgressGrid
            totalChunks={state.totalChunks}
            currentChunk={state.currentChunk}
            // For now, we'll show sequential progress
            // In production, we'd track actual completed chunks
          />
        )}

        {/* Error Message */}
        {state.status === 'error' && state.errorMessage && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            {state.errorMessage}
          </div>
        )}

        {/* Event Log */}
        <ScrollArea className="h-24 rounded-md border p-2">
          <div className="space-y-1">
            {state.events.slice(-10).reverse().map((event, i) => (
              <div key={i} className="text-xs text-muted-foreground flex gap-2">
                <span className="text-muted-foreground/50 shrink-0">
                  {new Date(event.timestamp).toLocaleTimeString('pt-BR')}
                </span>
                <span>{event.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isUploading && (
            <Button variant="outline" onClick={pause} className="flex-1">
              <Pause className="h-4 w-4 mr-2" />
              Pausar
            </Button>
          )}
          
          {isPaused && (
            <Button variant="outline" onClick={resume} className="flex-1">
              <Play className="h-4 w-4 mr-2" />
              Continuar
            </Button>
          )}
          
          {(isUploading || isPaused) && (
            <Button variant="destructive" onClick={cancel}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          )}
          
          {state.status === 'complete' && (
            <Button variant="outline" className="flex-1" disabled>
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
              Concluído
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default LargeFileUploadPanel;
