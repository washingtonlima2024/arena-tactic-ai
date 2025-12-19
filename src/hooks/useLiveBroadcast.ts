import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export interface MatchInfo {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  matchDate: string;
}

export interface LiveEvent {
  id: string;
  type: string;
  minute: number;
  second: number;
  description: string;
  confidence?: number;
  status: "pending" | "approved" | "rejected";
}

export interface Score {
  home: number;
  away: number;
}

export interface TranscriptChunk {
  id: string;
  text: string;
  minute: number;
  second: number;
  timestamp: Date;
}

export const useLiveBroadcast = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [matchInfo, setMatchInfo] = useState<MatchInfo>({
    homeTeam: "",
    awayTeam: "",
    competition: "",
    matchDate: new Date().toISOString().slice(0, 16),
  });
  
  const [streamUrl, setStreamUrl] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const [detectedEvents, setDetectedEvents] = useState<LiveEvent[]>([]);
  const [approvedEvents, setApprovedEvents] = useState<LiveEvent[]>([]);
  const [currentScore, setCurrentScore] = useState<Score>({ home: 0, away: 0 });
  
  const [transcriptBuffer, setTranscriptBuffer] = useState("");
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tempMatchIdRef = useRef<string | null>(null);

  // Save transcript to database
  const saveTranscriptToDatabase = useCallback(async (matchId?: string) => {
    if (!transcriptBuffer.trim()) return;
    
    const targetMatchId = matchId || tempMatchIdRef.current;
    if (!targetMatchId) return;
    
    setIsSavingTranscript(true);
    
    try {
      // Check if there's already a transcript for this match
      const { data: existing } = await supabase
        .from("generated_audio")
        .select("id, script")
        .eq("match_id", targetMatchId)
        .eq("audio_type", "live_transcript")
        .maybeSingle();

      if (existing) {
        // Update existing transcript
        await supabase
          .from("generated_audio")
          .update({
            script: transcriptBuffer.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        // Create new transcript entry
        await supabase
          .from("generated_audio")
          .insert({
            match_id: targetMatchId,
            audio_type: "live_transcript",
            script: transcriptBuffer.trim(),
            voice: "whisper",
          });
      }

      setLastSavedAt(new Date());
      console.log("Transcript auto-saved at", new Date().toISOString());
    } catch (error) {
      console.error("Error saving transcript:", error);
    } finally {
      setIsSavingTranscript(false);
    }
  }, [transcriptBuffer]);

  // Timer effect
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  // Auto-save transcript every 60 seconds
  useEffect(() => {
    if (isRecording && !isPaused) {
      autoSaveIntervalRef.current = setInterval(() => {
        if (transcriptBuffer.trim()) {
          saveTranscriptToDatabase();
        }
      }, 60000);
    }
    return () => {
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
    };
  }, [isRecording, isPaused, saveTranscriptToDatabase, transcriptBuffer]);

  // Create temporary match on start for auto-saving
  const createTempMatch = useCallback(async () => {
    try {
      const { data: match, error } = await supabase
        .from("matches")
        .insert({
          home_score: 0,
          away_score: 0,
          competition: matchInfo.competition || "Transmissão ao vivo",
          match_date: matchInfo.matchDate,
          status: "live",
          venue: "Transmissão ao vivo",
        })
        .select()
        .single();

      if (!error && match) {
        tempMatchIdRef.current = match.id;
        return match.id;
      }
    } catch (error) {
      console.error("Error creating temp match:", error);
    }
    return null;
  }, [matchInfo]);

  const startRecording = useCallback(async () => {
    try {
      let audioStream: MediaStream;
      
      if (cameraStream) {
        // Extract audio tracks from camera stream
        const audioTracks = cameraStream.getAudioTracks();
        if (audioTracks.length === 0) {
          // If camera stream has no audio, get audio separately
          const audioOnly = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          audioStream = audioOnly;
        } else {
          audioStream = new MediaStream(audioTracks);
        }
      } else {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

      // Create temp match for auto-saving transcripts
      await createTempMatch();

      // Find a supported mimeType
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        ""
      ];
      
      let selectedMimeType = "";
      for (const mimeType of mimeTypes) {
        if (mimeType === "" || MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      const recorderOptions: MediaRecorderOptions = {};
      if (selectedMimeType) {
        recorderOptions.mimeType = selectedMimeType;
      }

      const mediaRecorder = new MediaRecorder(audioStream, recorderOptions);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);

      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setTranscriptBuffer("");
      setTranscriptChunks([]);
      audioChunksRef.current = [];

      // Start transcription interval (every 30 seconds)
      transcriptionIntervalRef.current = setInterval(() => {
        processAudioChunk();
      }, 30000);

      toast({
        title: "Transmissão iniciada",
        description: "Gravando áudio e salvando transcrição automaticamente...",
      });
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Erro ao iniciar gravação",
        description: "Verifique as permissões de áudio",
        variant: "destructive",
      });
    }
  }, [cameraStream, toast, createTempMatch]);

  const processAudioChunk = useCallback(async () => {
    if (audioChunksRef.current.length === 0) return;

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    audioChunksRef.current = [];
    const currentMinute = Math.floor(recordingTime / 60);
    const currentSecond = recordingTime % 60;

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(",")[1];

        const { data: transcriptData, error: transcriptError } = await supabase.functions.invoke(
          "transcribe-audio",
          { body: { audio: base64Audio } }
        );

        if (transcriptError) {
          console.error("Transcription error:", transcriptError);
          return;
        }

        if (transcriptData?.text) {
          const newChunk: TranscriptChunk = {
            id: crypto.randomUUID(),
            text: transcriptData.text,
            minute: currentMinute,
            second: currentSecond,
            timestamp: new Date(),
          };

          setTranscriptChunks((prev) => [...prev, newChunk]);
          setTranscriptBuffer((prev) => {
            const updated = prev + " " + transcriptData.text;
            return updated.trim();
          });

          // Extract events from transcript
          const { data: eventsData, error: eventsError } = await supabase.functions.invoke(
            "extract-live-events",
            {
              body: {
                transcript: transcriptData.text,
                homeTeam: matchInfo.homeTeam,
                awayTeam: matchInfo.awayTeam,
                currentScore,
                currentMinute,
              },
            }
          );

          if (!eventsError && eventsData?.events) {
            const newEvents: LiveEvent[] = eventsData.events.map((e: any) => ({
              id: crypto.randomUUID(),
              type: e.type,
              minute: e.minute,
              second: e.second || 0,
              description: e.description,
              confidence: e.confidence,
              status: "pending" as const,
            }));

            setDetectedEvents((prev) => [...prev, ...newEvents]);
          }
        }
      };
    } catch (error) {
      console.error("Error processing audio chunk:", error);
    }
  }, [matchInfo, currentScore, recordingTime]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    if (transcriptionIntervalRef.current) {
      clearInterval(transcriptionIntervalRef.current);
    }
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
    }
    
    // Save transcript one final time
    if (transcriptBuffer.trim()) {
      saveTranscriptToDatabase();
    }
    
    setIsRecording(false);
    setIsPaused(false);
  }, [transcriptBuffer, saveTranscriptToDatabase]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      
      // Save transcript when pausing
      if (transcriptBuffer.trim()) {
        saveTranscriptToDatabase();
      }
    }
  }, [isRecording, transcriptBuffer, saveTranscriptToDatabase]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  }, [isPaused]);

  const addManualEvent = useCallback((type: string) => {
    const minute = Math.floor(recordingTime / 60);
    const second = recordingTime % 60;

    const newEvent: LiveEvent = {
      id: crypto.randomUUID(),
      type,
      minute,
      second,
      description: `${type} aos ${minute}'${second}"`,
      status: "approved",
    };

    setApprovedEvents((prev) => [...prev, newEvent]);

    if (type === "goal_home") {
      setCurrentScore((prev) => ({ ...prev, home: prev.home + 1 }));
    } else if (type === "goal_away") {
      setCurrentScore((prev) => ({ ...prev, away: prev.away + 1 }));
    }

    toast({
      title: "Evento adicionado",
      description: newEvent.description,
    });
  }, [recordingTime, toast]);

  const approveEvent = useCallback((eventId: string) => {
    const event = detectedEvents.find((e) => e.id === eventId);
    if (event) {
      setDetectedEvents((prev) => prev.filter((e) => e.id !== eventId));
      setApprovedEvents((prev) => [...prev, { ...event, status: "approved" }]);

      if (event.type === "goal") {
        const desc = event.description.toLowerCase();
        if (desc.includes(matchInfo.homeTeam.toLowerCase())) {
          setCurrentScore((prev) => ({ ...prev, home: prev.home + 1 }));
        } else if (desc.includes(matchInfo.awayTeam.toLowerCase())) {
          setCurrentScore((prev) => ({ ...prev, away: prev.away + 1 }));
        }
      }
    }
  }, [detectedEvents, matchInfo]);

  const editEvent = useCallback((eventId: string, updates: Partial<LiveEvent>) => {
    setDetectedEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, ...updates } : e))
    );
    setApprovedEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, ...updates } : e))
    );
  }, []);

  const removeEvent = useCallback((eventId: string) => {
    setDetectedEvents((prev) => prev.filter((e) => e.id !== eventId));
    setApprovedEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  const updateScore = useCallback((team: "home" | "away", delta: number) => {
    setCurrentScore((prev) => ({
      ...prev,
      [team]: Math.max(0, prev[team] + delta),
    }));
  }, []);

  const finishMatch = useCallback(async () => {
    stopRecording();

    try {
      const matchId = tempMatchIdRef.current;
      
      if (matchId) {
        // Update the temp match with final data
        await supabase
          .from("matches")
          .update({
            home_score: currentScore.home,
            away_score: currentScore.away,
            competition: matchInfo.competition,
            status: "completed",
          })
          .eq("id", matchId);

        // Save final transcript
        await saveTranscriptToDatabase(matchId);

        // Save approved events
        if (approvedEvents.length > 0) {
          const eventsToInsert = approvedEvents.map((e) => ({
            match_id: matchId,
            event_type: e.type,
            minute: e.minute,
            second: e.second,
            description: e.description,
            approval_status: "approved",
          }));

          await supabase.from("match_events").insert(eventsToInsert);
        }
      }

      toast({
        title: "Partida finalizada",
        description: `Transcrição salva (${transcriptBuffer.split(" ").length} palavras)`,
      });

      tempMatchIdRef.current = null;
      navigate("/matches");
    } catch (error) {
      console.error("Error finishing match:", error);
      toast({
        title: "Erro ao salvar partida",
        description: "Tente novamente",
        variant: "destructive",
      });
    }
  }, [stopRecording, currentScore, matchInfo, approvedEvents, transcriptBuffer, saveTranscriptToDatabase, toast, navigate]);

  return {
    matchInfo,
    setMatchInfo,
    streamUrl,
    setStreamUrl,
    cameraStream,
    setCameraStream,
    isRecording,
    isPaused,
    recordingTime,
    detectedEvents,
    approvedEvents,
    currentScore,
    transcriptBuffer,
    transcriptChunks,
    isSavingTranscript,
    lastSavedAt,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    addManualEvent,
    approveEvent,
    editEvent,
    removeEvent,
    updateScore,
    finishMatch,
  };
};
