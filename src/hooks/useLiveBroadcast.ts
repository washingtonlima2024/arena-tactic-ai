import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export interface MatchInfo {
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: string;
  awayTeamId?: string;
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
  recordingTimestamp?: number; // Recording time in seconds when event occurred
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
    homeTeamId: undefined,
    awayTeamId: undefined,
    competition: "",
    matchDate: new Date().toISOString().slice(0, 16),
  });
  
  const [streamUrl, setStreamUrl] = useState("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
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
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [lastProcessedAt, setLastProcessedAt] = useState<Date | null>(null);
  
  // NEW: Video recording states
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  
  // Audio refs (existing)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tempMatchIdRef = useRef<string | null>(null);

  // NEW: Video recording refs
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

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
          home_team_id: matchInfo.homeTeamId || null,
          away_team_id: matchInfo.awayTeamId || null,
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

  // NEW: Start video recording from video element
  const startVideoRecording = useCallback((videoElement: HTMLVideoElement) => {
    try {
      // Create canvas for capturing video frames
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth || 1280;
      canvas.height = videoElement.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      canvasRef.current = canvas;
      videoElementRef.current = videoElement;

      console.log(`Starting video recording: ${canvas.width}x${canvas.height}`);

      // Animation loop to draw video frames to canvas
      const drawFrame = () => {
        if (ctx && videoElementRef.current && isRecording && !isPaused) {
          ctx.drawImage(videoElementRef.current, 0, 0, canvas.width, canvas.height);
        }
        animationFrameRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrame();

      // Capture canvas stream
      const canvasStream = canvas.captureStream(30); // 30 fps

      // Combine video with audio if available
      let combinedStream: MediaStream;
      if (audioStreamRef.current) {
        const audioTracks = audioStreamRef.current.getAudioTracks();
        combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioTracks
        ]);
      } else {
        combinedStream = canvasStream;
      }

      // Find supported video mimeType
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
        ''
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (mimeType === '' || MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      const recorderOptions: MediaRecorderOptions = {};
      if (selectedMimeType) {
        recorderOptions.mimeType = selectedMimeType;
      }

      const videoRecorder = new MediaRecorder(combinedStream, recorderOptions);

      videoRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data);
          console.log(`Video chunk recorded: ${(event.data.size / 1024).toFixed(1)} KB`);
        }
      };

      videoRecorder.onerror = (event) => {
        console.error('Video recorder error:', event);
      };

      videoRecorderRef.current = videoRecorder;
      videoRecorder.start(5000); // Chunk every 5 seconds
      setIsRecordingVideo(true);

      console.log('Video recording started with mimeType:', selectedMimeType || 'default');

    } catch (error) {
      console.error('Error starting video recording:', error);
      toast({
        title: "Erro na gravação de vídeo",
        description: "Não foi possível iniciar a gravação do vídeo",
        variant: "destructive",
      });
    }
  }, [isRecording, isPaused, toast]);

  // NEW: Save recorded video to storage
  const saveRecordedVideo = useCallback(async (matchId: string): Promise<string | null> => {
    if (videoChunksRef.current.length === 0) {
      console.log('No video chunks to save');
      return null;
    }

    setIsUploadingVideo(true);
    setVideoUploadProgress(0);

    try {
      const mimeType = videoRecorderRef.current?.mimeType || 'video/webm';
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const videoBlob = new Blob(videoChunksRef.current, { type: mimeType });
      
      console.log(`Saving video: ${(videoBlob.size / (1024 * 1024)).toFixed(2)} MB`);

      const filePath = `live-${matchId}-${Date.now()}.${extension}`;

      setVideoUploadProgress(20);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('match-videos')
        .upload(filePath, videoBlob, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        console.error('Error uploading video:', uploadError);
        throw uploadError;
      }

      setVideoUploadProgress(70);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('match-videos')
        .getPublicUrl(filePath);

      const videoUrl = urlData.publicUrl;

      // Register in videos table
      const { error: insertError } = await supabase.from('videos').insert({
        match_id: matchId,
        file_url: videoUrl,
        file_name: `Transmissão ao vivo`,
        video_type: 'full',
        start_minute: 0,
        end_minute: Math.ceil(recordingTime / 60),
        duration_seconds: recordingTime,
        status: 'complete'
      });

      if (insertError) {
        console.error('Error inserting video record:', insertError);
      }

      setVideoUploadProgress(100);
      console.log('Video saved successfully:', videoUrl);

      return videoUrl;

    } catch (error) {
      console.error('Error saving video:', error);
      toast({
        title: "Erro ao salvar vídeo",
        description: "O vídeo não pôde ser enviado",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsUploadingVideo(false);
    }
  }, [recordingTime, toast]);

  // NEW: Stop video recording
  const stopVideoRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
      videoRecorderRef.current.stop();
    }

    setIsRecordingVideo(false);
    console.log('Video recording stopped');
  }, []);

  const startRecording = useCallback(async (videoElement?: HTMLVideoElement | null) => {
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

      // Store audio stream for video recording
      audioStreamRef.current = audioStream;

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
      videoChunksRef.current = [];

      // NEW: Start video recording if video element is available
      if (videoElement) {
        // Wait for video to be ready
        if (videoElement.readyState >= 2) {
          startVideoRecording(videoElement);
        } else {
          videoElement.addEventListener('loadeddata', () => {
            startVideoRecording(videoElement);
          }, { once: true });
        }
      }

      // Start transcription interval (every 10 seconds for faster feedback)
      transcriptionIntervalRef.current = setInterval(() => {
        processAudioChunk();
      }, 10000);
      
      // Process first chunk after 5 seconds
      setTimeout(() => {
        processAudioChunk();
      }, 5000);

      toast({
        title: "Transmissão iniciada",
        description: videoElement 
          ? "Gravando áudio e vídeo..." 
          : "Gravando áudio e salvando transcrição automaticamente...",
      });
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Erro ao iniciar gravação",
        description: "Verifique as permissões de áudio",
        variant: "destructive",
      });
    }
  }, [cameraStream, toast, createTempMatch, startVideoRecording]);

  const processAudioChunk = useCallback(async () => {
    if (audioChunksRef.current.length === 0) {
      console.log("No audio chunks to process");
      return;
    }
    
    if (isProcessingAudio) {
      console.log("Already processing audio, skipping...");
      return;
    }

    setIsProcessingAudio(true);
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    audioChunksRef.current = [];
    const currentMinute = Math.floor(recordingTime / 60);
    const currentSecond = recordingTime % 60;

    console.log(`Processing audio chunk at ${currentMinute}:${currentSecond}, size: ${audioBlob.size} bytes`);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(",")[1];
        console.log("Sending audio to transcription service...");

        const { data: transcriptData, error: transcriptError } = await supabase.functions.invoke(
          "transcribe-audio",
          { body: { audio: base64Audio } }
        );

        if (transcriptError) {
          console.error("Transcription error:", transcriptError);
          setIsProcessingAudio(false);
          return;
        }

        console.log("Transcription result:", transcriptData);
        setLastProcessedAt(new Date());

        if (transcriptData?.text && transcriptData.text.trim()) {
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

          console.log("Extracting events from transcript...");

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

          console.log("Events extraction result:", eventsData);

          if (!eventsError && eventsData?.events && eventsData.events.length > 0) {
            const currentRecordingTime = recordingTime;
            const newEvents: LiveEvent[] = eventsData.events.map((e: any) => ({
              id: crypto.randomUUID(),
              type: e.type,
              minute: e.minute || currentMinute,
              second: e.second || 0,
              description: e.description,
              confidence: e.confidence || 0.8,
              status: "pending" as const,
              recordingTimestamp: currentRecordingTime, // NEW: Store recording time for clip extraction
            }));

            console.log(`Detected ${newEvents.length} new events`);
            setDetectedEvents((prev) => [...prev, ...newEvents]);
          }
        } else {
          console.log("No text in transcription result");
        }
        
        setIsProcessingAudio(false);
      };
    } catch (error) {
      console.error("Error processing audio chunk:", error);
      setIsProcessingAudio(false);
    }
  }, [matchInfo, currentScore, recordingTime, isProcessingAudio]);

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
    
    // NEW: Stop video recording
    stopVideoRecording();
    
    // Save transcript one final time
    if (transcriptBuffer.trim()) {
      saveTranscriptToDatabase();
    }
    
    setIsRecording(false);
    setIsPaused(false);
  }, [transcriptBuffer, saveTranscriptToDatabase, stopVideoRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      
      // Pause video recording
      if (videoRecorderRef.current && videoRecorderRef.current.state === 'recording') {
        videoRecorderRef.current.pause();
      }
      
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
      
      // Resume video recording
      if (videoRecorderRef.current && videoRecorderRef.current.state === 'paused') {
        videoRecorderRef.current.resume();
      }
      
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
      recordingTimestamp: recordingTime, // NEW: Store recording time
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

  // Add event detected from AI transcript analysis
  const addDetectedEvent = useCallback((eventData: {
    type: string;
    minute: number;
    second: number;
    description: string;
    confidence?: number;
    source?: string;
  }) => {
    const newEvent: LiveEvent = {
      id: crypto.randomUUID(),
      type: eventData.type,
      minute: eventData.minute,
      second: eventData.second,
      description: eventData.description,
      confidence: eventData.confidence,
      status: "pending", // AI-detected events start as pending for approval
      recordingTimestamp: eventData.minute * 60 + eventData.second,
    };

    // Check for duplicate events (same type within 30 seconds)
    const isDuplicate = detectedEvents.some(
      (e) =>
        e.type === newEvent.type &&
        Math.abs((e.minute * 60 + e.second) - (newEvent.minute * 60 + newEvent.second)) < 30
    );

    if (!isDuplicate) {
      setDetectedEvents((prev) => [...prev, newEvent]);
      
      toast({
        title: "Evento detectado",
        description: `${newEvent.type}: ${newEvent.description}`,
        duration: 3000,
      });
    }
  }, [detectedEvents, toast]);

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
        // NEW: Save recorded video first
        toast({ 
          title: "Salvando vídeo...", 
          description: "Aguarde o upload da gravação" 
        });
        
        const videoUrl = await saveRecordedVideo(matchId);

        // Update the temp match with final data (including team IDs)
        await supabase
          .from("matches")
          .update({
            home_team_id: matchInfo.homeTeamId || null,
            away_team_id: matchInfo.awayTeamId || null,
            home_score: currentScore.home,
            away_score: currentScore.away,
            competition: matchInfo.competition,
            status: "completed",
          })
          .eq("id", matchId);

        // Save final transcript
        await saveTranscriptToDatabase(matchId);

        // Save approved events with metadata for clip extraction
        if (approvedEvents.length > 0) {
          const eventsToInsert = approvedEvents.map((e) => ({
            match_id: matchId,
            event_type: e.type,
            minute: e.minute,
            second: e.second,
            description: e.description,
            approval_status: "approved",
            is_highlight: ['goal', 'goal_home', 'goal_away', 'red_card', 'penalty'].includes(e.type),
            match_half: e.minute < 45 ? 'first' : 'second',
            metadata: {
              eventMs: (e.recordingTimestamp || (e.minute * 60 + e.second)) * 1000,
              videoSecond: e.recordingTimestamp || (e.minute * 60 + e.second),
              source: 'live'
            }
          }));

          await supabase.from("match_events").insert(eventsToInsert);
        }

        toast({
          title: "Partida finalizada",
          description: videoUrl 
            ? `Vídeo e ${approvedEvents.length} eventos salvos. Clips podem ser extraídos na página de Mídia.`
            : `Transcrição salva (${transcriptBuffer.split(" ").length} palavras)`,
        });
      }

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
  }, [stopRecording, currentScore, matchInfo, approvedEvents, transcriptBuffer, saveTranscriptToDatabase, saveRecordedVideo, toast, navigate]);

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
    isProcessingAudio,
    lastProcessedAt,
    // NEW: Video recording exports
    isRecordingVideo,
    videoUploadProgress,
    isUploadingVideo,
    // NEW: Expose current match ID for transcript saving
    currentMatchId: tempMatchIdRef.current,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    addManualEvent,
    addDetectedEvent,
    approveEvent,
    editEvent,
    removeEvent,
    updateScore,
    finishMatch,
    processAudioChunk,
  };
};
