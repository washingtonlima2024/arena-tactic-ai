import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useRefineEvents } from '@/hooks/useRefineEvents';

interface TranscriptionAnalysisDialogProps {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  onAnalysisComplete: () => void;
  children: React.ReactNode;
}

export function TranscriptionAnalysisDialog({
  matchId,
  homeTeamName,
  awayTeamName,
  onAnalysisComplete,
  children
}: TranscriptionAnalysisDialogProps) {
  const [open, setOpen] = useState(false);
  const [transcription, setTranscription] = useState('');
  const { refineEvents, isRefining, result } = useRefineEvents();

  const handleAnalyze = async () => {
    if (!transcription.trim()) {
      toast.error('Cole a transcrição do áudio para analisar');
      return;
    }

    if (transcription.length < 50) {
      toast.error('Transcrição muito curta. Cole o texto completo da narração.');
      return;
    }

    const analysisResult = await refineEvents(matchId, transcription);
    
    if (analysisResult) {
      toast.success(`Análise concluída! ${analysisResult.goalsDetected} gols detectados.`);
      onAnalysisComplete();
      setOpen(false);
      setTranscription('');
    }
  };

  const exampleTranscription = `[00:15] Bola rolando para o segundo tempo!
[00:45] GOOOOL do Brasil! Que jogada linda!
[01:12] Brasil vai pra cima, pressão total.
[01:30] Cartão amarelo para o jogador da Argentina.
[02:00] Outra chance do Brasil, quase o segundo gol!`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Analisar Transcrição do Áudio
          </DialogTitle>
          <DialogDescription>
            Cole a transcrição da narração do jogo. A IA vai identificar gols, cartões e outros eventos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Match Info */}
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm font-medium">
              Partida: <span className="text-primary">{homeTeamName} vs {awayTeamName}</span>
            </p>
          </div>

          {/* Tips */}
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
            <div className="flex gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-yellow-500 mb-1">Dicas para melhor detecção:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Inclua timestamps quando possível [00:00]</li>
                  <li>Mantenha menções aos times ({homeTeamName}, {awayTeamName})</li>
                  <li>A IA procura por: "gol", "goool", "cartão", "falta", "pênalti"</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Transcription Input */}
          <div className="space-y-2">
            <Label htmlFor="transcription">Transcrição da Narração</Label>
            <Textarea
              id="transcription"
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              placeholder={exampleTranscription}
              className="min-h-[200px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {transcription.length} caracteres
            </p>
          </div>

          {/* Result Preview */}
          {result && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
              <p className="text-sm font-medium text-green-500 mb-2">Resultado da Análise:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Gols detectados: <span className="font-bold">{result.goalsDetected}</span></div>
                <div>Eventos refinados: <span className="font-bold">{result.eventsRefined}</span></div>
                {result.scoreUpdated && (
                  <div className="col-span-2">
                    Placar atualizado: <span className="font-bold">{result.homeScore} x {result.awayScore}</span>
                  </div>
                )}
              </div>
              {result.issues && result.issues.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Problemas: {result.issues.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button 
            variant="arena" 
            onClick={handleAnalyze}
            disabled={isRefining || !transcription.trim()}
          >
            {isRefining ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Analisar com IA
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
