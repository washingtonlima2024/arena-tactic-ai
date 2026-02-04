import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Loader2,
  RefreshCw, 
  AlertTriangle, 
  FileText,
  Trash2,
  Upload,
  X,
  File,
  Mic,
  Wand2,
  FileCheck,
  ChevronDown,
  Database
} from 'lucide-react';
import { SoccerBallLoader } from '@/components/ui/SoccerBallLoader';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useStartAnalysis } from '@/hooks/useAnalysisJob';
import { useWhisperTranscription } from '@/hooks/useWhisperTranscription';
import apiClient, { normalizeStorageUrl } from '@/lib/apiClient';

interface UploadedFile {
  name: string;
  content: string;
  isOriginal?: boolean;
}

interface ReanalyzeHalfDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  half: 'first' | 'second';
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName?: string;
  awayTeamName?: string;
  competition?: string;
  onComplete: () => void;
}

export function ReanalyzeHalfDialog({
  isOpen,
  onClose,
  matchId,
  half,
  homeTeamId,
  awayTeamId,
  homeTeamName = 'Time Casa',
  awayTeamName = 'Time Visitante',
  competition,
  onComplete
}: ReanalyzeHalfDialogProps) {
  const queryClient = useQueryClient();
  const { startAnalysis, isLoading } = useStartAnalysis();
  const { transcribeVideo, transcriptionProgress, isTranscribing } = useWhisperTranscription();
  const [transcription, setTranscription] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Estado para transcrição original
  const [originalTranscription, setOriginalTranscription] = useState<string | null>(null);
  const [useOriginal, setUseOriginal] = useState(true);
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);
  
  // Estado para verificação de tamanho do vídeo
  const [videoSizeMB, setVideoSizeMB] = useState<number | null>(null);
  const [isCheckingVideoSize, setIsCheckingVideoSize] = useState(false);
  const isVideoTooLarge = videoSizeMB !== null && videoSizeMB > 35;

  const halfLabel = half === 'first' ? '1º Tempo' : '2º Tempo';
  const minuteRange = half === 'first' ? '0-44' : '45-90';

  // Carregar transcrição original e verificar tamanho do vídeo ao abrir
  useEffect(() => {
    if (isOpen && matchId) {
      loadExistingTranscription();
      checkVideoSize();
    }
  }, [isOpen, matchId]);
  
  // Verificar tamanho do vídeo
  const checkVideoSize = async () => {
    try {
      setIsCheckingVideoSize(true);
      
      // Use local API instead of Supabase
      const videos = await apiClient.getVideos(matchId);
      
      const halfVideo = videos?.find((v: any) => {
        const start = v.start_minute || 0;
        const videoType = v.video_type;
        if (half === 'first') return videoType === 'first_half' || start < 45;
        return videoType === 'second_half' || start >= 45;
      });
      
      if (halfVideo?.file_url) {
        try {
          // Normalize URL for local server
          const videoUrl = normalizeStorageUrl(halfVideo.file_url);
          const response = await fetch(videoUrl, { method: 'HEAD' });
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            const sizeMB = parseInt(contentLength) / (1024 * 1024);
            setVideoSizeMB(Math.round(sizeMB * 10) / 10);
          }
        } catch (fetchError) {
          console.warn('Could not check video size:', fetchError);
          setVideoSizeMB(null);
        }
      }
    } catch (error) {
      console.error('Error checking video size:', error);
    } finally {
      setIsCheckingVideoSize(false);
    }
  };

  const loadExistingTranscription = async () => {
    try {
      setIsLoadingOriginal(true);
      
      // Use local API to list files in storage
      const files = await apiClient.listMatchFiles(matchId);
      const srtFiles = files?.folders?.srt || [];
      const txtFiles = files?.folders?.texts || [];
      
      // Find transcription file for this half
      const halfPattern = half === 'first' ? 'first' : 'second';
      const transcriptionFile = srtFiles.find((f: any) => 
        f.filename?.toLowerCase().includes(halfPattern) || 
        f.filename?.toLowerCase().includes('transcription')
      ) || srtFiles[0] || txtFiles.find((f: any) =>
        f.filename?.toLowerCase().includes(halfPattern) ||
        f.filename?.toLowerCase().includes('transcription')
      ) || txtFiles[0];
      
      if (transcriptionFile) {
        try {
          // Fetch transcription content from local storage
          const url = transcriptionFile.url || `/api/storage/${matchId}/srt/${transcriptionFile.filename}`;
          const content = await apiClient.get<string>(url);
          
          if (content && typeof content === 'string') {
            setOriginalTranscription(content);
            
            // Add as original file
            setUploadedFiles(prev => {
              const withoutOriginal = prev.filter(f => !f.isOriginal);
              return [
                { 
                  name: `📌 ${transcriptionFile.filename || 'transcrição-original.srt'}`, 
                  content: content, 
                  isOriginal: true 
                },
                ...withoutOriginal
              ];
            });
            
            toast.success('Transcrição original carregada automaticamente');
          } else {
            setOriginalTranscription(null);
          }
        } catch (fetchError) {
          console.warn('Could not fetch transcription content:', fetchError);
          setOriginalTranscription(null);
        }
      } else {
        setOriginalTranscription(null);
      }
    } catch (error) {
      console.error('Error loading existing transcription:', error);
      setOriginalTranscription(null);
    } finally {
      setIsLoadingOriginal(false);
    }
  };

  const handleFileRead = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setUploadedFiles(prev => {
        // Não permitir sobrescrever arquivos existentes
        if (prev.some(f => f.name === file.name)) {
          toast.info(`Arquivo "${file.name}" já está na lista`);
          return prev;
        }
        return [...prev, { name: file.name, content, isOriginal: false }];
      });
    };
    reader.readAsText(file);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.name.endsWith('.srt') || f.name.endsWith('.vtt') || f.name.endsWith('.txt')
    );
    
    files.forEach(handleFileRead);
  }, [handleFileRead]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(handleFileRead);
    e.target.value = '';
  }, [handleFileRead]);

  const removeFile = (fileName: string) => {
    const file = uploadedFiles.find(f => f.name === fileName);
    if (file?.isOriginal) {
      setUseOriginal(false);
    }
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const handleExtractTranscription = async () => {
    try {
      // Use local API instead of Supabase
      const videos = await apiClient.getVideos(matchId);

      const halfVideo = videos?.find((v: any) => {
        const start = v.start_minute || 0;
        const videoType = v.video_type;
        if (half === 'first') return videoType === 'first_half' || start < 45;
        return videoType === 'second_half' || start >= 45;
      });

      if (!halfVideo) {
        toast.error(`Nenhum vídeo encontrado para o ${halfLabel}`);
        return;
      }

      // Mostrar aviso se vídeo é grande
      if (isVideoTooLarge && videoSizeMB) {
        toast.info(`Vídeo grande (${videoSizeMB}MB) - será dividido em partes para transcrição...`);
      } else {
        toast.info('Transcrevendo áudio com Whisper...');
      }

      // Passar o tamanho do vídeo para habilitar processamento em partes
      const result = await transcribeVideo(halfVideo.file_url, matchId, halfVideo.id, videoSizeMB || undefined);

      if (result?.text || result?.srtContent) {
        const transcriptionContent = result.text || result.srtContent;
        setUploadedFiles(prev => {
          const filtered = prev.filter(f => 
            f.name !== '🎙️ whisper-transcription.txt' && 
            f.name !== '🎙️ whisper-timestamps.srt'
          );
          
          return [
            ...filtered,
            { name: '🎙️ whisper-transcription.txt', content: transcriptionContent, isOriginal: false }
          ];
        });

        toast.success(`Transcrição Whisper concluída! (${(transcriptionContent.length / 1024).toFixed(1)}KB)`);
      } else {
        toast.warning('Transcrição vazia retornada');
      }
    } catch (error) {
      console.error('Error extracting transcription:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao extrair transcrição: ${errorMsg}`);
    }
  };

  const getCombinedTranscription = () => {
    const parts: string[] = [];
    
    // Transcrição original primeiro (se ativada)
    const originalFile = uploadedFiles.find(f => f.isOriginal);
    if (useOriginal && originalFile) {
      parts.push(`--- TRANSCRIÇÃO ORIGINAL (Análise Anterior) ---\n${originalFile.content}`);
    }
    
    // Arquivos importados adicionais
    uploadedFiles.filter(f => !f.isOriginal).forEach(file => {
      parts.push(`--- ${file.name} ---\n${file.content}`);
    });
    
    // Texto manual
    if (transcription.trim()) {
      parts.push(`--- TEXTO ADICIONAL ---\n${transcription}`);
    }
    
    return parts.join('\n\n');
  };

  const handleReanalyze = async () => {
    try {
      setIsDeleting(true);

      // Use local API instead of Supabase
      const videos = await apiClient.getVideos(matchId);

      const halfVideo = videos?.find((v: any) => {
        const start = v.start_minute || 0;
        if (half === 'first') return start < 45;
        return start >= 45;
      });

      if (!halfVideo) {
        toast.error(`Nenhum vídeo encontrado para o ${halfLabel}`);
        return;
      }

      // Delete events via local API (with half filter)
      try {
        await apiClient.delete(`/api/matches/${matchId}/events?half=${half}`);
      } catch (deleteError) {
        console.error('Delete error:', deleteError);
        toast.error('Erro ao deletar eventos antigos');
        return;
      }

      setIsDeleting(false);

      // Get remaining goals to update match score
      const events = await apiClient.getMatchEvents(matchId);
      const remainingGoals = events?.filter((e: any) => e.event_type === 'goal') || [];

      let homeScore = 0;
      let awayScore = 0;
      remainingGoals.forEach((g: any) => {
        const meta = g.metadata as Record<string, any> | null;
        const isOwnGoal = meta?.isOwnGoal;
        const team = meta?.team;
        if (isOwnGoal) {
          if (team === 'home') awayScore++;
          else homeScore++;
        } else {
          if (team === 'home') homeScore++;
          else awayScore++;
        }
      });

      // Update match score via local API
      await apiClient.updateMatch(matchId, { home_score: homeScore, away_score: awayScore });

      toast.info(`Re-análise do ${halfLabel} iniciada...`);

      const combinedTranscription = getCombinedTranscription();
      
      if (!combinedTranscription) {
        toast.error('Transcrição obrigatória para re-análise');
        return;
      }

      await startAnalysis({
        matchId,
        transcription: combinedTranscription,
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        gameStartMinute: half === 'first' ? 0 : 45,
        gameEndMinute: half === 'first' ? 48 : 95, // Allow for stoppage time
        halfType: half,
      });

      queryClient.invalidateQueries({ queryKey: ['match-events', matchId] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });

      toast.success(`Re-análise do ${halfLabel} em andamento`);
      onComplete();
      onClose();
      
      setTranscription('');
      setUploadedFiles([]);
      setOriginalTranscription(null);

    } catch (error) {
      console.error('Reanalyze error:', error);
      toast.error('Erro ao re-analisar');
    } finally {
      setIsDeleting(false);
    }
  };

  // Contadores
  const originalFileCount = uploadedFiles.filter(f => f.isOriginal).length;
  const additionalFileCount = uploadedFiles.filter(f => !f.isOriginal).length;
  const totalSources = (useOriginal && originalFileCount > 0 ? 1 : 0) + additionalFileCount + (transcription.trim() ? 1 : 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Re-analisar {halfLabel}
          </DialogTitle>
          <DialogDescription>
            Deletar eventos existentes do {halfLabel} (minutos {minuteRange}) e executar nova análise
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Atenção</p>
                <p className="text-muted-foreground">
                  Todos os eventos do {halfLabel} serão deletados permanentemente antes da nova análise.
                </p>
              </div>
            </div>
          </div>

          {/* Seção de Transcrição Original */}
          {isLoadingOriginal ? (
            <div className="rounded-lg border-2 border-muted p-4 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Carregando transcrição original...</span>
              <Badge variant="outline" className="ml-2 text-xs">Preload ativo</Badge>
            </div>
          ) : originalTranscription ? (
            <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 font-semibold text-primary">
                  <Database className="h-4 w-4" />
                  Transcrição Original Disponível
                  <Badge variant="default" className="ml-2 text-xs bg-green-600">✓ Preload OK</Badge>
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Usar</span>
                  <Switch 
                    checked={useOriginal} 
                    onCheckedChange={(checked) => {
                      setUseOriginal(checked);
                      if (checked && !uploadedFiles.some(f => f.isOriginal)) {
                        setUploadedFiles(prev => [
                          { name: '📌 transcrição-original.srt', content: originalTranscription, isOriginal: true },
                          ...prev
                        ]);
                      }
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {(originalTranscription.length / 1024).toFixed(1)} KB • {originalTranscription.length.toLocaleString()} caracteres • Extraída na análise inicial
              </p>
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <ChevronDown className="h-3 w-3" />
                  Pré-visualizar conteúdo
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 max-h-32 overflow-auto text-xs bg-background/50 p-2 rounded border whitespace-pre-wrap">
                    {originalTranscription.slice(0, 2000)}
                    {originalTranscription.length > 2000 && '...'}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span>Nenhuma transcrição original encontrada</span>
                <Badge variant="outline" className="ml-auto text-xs border-amber-500/50">Preload: Vazio</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Esta partida não tem transcrição salva. Use "Extrair Nova Transcrição" ou importe um arquivo SRT.
              </p>
            </div>
          )}

          {/* Seção de Extração Automática - sempre disponível */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              Extração Automática
              {videoSizeMB !== null && (
                <Badge 
                  variant={isVideoTooLarge ? "secondary" : "outline"} 
                  className={`text-xs font-normal ${isVideoTooLarge ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : ''}`}
                >
                  {videoSizeMB}MB {isVideoTooLarge && '• Dividido em partes'}
                </Badge>
              )}
            </Label>
            
            {isVideoTooLarge && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
                Vídeo grande detectado - será dividido em partes de ~10 min para transcrição
              </div>
            )}
            
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleExtractTranscription}
              disabled={isTranscribing || isLoading || isDeleting || isCheckingVideoSize}
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {transcriptionProgress.currentPart && transcriptionProgress.totalParts 
                    ? `Parte ${transcriptionProgress.currentPart}/${transcriptionProgress.totalParts}...`
                    : 'Processando...'}
                </>
              ) : isCheckingVideoSize ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando vídeo...
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-4 w-4" />
                  Extrair Nova Transcrição (Whisper)
                </>
              )}
            </Button>
            {isTranscribing && (
              <div className="space-y-3 mt-4">
                <SoccerBallLoader
                  message={transcriptionProgress.message || 'Processando...'}
                  progress={transcriptionProgress.progress}
                  showProgress={true}
                  className="min-h-[160px]"
                />
                {transcriptionProgress.currentPart && transcriptionProgress.totalParts && (
                  <div className="flex gap-1 px-4">
                    {Array.from({ length: transcriptionProgress.totalParts }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 flex-1 rounded-full transition-colors ${
                          i < transcriptionProgress.currentPart! 
                            ? 'bg-green-500' 
                            : i === transcriptionProgress.currentPart! - 1 
                              ? 'bg-primary animate-pulse' 
                              : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Gera nova transcrição do áudio - será adicionada à lista de arquivos
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Arquivos Adicionais
              </span>
              <Badge variant="outline" className="font-normal">
                {uploadedFiles.length} arquivo(s)
              </Badge>
            </Label>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 hover:border-primary/50'}`}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <input
                id="file-upload"
                type="file"
                multiple
                accept=".srt,.vtt,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Arraste arquivos ou clique para adicionar</p>
              <p className="text-xs text-muted-foreground mt-1">SRT, VTT, TXT • Múltiplos arquivos permitidos</p>
            </div>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-2">
                <FileText className="h-3 w-3" />
                Lista de Arquivos ({uploadedFiles.length})
              </Label>
              <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border p-2">
                {uploadedFiles.map(file => (
                  <div 
                    key={file.name} 
                    className={`flex items-center justify-between p-2 rounded-md ${
                      file.isOriginal 
                        ? 'bg-primary/10 border border-primary/30' 
                        : 'bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm min-w-0">
                      {file.isOriginal ? (
                        <FileCheck className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <File className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">{file.name}</span>
                      {file.isOriginal && (
                        <Badge variant="default" className="text-xs shrink-0 bg-primary">
                          Original
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs shrink-0">
                        {(file.content.length / 1024).toFixed(1)} KB
                      </Badge>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 shrink-0" 
                      onClick={() => removeFile(file.name)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Texto Adicional (opcional)
            </Label>
            <Textarea
              placeholder="Cole texto adicional aqui..."
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              rows={3}
              className="resize-none font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              <Trash2 className="h-3 w-3 mr-1" />
              Deletar: {minuteRange}'
            </Badge>
            <Badge variant="secondary">
              <FileText className="h-3 w-3 mr-1" />
              {totalSources} fonte(s) de texto
            </Badge>
            {useOriginal && originalTranscription && (
              <Badge className="bg-primary">
                <Database className="h-3 w-3 mr-1" />
                Usando original
              </Badge>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading || isDeleting || isTranscribing}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleReanalyze} disabled={isLoading || isDeleting || isTranscribing}>
            {(isLoading || isDeleting) ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {isDeleting ? 'Deletando...' : isLoading ? 'Analisando...' : 'Re-analisar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
