import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, Loader2, Mic, Wifi, WifiOff } from "lucide-react";
import { useElevenLabsScribe } from "@/hooks/useElevenLabsScribe";
import { TranscriptChunk } from "@/hooks/useLiveBroadcast";

interface LiveTranscriptRealtimeProps {
  isRecording: boolean;
  onTranscriptUpdate?: (buffer: string, chunks: TranscriptChunk[]) => void;
}

export const LiveTranscriptRealtime = ({
  isRecording,
  onTranscriptUpdate,
}: LiveTranscriptRealtimeProps) => {
  const chunksRef = useRef<TranscriptChunk[]>([]);
  const bufferRef = useRef<string>("");
  const recordingTimeRef = useRef<number>(0);

  // Timer for recording time
  useEffect(() => {
    if (isRecording) {
      recordingTimeRef.current = 0;
      const timer = setInterval(() => {
        recordingTimeRef.current += 1;
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isRecording]);

  const scribe = useElevenLabsScribe({
    onTranscript: (text) => {
      const minute = Math.floor(recordingTimeRef.current / 60);
      const second = recordingTimeRef.current % 60;
      
      const newChunk: TranscriptChunk = {
        id: crypto.randomUUID(),
        text,
        minute,
        second,
        timestamp: new Date(),
      };
      
      chunksRef.current = [...chunksRef.current, newChunk];
      bufferRef.current = bufferRef.current + " " + text;
      
      onTranscriptUpdate?.(bufferRef.current.trim(), chunksRef.current);
    },
    onPartialTranscript: (text) => {
      // Partial transcript is handled by the hook
    },
  });

  // Connect/disconnect based on recording state
  useEffect(() => {
    if (isRecording && !scribe.isConnected && !scribe.isConnecting) {
      // Reset state
      chunksRef.current = [];
      bufferRef.current = "";
      
      scribe.connect();
    } else if (!isRecording && scribe.isConnected) {
      scribe.disconnect();
    }
  }, [isRecording, scribe.isConnected, scribe.isConnecting, scribe]);

  const wordCount = bufferRef.current.trim().split(/\s+/).filter(Boolean).length + 
    (scribe.partialTranscript ? scribe.partialTranscript.split(/\s+/).filter(Boolean).length : 0);

  return (
    <div className="glass-card p-4 rounded-xl h-full min-h-[300px] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2 text-foreground">
          <FileText className="h-5 w-5 text-primary" />
          Transcrição Ao Vivo
        </h3>
        <div className="flex items-center gap-2">
          {scribe.isConnecting && (
            <Badge variant="outline" className="text-blue-500 border-blue-500/50">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Conectando...
            </Badge>
          )}
          {scribe.isConnected ? (
            <Badge variant="outline" className="text-green-500 border-green-500/50">
              <Wifi className="h-3 w-3 mr-1" />
              ElevenLabs
            </Badge>
          ) : !isRecording ? null : (
            <Badge variant="outline" className="text-muted-foreground border-muted-foreground/50">
              <WifiOff className="h-3 w-3 mr-1" />
              Desconectado
            </Badge>
          )}
          <Badge variant="secondary">
            {wordCount} palavras
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 pr-2">
          {chunksRef.current.length === 0 && !scribe.partialTranscript ? (
            <div className="text-center text-muted-foreground py-8">
              {isRecording ? (
                <div className="space-y-2">
                  {scribe.isConnecting ? (
                    <>
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                      <p>Conectando ao ElevenLabs Scribe...</p>
                    </>
                  ) : scribe.isConnected ? (
                    <>
                      <Mic className="h-8 w-8 mx-auto text-green-500 animate-pulse" />
                      <p>Ouvindo...</p>
                      <p className="text-xs">Transcrição em tempo real</p>
                    </>
                  ) : (
                    <>
                      <Mic className="h-8 w-8 mx-auto text-red-500 animate-pulse" />
                      <p>Aguardando conexão...</p>
                    </>
                  )}
                </div>
              ) : (
                <p>Inicie a gravação para ver a transcrição</p>
              )}
            </div>
          ) : (
            <>
              {/* Committed transcripts */}
              {scribe.committedTranscripts.map((transcript) => (
                <div key={transcript.id} className="border-l-2 border-primary/30 pl-3 py-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(transcript.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-sm text-foreground">{transcript.text}</p>
                </div>
              ))}
              
              {/* Partial transcript (live) */}
              {scribe.partialTranscript && (
                <div className="border-l-2 border-yellow-500/50 pl-3 py-1 animate-pulse">
                  <div className="flex items-center gap-2 text-xs text-yellow-500 mb-1">
                    <Mic className="h-3 w-3" />
                    <span>Ao vivo</span>
                  </div>
                  <p className="text-sm text-foreground/80 italic">{scribe.partialTranscript}</p>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Status indicator */}
      {isRecording && scribe.isConnected && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Transcrição em tempo real via ElevenLabs Scribe
          </p>
        </div>
      )}

      {scribe.error && (
        <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
          {scribe.error}
        </div>
      )}
    </div>
  );
};
