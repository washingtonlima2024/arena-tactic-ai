import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Clock, Save, CheckCircle, Loader2, Mic } from "lucide-react";
import { TranscriptChunk } from "@/hooks/useLiveBroadcast";

interface LiveTranscriptProps {
  transcriptBuffer: string;
  transcriptChunks: TranscriptChunk[];
  isSaving: boolean;
  lastSavedAt: Date | null;
  isRecording: boolean;
  isProcessingAudio?: boolean;
  lastProcessedAt?: Date | null;
  onProcessNow?: () => void;
}

export const LiveTranscript = ({
  transcriptBuffer,
  transcriptChunks,
  isSaving,
  lastSavedAt,
  isRecording,
  isProcessingAudio = false,
  lastProcessedAt,
  onProcessNow,
}: LiveTranscriptProps) => {
  const wordCount = transcriptBuffer.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="glass-card p-4 rounded-xl h-[300px] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2 text-foreground">
          <FileText className="h-5 w-5 text-primary" />
          Transcrição Ao Vivo
        </h3>
        <div className="flex items-center gap-2">
          {isProcessingAudio && (
            <Badge variant="outline" className="text-blue-500 border-blue-500/50">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Transcrevendo...
            </Badge>
          )}
          {isSaving ? (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
              <Save className="h-3 w-3 mr-1 animate-pulse" />
              Salvando...
            </Badge>
          ) : lastSavedAt ? (
            <Badge variant="outline" className="text-green-500 border-green-500/50">
              <CheckCircle className="h-3 w-3 mr-1" />
              Salvo
            </Badge>
          ) : null}
          <Badge variant="secondary">
            {wordCount} palavras
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 pr-2">
          {transcriptChunks.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {isRecording ? (
                <div className="space-y-2">
                  {isProcessingAudio ? (
                    <>
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                      <p>Processando áudio...</p>
                    </>
                  ) : (
                    <>
                      <Mic className="h-8 w-8 mx-auto text-red-500 animate-pulse" />
                      <p>Gravando áudio...</p>
                      <p className="text-xs">Transcrição automática a cada 10s</p>
                    </>
                  )}
                </div>
              ) : (
                <p>Inicie a gravação para ver a transcrição</p>
              )}
            </div>
          ) : (
            transcriptChunks.map((chunk) => (
              <div key={chunk.id} className="border-l-2 border-primary/30 pl-3 py-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Clock className="h-3 w-3" />
                  <span>{chunk.minute}'{chunk.second.toString().padStart(2, "0")}"</span>
                </div>
                <p className="text-sm text-foreground">{chunk.text}</p>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Status indicator */}
      {isRecording && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Transcrição a cada 10s
              {lastProcessedAt && (
                <span className="ml-2">
                  • Último: {lastProcessedAt.toLocaleTimeString()}
                </span>
              )}
            </p>
            {onProcessNow && (
              <Button
                size="sm"
                variant="outline"
                onClick={onProcessNow}
                disabled={isProcessingAudio}
                className="h-6 text-xs"
              >
                {isProcessingAudio ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Processar Agora"
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
