import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { 
  AlertTriangle, Trash2, Music, Image, MessageSquare, 
  BarChart3, Video, Upload, Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReimportMatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  matchName: string;
}

export function ReimportMatchDialog({
  isOpen,
  onClose,
  matchId,
  matchName,
}: ReimportMatchDialogProps) {
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');

  const handleReset = async () => {
    if (!confirmed) return;
    
    setIsResetting(true);
    setProgress(0);

    try {
      // Step 1: Delete events
      setCurrentStep('Deletando eventos...');
      setProgress(10);
      await supabase.from('match_events').delete().eq('match_id', matchId);

      // Step 2: Delete analysis jobs
      setCurrentStep('Deletando análises...');
      setProgress(25);
      await supabase.from('analysis_jobs').delete().eq('match_id', matchId);

      // Step 3: Delete generated audio
      setCurrentStep('Deletando áudios...');
      setProgress(40);
      await supabase.from('generated_audio').delete().eq('match_id', matchId);

      // Step 4: Delete thumbnails
      setCurrentStep('Deletando thumbnails...');
      setProgress(55);
      await supabase.from('thumbnails').delete().eq('match_id', matchId);

      // Step 5: Delete chatbot conversations
      setCurrentStep('Deletando conversas...');
      setProgress(65);
      await supabase.from('chatbot_conversations').delete().eq('match_id', matchId);

      // Step 6: Delete videos (new - complete reset)
      setCurrentStep('Deletando vídeos...');
      setProgress(80);
      await supabase.from('videos').delete().eq('match_id', matchId);

      // Step 7: Reset match score and status
      setCurrentStep('Resetando partida...');
      setProgress(90);
      await supabase
        .from('matches')
        .update({ home_score: 0, away_score: 0, status: 'pending' })
        .eq('id', matchId);

      setProgress(100);
      setCurrentStep('Concluído!');
      
      toast.success('Partida resetada! Redirecionando para importação...');
      
      setTimeout(() => {
        onClose();
        navigate(`/upload?match=${matchId}`);
      }, 1000);

    } catch (error) {
      console.error('Reset error:', error);
      toast.error('Erro ao resetar partida');
      setIsResetting(false);
    }
  };

  const handleClose = () => {
    if (!isResetting) {
      setConfirmed(false);
      setProgress(0);
      setCurrentStep('');
      onClose();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reimportar Vídeos
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Esta ação irá <strong>deletar TUDO</strong> da partida "{matchName}" e redirecionar para importação de novos vídeos.
              </p>

              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-destructive flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Será deletado permanentemente:
                </p>
                <ul className="text-sm space-y-1.5 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-destructive" />
                    Todos os vídeos importados
                  </li>
                  <li className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-destructive" />
                    Todos os eventos detectados
                  </li>
                  <li className="flex items-center gap-2">
                    <Music className="h-4 w-4 text-destructive" />
                    Todos os áudios gerados
                  </li>
                  <li className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-destructive" />
                    Todas as thumbnails
                  </li>
                  <li className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-destructive" />
                    Conversas do chatbot
                  </li>
                </ul>
              </div>

              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                <p className="text-sm text-primary flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Após o reset, você poderá importar novos vídeos (MP4) para análise.
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
                    id="confirm-reimport"
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked === true)}
                  />
                  <label
                    htmlFor="confirm-reimport"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Entendo que TUDO será deletado
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Deletar e Reimportar
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
