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
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptionIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  const startRecording = useCallback(async () => {
    try {
      let audioStream: MediaStream;
      
      if (cameraStream) {
        // Use audio from camera stream
        audioStream = cameraStream;
      } else {
        // Request microphone access for stream URL mode
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second

      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      audioChunksRef.current = [];

      // Start transcription interval (every 30 seconds)
      transcriptionIntervalRef.current = setInterval(() => {
        processAudioChunk();
      }, 30000);

      toast({
        title: "Transmissão iniciada",
        description: "Gravando áudio e detectando eventos...",
      });
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Erro ao iniciar gravação",
        description: "Verifique as permissões de áudio",
        variant: "destructive",
      });
    }
  }, [cameraStream, toast]);

  const processAudioChunk = useCallback(async () => {
    if (audioChunksRef.current.length === 0) return;

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    audioChunksRef.current = [];

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(",")[1];

        // Send to transcription
        const { data: transcriptData, error: transcriptError } = await supabase.functions.invoke(
          "transcribe-audio",
          {
            body: { audio: base64Audio },
          }
        );

        if (transcriptError) {
          console.error("Transcription error:", transcriptError);
          return;
        }

        if (transcriptData?.text) {
          setTranscriptBuffer((prev) => prev + " " + transcriptData.text);

          // Extract events from transcript
          const { data: eventsData, error: eventsError } = await supabase.functions.invoke(
            "extract-live-events",
            {
              body: {
                transcript: transcriptData.text,
                homeTeam: matchInfo.homeTeam,
                awayTeam: matchInfo.awayTeam,
                currentScore,
                currentMinute: Math.floor(recordingTime / 60),
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
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  }, [isRecording]);

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

    // Update score if goal
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

      // Update score if goal
      if (event.type === "goal") {
        // Try to determine which team scored based on description
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
      // Create match in database
      const { data: match, error: matchError } = await supabase
        .from("matches")
        .insert({
          home_score: currentScore.home,
          away_score: currentScore.away,
          competition: matchInfo.competition,
          match_date: matchInfo.matchDate,
          status: "completed",
          venue: "Transmissão ao vivo",
        })
        .select()
        .single();

      if (matchError) throw matchError;

      // Save approved events
      if (approvedEvents.length > 0 && match) {
        const eventsToInsert = approvedEvents.map((e) => ({
          match_id: match.id,
          event_type: e.type,
          minute: e.minute,
          second: e.second,
          description: e.description,
          approval_status: "approved",
        }));

        await supabase.from("match_events").insert(eventsToInsert);
      }

      toast({
        title: "Partida finalizada",
        description: "Dados salvos com sucesso!",
      });

      navigate("/matches");
    } catch (error) {
      console.error("Error finishing match:", error);
      toast({
        title: "Erro ao salvar partida",
        description: "Tente novamente",
        variant: "destructive",
      });
    }
  }, [stopRecording, currentScore, matchInfo, approvedEvents, toast, navigate]);

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
