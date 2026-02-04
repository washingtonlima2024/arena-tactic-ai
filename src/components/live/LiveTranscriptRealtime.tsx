import { useEffect, useRef, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, Loader2, Wifi, WifiOff, Save, CheckCircle, Zap, Video, Globe } from "lucide-react";
import { useVideoAudioTranscription } from "@/hooks/useVideoAudioTranscription";
import { TranscriptChunk } from "@/hooks/useLiveBroadcast";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { generateUUID } from "@/lib/utils";

const LANGUAGES = [
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "en", label: "English", flag: "🇺🇸" },
] as const;

interface ExtractedEvent {
  type: string;
  minute: number;
  second: number;
  description: string;
  confidence: number;
  windowBefore?: number;
  windowAfter?: number;
}

interface LiveTranscriptRealtimeProps {
  isRecording: boolean;
  matchId?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  currentScore?: { home: number; away: number };
  videoElement?: HTMLVideoElement | null;
  onTranscriptUpdate?: (buffer: string, chunks: TranscriptChunk[]) => void;
  onEventDetected?: (event: ExtractedEvent) => void;
}

export const LiveTranscriptRealtime = ({
  isRecording,
  matchId,
  homeTeam,
  awayTeam,
  currentScore,
  videoElement,
  onTranscriptUpdate,
  onEventDetected,
}: LiveTranscriptRealtimeProps) => {
  const { toast } = useToast();
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<string>("pt");
  
  // Use useState instead of useRef for re-rendering
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [transcriptBuffer, setTranscriptBuffer] = useState("");
  const recordingTimeRef = useRef<number>(0);
  const pendingTranscriptsRef = useRef<string[]>([]);
  const extractionInProgressRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [eventsExtracted, setEventsExtracted] = useState(0);

  // Auto-scroll suave para manter o conteúdo mais recente visível no topo
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, [chunks, transcriptBuffer]);

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

  // Extract events from transcript
  const extractEvents = useCallback(async (transcript: string) => {
    if (!transcript.trim() || extractionInProgressRef.current) {
      // Queue the transcript for later processing
      if (transcript.trim()) {
        pendingTranscriptsRef.current.push(transcript);
      }
      return;
    }

    extractionInProgressRef.current = true;
    setIsExtracting(true);

    try {
      // Combine pending transcripts
      const allTranscripts = [...pendingTranscriptsRef.current, transcript].join(" ");
      pendingTranscriptsRef.current = [];

      const currentMinute = Math.floor(recordingTimeRef.current / 60);

      const { data, error } = await supabase.functions.invoke("extract-live-events", {
        body: {
          transcript: allTranscripts,
          homeTeam: homeTeam || "Time Casa",
          awayTeam: awayTeam || "Time Fora",
          currentScore: currentScore || { home: 0, away: 0 },
          currentMinute,
        },
      });

      if (error) {
        console.error("Error extracting events:", error);
        return;
      }

      const events = data?.events || [];
      
      if (events.length > 0) {
        console.log(`Extracted ${events.length} events from transcript`);
        setEventsExtracted((prev) => prev + events.length);
        
        // Notify parent component of each detected event with window parameters
        events.forEach((event: any) => {
          const enrichedEvent: ExtractedEvent = {
            type: event.type,
            minute: currentMinute,
            second: recordingTimeRef.current % 60,
            description: event.description,
            confidence: event.confidence || 0.8,
            windowBefore: event.windowBefore || 5,
            windowAfter: event.windowAfter || 5,
          };
          onEventDetected?.(enrichedEvent);
        });
      }
    } catch (error) {
      console.error("Error calling extract-live-events:", error);
    } finally {
      extractionInProgressRef.current = false;
      setIsExtracting(false);

      // Process any pending transcripts
      if (pendingTranscriptsRef.current.length > 0) {
        const pending = pendingTranscriptsRef.current.join(" ");
        pendingTranscriptsRef.current = [];
        extractEvents(pending);
      }
    }
  }, [homeTeam, awayTeam, currentScore, onEventDetected]);

  // Save transcript to database
  const saveTranscriptToDatabase = useCallback(async (text: string, fullTranscript: string) => {
    if (!matchId || !text.trim()) return;
    
    setIsSaving(true);
    setSaveError(null);
    
    try {
      // Check if there's already a transcript for this match
      const { data: existing } = await supabase
        .from("generated_audio")
        .select("id, script")
        .eq("match_id", matchId)
        .eq("audio_type", "live_transcript")
        .maybeSingle();

      if (existing) {
        // Update existing transcript
        await supabase
          .from("generated_audio")
          .update({
            script: fullTranscript,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        // Create new transcript entry
        await supabase
          .from("generated_audio")
          .insert({
            match_id: matchId,
            audio_type: "live_transcript",
            script: fullTranscript,
            voice: "whisper-local",
          });
      }

      setLastSavedAt(new Date());
      console.log("Transcript saved to database:", fullTranscript.length, "chars");
    } catch (error) {
      console.error("Error saving transcript:", error);
      setSaveError(error instanceof Error ? error.message : "Erro ao salvar");
    } finally {
      setIsSaving(false);
    }
  }, [matchId]);

  // Callback for video audio transcription
  const handleVideoTranscript = useCallback((text: string) => {
    const minute = Math.floor(recordingTimeRef.current / 60);
    const second = recordingTimeRef.current % 60;
    
    const newChunk: TranscriptChunk = {
      id: generateUUID(),
      text,
      minute,
      second,
      timestamp: new Date(),
    };
    
    setChunks(prev => {
      const updated = [...prev, newChunk];
      return updated;
    });
    
    setTranscriptBuffer(prev => {
      const newBuffer = prev + " " + text;
      onTranscriptUpdate?.(newBuffer.trim(), []);
      saveTranscriptToDatabase(text, newBuffer.trim());
      return newBuffer;
    });
    
    extractEvents(text);
  }, [onTranscriptUpdate, extractEvents, saveTranscriptToDatabase]);

  // Video audio transcription hook (Whisper Local)
  const videoTranscription = useVideoAudioTranscription({
    onTranscript: (text) => {
      handleVideoTranscript(text);
    },
    onPartialTranscript: (text) => {
      // Handled by hook
    },
    chunkDurationMs: 10000,
    language: transcriptionLanguage,
  });

  // Connect/disconnect based on recording state
  useEffect(() => {
    let isMounted = true;
    
    const connectWithDelay = async () => {
      if (isRecording && videoElement) {
        // Reset state when starting
        setChunks([]);
        setTranscriptBuffer("");
        setEventsExtracted(0);
        
        // Add small delay to prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Check if still mounted before connecting
        if (!isMounted) return;
        
        // Connect to video audio
        if (!videoTranscription.isConnected && !videoTranscription.isConnecting) {
          videoTranscription.connect(videoElement);
        }
      } else {
        // Disconnect when not recording
        if (videoTranscription.isConnected) {
          videoTranscription.disconnect();
        }
      }
    };
    
    connectWithDelay();
    
    // Cleanup on unmount
    return () => {
      isMounted = false;
      console.log('[LiveTranscriptRealtime] Cleanup on unmount');
      
      try {
        videoTranscription.disconnect();
      } catch (e) {
        console.warn('[LiveTranscriptRealtime] Error disconnecting video transcription:', e);
      }
    };
  }, [isRecording, videoElement]);

  // Get active transcription state
  const isConnected = videoTranscription.isConnected;
  const isConnecting = videoTranscription.isConnecting;
  const partialTranscript = videoTranscription.partialTranscript;
  const committedTranscripts = videoTranscription.committedTranscripts;
  const transcriptionError = videoTranscription.error;

  const wordCount = transcriptBuffer.trim().split(/\s+/).filter(Boolean).length + 
    (partialTranscript ? partialTranscript.split(/\s+/).filter(Boolean).length : 0);

  return (
    <div className="glass-card p-4 rounded-xl h-full min-h-[300px] flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2 text-foreground">
          <FileText className="h-5 w-5 text-primary" />
          Transcrição Ao Vivo
        </h3>
        
        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <Select
            value={transcriptionLanguage}
            onValueChange={setTranscriptionLanguage}
            disabled={isRecording}
          >
            <SelectTrigger className="w-[110px] h-7 text-xs">
              <Globe className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code} className="text-xs">
                  <span className="mr-1">{lang.flag}</span>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Source indicator */}
          <Badge variant="outline" className="text-xs gap-1">
            <Video className="h-3 w-3" />
            kakttus.ai Local
          </Badge>
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {isSaving && (
          <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
            <Save className="h-3 w-3 mr-1 animate-pulse" />
            Salvando...
          </Badge>
        )}
        {!isSaving && lastSavedAt && (
          <Badge variant="outline" className="text-green-500 border-green-500/50">
            <CheckCircle className="h-3 w-3 mr-1" />
            Salvo
          </Badge>
        )}
        {isConnecting && (
          <Badge variant="outline" className="text-blue-500 border-blue-500/50">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Conectando...
          </Badge>
        )}
        {isConnected ? (
          <Badge variant="outline" className="text-green-500 border-green-500/50">
            <Wifi className="h-3 w-3 mr-1" />
            Kakttus AI
          </Badge>
        ) : !isRecording ? null : !isConnecting ? (
          <Badge variant="outline" className="text-muted-foreground border-muted-foreground/50">
            <WifiOff className="h-3 w-3 mr-1" />
            Desconectado
          </Badge>
        ) : null}
        <Badge variant="secondary">
          {wordCount} palavras
        </Badge>
        {eventsExtracted > 0 && (
          <Badge variant="outline" className="text-purple-500 border-purple-500/50">
            <Zap className="h-3 w-3 mr-1" />
            {eventsExtracted} eventos
          </Badge>
        )}
        {isExtracting && (
          <Badge variant="outline" className="text-purple-500 border-purple-500/50">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Extraindo...
          </Badge>
        )}
      </div>

      {/* Transcript Content */}
      <ScrollArea className="flex-1 pr-2" ref={scrollRef}>
        <div className="space-y-2">
          {/* Current partial transcript */}
          {partialTranscript && (
            <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs bg-primary/20">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Ao vivo
                </Badge>
              </div>
              <p className="text-sm text-foreground/80 italic">{partialTranscript}</p>
            </div>
          )}

          {/* Committed transcripts - newest first */}
          {[...chunks].reverse().map((chunk) => (
            <div key={chunk.id} className="p-2 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {chunk.minute}:{String(chunk.second).padStart(2, "0")}
                </Badge>
              </div>
              <p className="text-sm text-foreground">{chunk.text}</p>
            </div>
          ))}

          {/* Empty state */}
          {!isRecording && chunks.length === 0 && !partialTranscript && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Inicie a gravação para ver a transcrição ao vivo</p>
              <p className="text-xs mt-1">Usando kakttus.ai Local (GPU)</p>
            </div>
          )}

          {/* Recording but no transcripts yet */}
          {isRecording && chunks.length === 0 && !partialTranscript && (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Aguardando áudio...</p>
              {!videoElement && (
                <p className="text-xs mt-1 text-yellow-500">
                  Nenhum vídeo disponível para captura de áudio
                </p>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Error Display */}
      {transcriptionError && (
        <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-xs text-destructive">{transcriptionError}</p>
        </div>
      )}

      {saveError && (
        <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-xs text-destructive">Erro ao salvar: {saveError}</p>
        </div>
      )}
    </div>
  );
};
