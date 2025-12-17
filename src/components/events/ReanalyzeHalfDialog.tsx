import { useState, useCallback } from 'react';
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
import { 
  Loader2, 
  RefreshCw, 
  AlertTriangle, 
  FileText,
  Trash2,
  Upload,
  X,
  File
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useStartAnalysis } from '@/hooks/useAnalysisJob';

interface UploadedFile {
  name: string;
  content: string;
}

interface ReanalyzeHalfDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  half: 'first' | 'second';
  homeTeamId: string;
  awayTeamId: string;
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
  competition,
  onComplete
}: ReanalyzeHalfDialogProps) {
  const queryClient = useQueryClient();
  const { startAnalysis, isLoading } = useStartAnalysis();
  const [transcription, setTranscription] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const halfLabel = half === 'first' ? '1º Tempo' : '2º Tempo';
  const minuteRange = half === 'first' ? '0-44' : '45-90';

  const handleFileRead = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setUploadedFiles(prev => {
        // Avoid duplicates
        if (prev.some(f => f.name === file.name)) {
          return prev;
        }
        return [...prev, { name: file.name, content }];
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
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const getCombinedTranscription = () => {
    const parts: string[] = [];
    
    // Add uploaded files content
    uploadedFiles.forEach(file => {
      parts.push(`--- ${file.name} ---\n${file.content}`);
    });
    
    // Add manual text
    if (transcription.trim()) {
      parts.push(`--- Texto Manual ---\n${transcription}`);
    }
    
    return parts.join('\n\n');
  };

  const handleReanalyze = async () => {
    try {
      setIsDeleting(true);

      // Get video for this half
      const { data: videos } = await supabase
        .from('videos')
        .select('*')
        .eq('match_id', matchId)
        .order('start_minute', { ascending: true });

      const halfVideo = videos?.find(v => {
        const start = v.start_minute || 0;
        if (half === 'first') return start < 45;
        return start >= 45;
      });

      if (!halfVideo) {
        toast.error(`Nenhum vídeo encontrado para o ${halfLabel}`);
        return;
      }

      // Delete existing events for this half
      const minMinute = half === 'first' ? 0 : 45;
      const maxMinute = half === 'first' ? 44 : 90;

      const { error: deleteError } = await supabase
        .from('match_events')
        .delete()
        .eq('match_id', matchId)
        .gte('minute', minMinute)
        .lte('minute', maxMinute);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        toast.error('Erro ao deletar eventos antigos');
        return;
      }

      setIsDeleting(false);

      // Reset score for this half by recalculating from remaining events
      const { data: remainingGoals } = await supabase
        .from('match_events')
        .select('metadata')
        .eq('match_id', matchId)
        .eq('event_type', 'goal');

      let homeScore = 0;
      let awayScore = 0;
      remainingGoals?.forEach(g => {
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

      await supabase
        .from('matches')
        .update({ home_score: homeScore, away_score: awayScore })
        .eq('id', matchId);

      toast.info(`Re-análise do ${halfLabel} iniciada...`);

      // Combine all transcription sources
      const combinedTranscription = getCombinedTranscription();

      // Start new analysis
      await startAnalysis({
        matchId,
        videoUrl: halfVideo.file_url,
        homeTeamId,
        awayTeamId,
        competition,
        startMinute: halfVideo.start_minute || (half === 'first' ? 0 : 45),
        endMinute: halfVideo.end_minute || (half === 'first' ? 45 : 90),
        durationSeconds: halfVideo.duration_seconds || undefined,
        transcription: combinedTranscription || undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['match-events', matchId] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });

      toast.success(`Re-análise do ${halfLabel} em andamento`);
      onComplete();
      onClose();
      
      // Reset state
      setTranscription('');
      setUploadedFiles([]);

    } catch (error) {
      console.error('Reanalyze error:', error);
      toast.error('Erro ao re-analisar');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
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
          {/* Warning */}
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

          {/* File Upload Dropzone */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Arquivos de Transcrição (opcional)
            </Label>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              className={`
                border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer
                ${isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 hover:border-primary/50'}
              `}
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
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Arraste arquivos ou clique para selecionar
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                SRT, VTT, TXT (múltiplos arquivos)
              </p>
            </div>
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {uploadedFiles.length} arquivo(s) carregado(s)
              </Label>
              <div className="space-y-1">
                {uploadedFiles.map(file => (
                  <div 
                    key={file.name}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <File className="h-4 w-4 text-primary" />
                      <span className="truncate max-w-[200px]">{file.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {(file.content.length / 1024).toFixed(1)} KB
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeFile(file.name)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual transcription textarea */}
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

          {/* Info badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              <Trash2 className="h-3 w-3 mr-1" />
              Deletar eventos: {minuteRange}'
            </Badge>
            <Badge variant="outline">
              <RefreshCw className="h-3 w-3 mr-1" />
              Nova análise
            </Badge>
            {(uploadedFiles.length > 0 || transcription) && (
              <Badge variant="secondary">
                <FileText className="h-3 w-3 mr-1" />
                {uploadedFiles.length} arquivo(s) + texto
              </Badge>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading || isDeleting}>
            Cancelar
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleReanalyze}
            disabled={isLoading || isDeleting}
          >
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