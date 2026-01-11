import { useEffect, useRef, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, Loader2, Mic, Wifi, WifiOff, Save, CheckCircle, Zap, Video, Globe, RefreshCw } from "lucide-react";
import { useElevenLabsScribe } from "@/hooks/useElevenLabsScribe";
import { useVideoAudioTranscription } from "@/hooks/useVideoAudioTranscription";
import { TranscriptChunk } from "@/hooks/useLiveBroadcast";
import { supabase } from "@/integrations/supabase/client";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VolumeIndicator } from "./VolumeIndicator";
import { useToast } from "@/hooks/use-toast";

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
  // Audio source: "mic" for microphone (ElevenLabs), "video" for video audio (Whisper)
  const [audioSource, setAudioSource] = useState<"mic" | "video">("mic");
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
            voice: "elevenlabs-scribe",
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
      id: crypto.randomUUID(),
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

  // Track if we've attempted fallback
  const [hasFallenBack, setHasFallenBack] = useState(false);
  const connectionAttemptRef = useRef(0);

  // ElevenLabs Scribe for microphone with enhanced error handling
  const scribe = useElevenLabsScribe({
    onTranscript: (text) => {
      if (audioSource !== "mic") return;
      handleVideoTranscript(text);
    },
    onPartialTranscript: (text) => {
      // Partial transcript is handled by the hook
    },
    onConnectionChange: (connected) => {
      console.log('Scribe connection changed:', connected);
      if (connected) {
        connectionAttemptRef.current = 0;
      }
    },
    onConnectionError: (errorMsg) => {
      console.error('Scribe connection error callback:', errorMsg);
      
      // If connection failed after retries and we're recording, fallback to video mode
      if (isRecording && audioSource === "mic" && !hasFallenBack && videoElement) {
        console.log('Falling back to video audio transcription');
        setHasFallenBack(true);
        setAudioSource("video");
        toast({
          title: "Modo alternativo ativado",
          description: "Usando áudio do vídeo para transcrição",
        });
      }
    },
  });

  // Video audio transcription hook
  const videoTranscription = useVideoAudioTranscription({
    onTranscript: (text) => {
      if (audioSource !== "video") return;
      handleVideoTranscript(text);
    },
    onPartialTranscript: (text) => {
      // Handled by hook
    },
    chunkDurationMs: 10000,
    language: transcriptionLanguage,
  });

  // Connect/disconnect based on recording state and audio source
  useEffect(() => {
    const connectWithDelay = async () => {
      if (isRecording) {
        // Reset state when starting
        setChunks([]);
        setTranscriptBuffer("");
        setEventsExtracted(0);
        setHasFallenBack(false);
        
        if (audioSource === "mic") {
          // Disconnect video if connected
          if (videoTranscription.isConnected) {
            videoTranscription.disconnect();
          }
          
          // Add small delay to prevent race conditions
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Connect microphone
          if (!scribe.isConnected && !scribe.isConnecting) {
            console.log('Initiating Scribe connection...');
            const success = await scribe.connect();
            if (!success) {
              console.warn('Initial Scribe connection failed, will retry');
            }
          }
        } else if (audioSource === "video" && videoElement) {
          // Disconnect microphone if connected
          if (scribe.isConnected) {
            scribe.disconnect();
          }
          
          // Add small delay to prevent race conditions
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Connect to video audio
          if (!videoTranscription.isConnected && !videoTranscription.isConnecting) {
            videoTranscription.connect(videoElement);
          }
        }
      } else {
        // Disconnect both when not recording
        if (scribe.isConnected) {
          scribe.disconnect();
        }
        if (videoTranscription.isConnected) {
          videoTranscription.disconnect();
        }
      }
    };
    
    connectWithDelay();
  }, [isRecording, audioSource, videoElement]);

  // Get active transcription state
  const activeTranscription = audioSource === "mic" ? scribe : videoTranscription;
  const isConnected = activeTranscription.isConnected;
  const isConnecting = audioSource === "mic" ? scribe.isConnecting : videoTranscription.isConnecting;
  const isReconnecting = audioSource === "mic" && scribe.connectionStatus === 'reconnecting';
  const partialTranscript = activeTranscription.partialTranscript;
  const committedTranscripts = activeTranscription.committedTranscripts;
  const transcriptionError = activeTranscription.error;

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
          {/* Language Selector (only for video/Whisper mode) */}
          {audioSource === "video" && (
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
          )}

          {/* Audio Source Toggle */}
          <ToggleGroup
            type="single"
            value={audioSource}
            onValueChange={(value) => value && setAudioSource(value as "mic" | "video")}
            disabled={isRecording}
            className="h-8"
          >
            <ToggleGroupItem value="mic" className="text-xs px-2 h-7 gap-1">
              <Mic className="h-3 w-3" />
              Microfone
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="video" 
              className="text-xs px-2 h-7 gap-1"
              disabled={!videoElement}
            >
              <Video className="h-3 w-3" />
              Áudio do Vídeo
            </ToggleGroupItem>
          </ToggleGroup>
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
        {isReconnecting && (
          <Badge variant="outline" className="text-orange-500 border-orange-500/50">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Reconectando... ({scribe.retryCount + 1}/3)
          </Badge>
        )}
        {isConnecting && !isReconnecting && (
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
        ) : !isRecording ? null : !isConnecting && !isReconnecting ? (
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
            Analisando...
          </Badge>
        )}
        
        {/* Volume Indicator */}
        {isRecording && isConnected && audioSource === "video" && (
          <VolumeIndicator 
            analyser={videoTranscription.getAnalyser()} 
            isActive={isConnected}
          />
        )}
      </div>

      <ScrollArea className="flex-1 max-h-[350px]">
        <div ref={scrollRef} className="space-y-3 pr-2">
          {chunks.length === 0 && committedTranscripts.length === 0 && !partialTranscript ? (
            <div className="text-center text-muted-foreground py-8">
              {isRecording ? (
                <div className="space-y-2">
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                      <p>Conectando ao Kakttus AI...</p>
                    </>
                  ) : isConnected ? (
                    <>
                      {audioSource === "mic" ? (
                        <Mic className="h-8 w-8 mx-auto text-green-500 animate-pulse" />
                      ) : (
                        <Video className="h-8 w-8 mx-auto text-green-500 animate-pulse" />
                      )}
                      <p>Ouvindo {audioSource === "mic" ? "microfone" : "áudio do vídeo"}...</p>
                      <p className="text-xs">
                        {audioSource === "mic" ? "Transcrição em tempo real" : "Transcrição a cada 10s"}
                      </p>
                    </>
                  ) : audioSource === "video" && !videoElement ? (
                    <>
                      <Video className="h-8 w-8 mx-auto text-yellow-500" />
                      <p>Carregue um vídeo primeiro</p>
                      <p className="text-xs">O vídeo precisa estar em reprodução</p>
                    </>
                  ) : (
                    <>
                      <Mic className="h-8 w-8 mx-auto text-red-500 animate-pulse" />
                      <p>Aguardando conexão...</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p>Inicie a gravação para ver a transcrição</p>
                  <p className="text-xs">
                    {audioSource === "mic" 
                      ? "Usando microfone (tempo real)" 
                      : "Usando áudio do vídeo (a cada 10s)"}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Partial transcript (live) - sempre no topo */}
              {partialTranscript && (
                <div className="border-l-4 border-yellow-500 pl-3 py-2 bg-yellow-500/10 rounded-r-lg animate-pulse mb-3 sticky top-0 z-10">
                  <div className="flex items-center gap-2 text-xs text-yellow-500 mb-1">
                    {audioSource === "mic" ? <Mic className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                    <span className="font-semibold">Ao vivo</span>
                  </div>
                  <p className="text-sm text-foreground italic">{partialTranscript}</p>
                </div>
              )}

              {/* Committed transcripts - mais recente primeiro, com animação de entrada */}
              {[...committedTranscripts].reverse().map((transcript, index) => {
                const isLatest = index === 0;
                
                return (
                  <div 
                    key={transcript.id} 
                    className={`
                      pl-3 py-2 mb-2 rounded-r-lg transition-all duration-500 animate-fade-in
                      ${isLatest 
                        ? "border-l-4 border-primary bg-primary/10 shadow-lg transform scale-[1.02]" 
                        : "border-l-2 border-muted-foreground/30 opacity-60 hover:opacity-100"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Clock className="h-3 w-3" />
                      <span className={isLatest ? "font-semibold text-foreground" : ""}>
                        {new Date(transcript.timestamp).toLocaleTimeString()}
                      </span>
                      {isLatest && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-primary">
                          Mais recente
                        </Badge>
                      )}
                      {audioSource === "video" && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">Kakttus</Badge>
                      )}
                    </div>
                    <p className={`text-sm ${isLatest ? "text-foreground font-medium" : "text-foreground/80"}`}>
                      {transcript.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Status indicator */}
      {isRecording && isConnected && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Transcrição em tempo real via Kakttus AI
          </p>
        </div>
      )}

      {transcriptionError && (
        <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
          {transcriptionError}
        </div>
      )}
    </div>
  );
};
