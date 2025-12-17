import { useState } from 'react';
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
  Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useStartAnalysis } from '@/hooks/useAnalysisJob';

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
  const [isDeleting, setIsDeleting] = useState(false);

  const halfLabel = half === 'first' ? '1º Tempo' : '2º Tempo';
  const minuteRange = half === 'first' ? '0-44' : '45-90';

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
        transcription: transcription || undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['match-events', matchId] });
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });

      toast.success(`Re-análise do ${halfLabel} em andamento`);
      onComplete();
      onClose();

    } catch (error) {
      console.error('Reanalyze error:', error);
      toast.error('Erro ao re-analisar');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
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

          {/* Optional transcription */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Transcrição (opcional)
            </Label>
            <Textarea
              placeholder="Cole aqui a transcrição/SRT do vídeo para melhorar a detecção de eventos..."
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              rows={5}
              className="resize-none font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Fornecer uma transcrição melhora significativamente a detecção de gols e eventos importantes.
            </p>
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