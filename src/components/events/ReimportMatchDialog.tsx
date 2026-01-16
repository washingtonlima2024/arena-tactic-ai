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
import { apiClient } from '@/lib/apiClient';
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
      // Use local server API to delete all related data
      setCurrentStep('Deletando dados relacionados...');
      setProgress(30);
      
      // Delete events via local API
      await apiClient.delete(`/api/matches/${matchId}/events`).catch(() => {});
      setProgress(50);
      
      // Delete videos via local API
      setCurrentStep('Deletando vídeos...');
      await apiClient.delete(`/api/matches/${matchId}/videos`).catch(() => {});
      setProgress(70);
      
      // Reset match status
      setCurrentStep('Resetando partida...');
      await apiClient.put(`/api/matches/${matchId}`, {
        home_score: 0,
        away_score: 0,
        status: 'pending'
      });

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
