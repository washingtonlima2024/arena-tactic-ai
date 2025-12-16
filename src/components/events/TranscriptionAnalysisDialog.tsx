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
import { Loader2, FileText, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useRefineEvents } from '@/hooks/useRefineEvents';
import { TranscriptionImport } from '@/components/upload/TranscriptionImport';
import { type ParseResult } from '@/lib/transcriptionParser';

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
  videoUrl,
  onAnalysisComplete,
  children
}: TranscriptionAnalysisDialogProps) {
  const [open, setOpen] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const { refineEvents, isRefining, result } = useRefineEvents();

  const handleTranscriptionChange = (value: string, result?: ParseResult) => {
    setTranscription(value);
    setParseResult(result || null);
  };

  const handleAnalyze = async () => {
    // Use raw text from parse result if available
    const textToAnalyze = parseResult?.rawText || transcription;
    
    if (!textToAnalyze.trim()) {
      toast.error('Importe ou cole a transcrição do áudio para analisar');
      return;
    }

    if (textToAnalyze.length < 50) {
      toast.error('Transcrição muito curta. Forneça o texto completo da narração.');
      return;
    }

    const analysisResult = await refineEvents(matchId, textToAnalyze);
    
    if (analysisResult) {
      toast.success(`Análise concluída! ${analysisResult.goalsDetected} gols detectados.`);
      onAnalysisComplete();
      setOpen(false);
      setTranscription('');
      setParseResult(null);
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
            Importe ou cole a transcrição da narração. A IA vai identificar gols, cartões e outros eventos.
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
                  <li>Formatos aceitos: SRT, VTT, TXT, JSON</li>
                  <li>A IA procura por: "gol", "goool", "cartão", "falta", "pênalti"</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Transcription Import Component */}
          <TranscriptionImport
            value={transcription}
            onChange={handleTranscriptionChange}
            videoUrl={videoUrl}
            matchId={matchId}
          />

          {/* Pre-detected events preview from import */}
          {parseResult && parseResult.detectedEvents.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <span className="text-primary font-medium">
                {parseResult.detectedEvents.filter(e => e.type === 'goal').length} gols,{' '}
                {parseResult.detectedEvents.filter(e => e.type === 'card').length} cartões,{' '}
                {parseResult.detectedEvents.filter(e => e.type === 'foul').length} faltas
              </span>{' '}
              pré-detectados na transcrição
            </div>
          )}

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
