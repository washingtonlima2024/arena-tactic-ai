import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Video, FileText, Calendar, Trophy, Users } from 'lucide-react';

interface LiveFinishDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  matchInfo: {
    homeTeam: string;
    awayTeam: string;
    competition: string;
  };
  score: {
    home: number;
    away: number;
  };
  recordingTime: number;
  eventsCount: number;
  transcriptWords: number;
  isFinishing: boolean;
}

export function LiveFinishDialog({
  isOpen,
  onClose,
  onConfirm,
  matchInfo,
  score,
  recordingTime,
  eventsCount,
  transcriptWords,
  isFinishing,
}: LiveFinishDialogProps) {
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Finalizar Transmissão
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              <p className="text-muted-foreground">
                Confirme os dados antes de salvar a partida no sistema.
              </p>

              {/* Match Summary */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                {/* Teams and Score */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {matchInfo.homeTeam || 'Time Casa'}
                    </span>
                  </div>
                  <span className="text-xl font-bold text-foreground">
                    {score.home} - {score.away}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {matchInfo.awayTeam || 'Time Fora'}
                  </span>
                </div>

                {/* Competition */}
                {matchInfo.competition && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {matchInfo.competition}
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <Video className="h-3 w-3" />
                    </div>
                    <p className="text-lg font-semibold text-foreground">{formatDuration(recordingTime)}</p>
                    <p className="text-xs text-muted-foreground">Duração</p>
                  </div>
                  <div className="text-center">
                    <Badge variant="arena" className="mb-1">{eventsCount}</Badge>
                    <p className="text-xs text-muted-foreground">Eventos</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <FileText className="h-3 w-3" />
                    </div>
                    <p className="text-lg font-semibold text-foreground">{transcriptWords}</p>
                    <p className="text-xs text-muted-foreground">Palavras</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Ao finalizar, o vídeo, transcrição e eventos serão salvos. 
                A partida ficará disponível para análise, geração de clips e mais.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isFinishing}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isFinishing}
            className="bg-primary hover:bg-primary/90"
          >
            {isFinishing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Finalizar e Salvar'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
