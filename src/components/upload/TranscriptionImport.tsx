import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Upload, 
  X, 
  Mic, 
  ClipboardPaste, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Target
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  parseTranscription, 
  formatTimestamp,
  type ParseResult,
  type DetectedEvent 
} from '@/lib/transcriptionParser';
import { useTranscriptionExtract } from '@/hooks/useTranscriptionExtract';

interface TranscriptionImportProps {
  value: string;
  onChange: (value: string, parseResult?: ParseResult) => void;
  videoUrl?: string;
  matchId?: string;
  videoDurationSeconds?: number;
  className?: string;
  compact?: boolean;
}

const eventIcons: Record<DetectedEvent['type'], { icon: string; color: string }> = {
  goal: { icon: '⚽', color: 'text-green-500' },
  card: { icon: '🟨', color: 'text-yellow-500' },
  foul: { icon: '⚠️', color: 'text-orange-500' },
  penalty: { icon: '🎯', color: 'text-red-500' },
  substitution: { icon: '🔄', color: 'text-blue-500' },
  other: { icon: '📝', color: 'text-muted-foreground' },
};

const acceptedExtensions = ['.srt', '.vtt', '.txt', '.json'];

export function TranscriptionImport({
  value,
  onChange,
  videoUrl,
  matchId,
  videoDurationSeconds,
  className,
  compact = false,
}: TranscriptionImportProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  
  const { extractFromVideo, extractFromEmbed, isExtracting, progress } = useTranscriptionExtract();

  const handleParse = useCallback((content: string, source?: string) => {
    if (!content.trim()) {
      setParseResult(null);
      onChange('', undefined);
      return;
    }

    const result = parseTranscription(content, videoDurationSeconds);
    setParseResult(result);
    onChange(content, result);
    
    if (source) {
      setFileName(source);
    }
  }, [onChange, videoDurationSeconds]);

  const handleFileRead = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      handleParse(content, file.name);
    };
    reader.readAsText(file);
  }, [handleParse]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && isValidFile(file.name)) {
      handleFileRead(file);
    }
  }, [handleFileRead]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileRead(file);
    }
    e.target.value = '';
  };

  const isValidFile = (filename: string): boolean => {
    const ext = '.' + filename.toLowerCase().split('.').pop();
    return acceptedExtensions.includes(ext);
  };

  const handleExtract = async () => {
    if (!videoUrl && !matchId) return;
    
    let result;
    if (videoUrl?.includes('embed') || videoUrl?.includes('iframe')) {
      result = await extractFromEmbed(videoUrl, matchId || '');
    } else if (videoUrl) {
      result = await extractFromVideo(videoUrl, matchId);
    }
    
    if (result?.srtContent) {
      handleParse(result.srtContent, `Extraído (${result.method})`);
    }
  };

  const handleClear = () => {
    setFileName(null);
    setParseResult(null);
    onChange('', undefined);
  };

  const handlePaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleParse(e.target.value, 'Colado');
  };

  // Compact mode for VideoSegmentCard
  if (compact) {
    return (
      <div className={cn("space-y-2 p-3 rounded-lg bg-muted/10 border border-border/30", className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FileText className="h-3 w-3" />
            Transcrição (SRT/VTT/TXT/JSON)
          </div>
          {(videoUrl || matchId) && !value && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs"
              onClick={handleExtract}
              disabled={isExtracting}
            >
              <Mic className="h-3 w-3 mr-1" />
              Extrair
            </Button>
          )}
        </div>
        
        {isExtracting ? (
          <div className="space-y-1">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground text-center">Extraindo... {progress}%</p>
          </div>
        ) : value ? (
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-sm truncate">{fileName || 'Transcrição'}</span>
              {parseResult && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  {parseResult.validLines} linhas
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleClear}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative flex items-center justify-center py-2 px-3 rounded-md border-2 border-dashed transition-all cursor-pointer",
              isDragging ? "border-primary bg-primary/5" : "border-border/40 hover:border-primary/40"
            )}
          >
            <Upload className="h-4 w-4 text-muted-foreground mr-2" />
            <span className="text-xs text-muted-foreground">Arraste arquivo ou clique</span>
            <input
              type="file"
              accept={acceptedExtensions.join(',')}
              onChange={handleFileSelect}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>
        )}

        {/* Compact event preview */}
        {parseResult && parseResult.detectedEvents.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Target className="h-3 w-3" />
            {parseResult.detectedEvents.filter(e => e.type === 'goal').length} gols,{' '}
            {parseResult.detectedEvents.filter(e => e.type === 'card').length} cartões,{' '}
            {parseResult.detectedEvents.filter(e => e.type === 'foul').length} faltas
          </div>
        )}
      </div>
    );
  }

  // Full mode for TranscriptionAnalysisDialog
  return (
    <div className={cn("space-y-4", className)}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'file' | 'paste')}>
        <div className="flex items-center justify-between">
          <TabsList className="h-9">
            <TabsTrigger value="file" className="text-xs">
              <Upload className="h-3 w-3 mr-1" />
              Importar Arquivo
            </TabsTrigger>
            <TabsTrigger value="paste" className="text-xs">
              <ClipboardPaste className="h-3 w-3 mr-1" />
              Colar Texto
            </TabsTrigger>
          </TabsList>
          
          {(videoUrl || matchId) && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExtract}
              disabled={isExtracting}
            >
              <Mic className="h-4 w-4 mr-2" />
              Extrair do Vídeo
            </Button>
          )}
        </div>

        {isExtracting && (
          <div className="space-y-2 p-4 rounded-lg bg-muted/20">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">
              Extraindo transcrição do vídeo... {progress}%
            </p>
          </div>
        )}

        <TabsContent value="file" className="mt-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative flex flex-col items-center justify-center py-8 px-4 rounded-lg border-2 border-dashed transition-all cursor-pointer",
              isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-1">
              Arraste um arquivo SRT, VTT, TXT ou JSON aqui
            </p>
            <p className="text-xs text-muted-foreground">ou clique para selecionar</p>
            <input
              type="file"
              accept={acceptedExtensions.join(',')}
              onChange={handleFileSelect}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>
        </TabsContent>

        <TabsContent value="paste" className="mt-4">
          <Textarea
            value={value}
            onChange={handlePaste}
            placeholder={`Cole a transcrição aqui...

Formatos aceitos:
[00:15] GOOOOL do Brasil!
00:45 | Falta perigosa
1:30 Cartão amarelo

Ou formato SRT/JSON`}
            className="min-h-[200px] font-mono text-sm"
          />
        </TabsContent>
      </Tabs>

      {/* Parse Result Info */}
      {parseResult && parseResult.validLines > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="font-medium">{fileName || 'Transcrição carregada'}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="secondary">
              <FileText className="h-3 w-3 mr-1" />
              {parseResult.format.toUpperCase()}
            </Badge>
            <Badge variant="secondary">
              {parseResult.validLines} linhas válidas
            </Badge>
            {parseResult.startTime !== null && parseResult.endTime !== null && (
              <Badge variant="secondary">
                <Clock className="h-3 w-3 mr-1" />
                {formatTimestamp(parseResult.startTime)} → {formatTimestamp(parseResult.endTime)}
              </Badge>
            )}
            {videoDurationSeconds && parseResult.coveragePercent > 0 && (
              <Badge variant={parseResult.coveragePercent >= 90 ? 'default' : 'secondary'}>
                Cobertura: {parseResult.coveragePercent.toFixed(0)}%
              </Badge>
            )}
          </div>

          {/* Detected Events Preview */}
          {parseResult.detectedEvents.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4 text-primary" />
                Eventos Detectados ({parseResult.detectedEvents.length})
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-1 rounded-md bg-background/50 p-2">
                {parseResult.detectedEvents.slice(0, 10).map((event, i) => {
                  const config = eventIcons[event.type];
                  return (
                    <div key={i} className="flex items-start gap-2 text-sm py-1 px-2 rounded hover:bg-muted/50">
                      <span className={config.color}>{config.icon}</span>
                      <span className="text-muted-foreground shrink-0 font-mono">
                        {formatTimestamp(event.timestamp)}
                      </span>
                      <span className="truncate">{event.text}</span>
                      <Badge variant="outline" className="ml-auto text-xs shrink-0">
                        {event.type === 'goal' ? 'GOL' : 
                         event.type === 'card' ? 'CARTÃO' :
                         event.type === 'foul' ? 'FALTA' :
                         event.type === 'penalty' ? 'PÊNALTI' :
                         event.type === 'substitution' ? 'SUBST.' : 'EVENTO'}
                      </Badge>
                    </div>
                  );
                })}
                {parseResult.detectedEvents.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    +{parseResult.detectedEvents.length - 10} outros eventos
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Warnings */}
          {parseResult.validLines < parseResult.totalLines && (
            <div className="flex items-start gap-2 text-sm text-yellow-500">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {parseResult.totalLines - parseResult.validLines} linhas sem timestamp válido
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
