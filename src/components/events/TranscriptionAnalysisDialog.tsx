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
import { Loader2, FileText, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useMatchAnalysis } from '@/hooks/useMatchAnalysis';
import { Progress } from '@/components/ui/progress';

interface TranscriptionAnalysisDialogProps {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  videoUrl?: string;
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
  const { analyzeWithTranscription, isAnalyzing, progress } = useMatchAnalysis();

  const handleAnalyze = async () => {
    if (!transcription.trim()) {
      toast.error('Cole a transcrição do áudio para analisar');
      return;
    }

    if (transcription.length < 50) {
      toast.error('Transcrição muito curta. Forneça o texto completo da narração.');
      return;
    }

    const result = await analyzeWithTranscription({
      matchId,
      transcription,
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      gameStartMinute: 0,
      gameEndMinute: 90
    });
    
    if (result?.success) {
      toast.success(`Análise concluída! ${result.eventsDetected} eventos detectados.`);
      onAnalysisComplete();
      setOpen(false);
      setTranscription('');
    }
  };

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
            Cole a transcrição da narração. A IA vai identificar gols, cartões e outros eventos.
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
                  <li>Cole o texto completo da transcrição</li>
                  <li>A IA procura por: "gol", "goool", "cartão", "falta", "pênalti"</li>
                  <li>Quanto mais contexto, melhor a detecção</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Transcription Input */}
          <Textarea
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            placeholder="Cole a transcrição da narração aqui..."
            className="min-h-[200px] font-mono text-sm"
          />

          {/* Progress */}
          {isAnalyzing && (
            <div className="space-y-2">
              <Progress value={progress.progress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">{progress.message}</p>
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
            disabled={isAnalyzing || !transcription.trim()}
          >
            {isAnalyzing ? (
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
