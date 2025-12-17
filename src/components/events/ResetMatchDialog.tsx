import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, RefreshCw, Trash2, Music, Image, MessageSquare, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStartAnalysis } from '@/hooks/useAnalysisJob';

interface ResetMatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  videos: Array<{
    id: string;
    file_url: string;
    start_minute: number | null;
    end_minute: number | null;
    duration_seconds: number | null;
  }>;
  homeTeamId: string | null;
  awayTeamId: string | null;
  competition: string | null;
  onResetComplete: () => void;
}

export function ResetMatchDialog({
  isOpen,
  onClose,
  matchId,
  videos,
  homeTeamId,
  awayTeamId,
  competition,
  onResetComplete,
}: ResetMatchDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const { startAnalysis } = useStartAnalysis();

  const handleReset = async () => {
    if (!confirmed) return;
    
    setIsResetting(true);
    setProgress(0);

    try {
      // Step 1: Delete events
      setCurrentStep('Deletando eventos...');
      setProgress(10);
      const { error: eventsError } = await supabase
        .from('match_events')
        .delete()
        .eq('match_id', matchId);
      if (eventsError) throw new Error(`Erro ao deletar eventos: ${eventsError.message}`);

      // Step 2: Delete analysis jobs
      setCurrentStep('Deletando análises anteriores...');
      setProgress(25);
      const { error: analysisError } = await supabase
        .from('analysis_jobs')
        .delete()
        .eq('match_id', matchId);
      if (analysisError) throw new Error(`Erro ao deletar análises: ${analysisError.message}`);

      // Step 3: Delete generated audio
      setCurrentStep('Deletando áudios gerados...');
      setProgress(40);
      const { error: audioError } = await supabase
        .from('generated_audio')
        .delete()
        .eq('match_id', matchId);
      if (audioError) throw new Error(`Erro ao deletar áudios: ${audioError.message}`);

      // Step 4: Delete thumbnails
      setCurrentStep('Deletando thumbnails...');
      setProgress(55);
      const { error: thumbnailsError } = await supabase
        .from('thumbnails')
        .delete()
        .eq('match_id', matchId);
      if (thumbnailsError) throw new Error(`Erro ao deletar thumbnails: ${thumbnailsError.message}`);

      // Step 5: Delete chatbot conversations
      setCurrentStep('Deletando conversas do chatbot...');
      setProgress(70);
      const { error: chatbotError } = await supabase
        .from('chatbot_conversations')
        .delete()
        .eq('match_id', matchId);
      if (chatbotError) throw new Error(`Erro ao deletar conversas: ${chatbotError.message}`);

      // Step 6: Reset match score
      setCurrentStep('Resetando placar...');
      setProgress(80);
      const { error: matchError } = await supabase
        .from('matches')
        .update({ home_score: 0, away_score: 0, status: 'pending' })
        .eq('id', matchId);
      if (matchError) throw new Error(`Erro ao resetar partida: ${matchError.message}`);

      // Step 7: Start new analysis for all videos
      setCurrentStep('Iniciando nova análise...');
      setProgress(90);
      
      for (const video of videos) {
        await startAnalysis({
          matchId,
          videoUrl: video.file_url,
          homeTeamId: homeTeamId || undefined,
          awayTeamId: awayTeamId || undefined,
          competition: competition || undefined,
          startMinute: video.start_minute ?? 0,
          endMinute: video.end_minute ?? 45,
          durationSeconds: video.duration_seconds ?? undefined,
        });
      }

      setProgress(100);
      setCurrentStep('Concluído!');
      
      toast.success('Reset completo! Nova análise iniciada.');
      onResetComplete();
      
      setTimeout(() => {
        onClose();
        setIsResetting(false);
        setProgress(0);
        setCurrentStep('');
        setConfirmed(false);
      }, 1000);

    } catch (error) {
      console.error('Reset error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao resetar partida');
      setIsResetting(false);
    }
  };

  const handleClose = () => {
    if (!isResetting) {
      setConfirmed(false);
      onClose();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Refazer Análise Completa
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Esta ação irá deletar <strong>todos os dados</strong> relacionados a esta partida e iniciar uma nova análise do zero.
              </p>
              
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-destructive">Será deletado:</p>
                <ul className="text-sm space-y-1.5 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-destructive" />
                    Todos os eventos detectados
                  </li>
                  <li className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-destructive" />
                    Jobs de análise anteriores
                  </li>
                  <li className="flex items-center gap-2">
                    <Music className="h-4 w-4 text-destructive" />
                    Áudios gerados (narrações, podcasts)
                  </li>
                  <li className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-destructive" />
                    Thumbnails geradas
                  </li>
                  <li className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-destructive" />
                    Conversas do chatbot
                  </li>
                </ul>
                <p className="text-sm text-destructive font-medium pt-1">
                  Placar será resetado para 0 x 0
                </p>
              </div>

              {isResetting ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{currentStep}</span>
                    <span className="text-primary font-medium">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              ) : (
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="confirm-reset"
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked === true)}
                  />
                  <label
                    htmlFor="confirm-reset"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Entendo que esta ação é irreversível
                  </label>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isResetting}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={!confirmed || isResetting}
          >
            {isResetting ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refazer Análise
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
