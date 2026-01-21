import { useState, useRef, useCallback, useEffect } from "react";
import { apiClient } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { generateUUID } from "@/lib/utils";

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
  
  // NEW: Current match ID as state (refs don't trigger re-renders)
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  
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

  // Save transcript to database using local API
  const saveTranscriptToDatabase = useCallback(async (matchId?: string) => {
    if (!transcriptBuffer.trim()) return;
    
    const targetMatchId = matchId || tempMatchIdRef.current;
    if (!targetMatchId) return;
    
    setIsSavingTranscript(true);
    
    try {
      // Check if there's already a transcript for this match via API
      const existingAudio = await apiClient.getAudio(targetMatchId, 'live_transcript');
      const existing = existingAudio?.[0];

      if (existing) {
        // Update existing transcript via API
        await apiClient.updateAudio(existing.id, {
          script: transcriptBuffer.trim(),
          updated_at: new Date().toISOString(),
        });
      } else {
        // Create new transcript entry via API
        await apiClient.createAudio({
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

  // REAL-TIME: Save score to database whenever it changes during recording
  useEffect(() => {
    if (!isRecording || !tempMatchIdRef.current) return;
    
    const saveScoreToDatabase = async () => {
      try {
        await apiClient.updateMatch(tempMatchIdRef.current!, {
          home_score: currentScore.home,
          away_score: currentScore.away,
        });
        console.log("Score saved in real-time:", currentScore);
      } catch (error) {
        console.error("Error saving score:", error);
      }
    };
    
    saveScoreToDatabase();
  }, [currentScore, isRecording]);

  // Create temporary match on start for auto-saving
  const createTempMatch = useCallback(async (): Promise<string | null> => {
    console.log("Creating match with info:", matchInfo);
    
    try {
      const match = await apiClient.createMatch({
        home_team_id: matchInfo.homeTeamId || null,
        away_team_id: matchInfo.awayTeamId || null,
        home_score: 0,
        away_score: 0,
        competition: matchInfo.competition || "Transmissão ao vivo",
        match_date: matchInfo.matchDate,
        status: "live",
        venue: "Transmissão ao vivo",
      });

      if (match?.id) {
        tempMatchIdRef.current = match.id;
        setCurrentMatchId(match.id);
        console.log("Match created successfully:", match.id);
        toast({
          title: "Partida registrada",
          description: "A partida foi criada e está sendo composta em tempo real",
        });
        return match.id;
      }
      
      return null;
    } catch (error: any) {
      console.error("Error creating match:", error);
      toast({
        title: "Erro ao criar partida",
        description: error.message || "Não foi possível criar a partida",
        variant: "destructive",
      });
      return null;
    }
  }, [matchInfo, toast]);

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

  // NEW: Save recorded video to storage using local API
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

      const filename = `live-${matchId}-${Date.now()}.${extension}`;

      setVideoUploadProgress(20);

      // Upload to local server storage
      const uploadResult = await apiClient.uploadBlob(matchId, 'videos', videoBlob, filename);

      if (!uploadResult?.url) {
        throw new Error('Upload failed: no URL returned');
      }

      setVideoUploadProgress(70);

      const videoUrl = uploadResult.url;

      // Register in videos table via API
      try {
        await apiClient.createVideo({
          match_id: matchId,
          file_url: videoUrl,
          file_name: `Transmissão ao vivo`,
          video_type: 'full',
          start_minute: 0,
          end_minute: Math.ceil(recordingTime / 60),
          duration_seconds: recordingTime,
          status: 'completed'
        });
      } catch (insertError) {
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

      // Create match FIRST - abort if it fails
      const matchId = await createTempMatch();
      if (!matchId) {
        toast({
          title: "Erro ao iniciar",
          description: "Não foi possível criar a partida. Verifique os dados e tente novamente.",
          variant: "destructive",
        });
        // Cleanup audio stream
        audioStream.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
        return;
      }

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

        try {
          // Use local API for transcription
          const transcriptData = await apiClient.transcribeAudio({ audio: base64Audio });

          console.log("Transcription result:", transcriptData);
          setLastProcessedAt(new Date());

          if (transcriptData?.text && transcriptData.text.trim()) {
            const newChunk: TranscriptChunk = {
              id: generateUUID(),
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

            // Extract events from transcript via local API
            try {
              const eventsData = await apiClient.extractLiveEvents({
                transcript: transcriptData.text,
                homeTeam: matchInfo.homeTeam,
                awayTeam: matchInfo.awayTeam,
                currentScore,
                currentMinute,
              });

              console.log("Events extraction result:", eventsData);

              if (eventsData?.events && eventsData.events.length > 0) {
                const currentRecordingTime = recordingTime;
                const newEvents: LiveEvent[] = eventsData.events.map((e: any) => ({
                  id: generateUUID(),
                  type: e.type,
                  minute: e.minute || currentMinute,
                  second: e.second || 0,
                  description: e.description,
                  confidence: e.confidence || 0.8,
                  status: "pending" as const,
                  recordingTimestamp: currentRecordingTime,
                }));

                console.log(`Detected ${newEvents.length} new events`);
                setDetectedEvents((prev) => [...prev, ...newEvents]);
              }
            } catch (eventsError) {
              console.error("Events extraction error:", eventsError);
            }
          } else {
            console.log("No text in transcription result");
          }
        } catch (transcriptError) {
          console.error("Transcription error:", transcriptError);
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

  const addManualEvent = useCallback(async (type: string) => {
    const matchId = tempMatchIdRef.current;
    const minute = Math.floor(recordingTime / 60);
    const second = recordingTime % 60;

    const eventId = generateUUID();
    const newEvent: LiveEvent = {
      id: eventId,
      type,
      minute,
      second,
      description: `${type} aos ${minute}'${second}"`,
      status: "approved",
      recordingTimestamp: recordingTime,
    };

    // Update local state
    setApprovedEvents((prev) => [...prev, newEvent]);

    if (type === "goal_home") {
      setCurrentScore((prev) => ({ ...prev, home: prev.home + 1 }));
    } else if (type === "goal_away") {
      setCurrentScore((prev) => ({ ...prev, away: prev.away + 1 }));
    }

    // REAL-TIME: Save event to database immediately via local API
    if (matchId) {
      try {
        await apiClient.createEvent(matchId, {
          id: eventId,
          event_type: type,
          minute,
          second,
          description: newEvent.description,
          approval_status: "approved",
          is_highlight: ['goal', 'goal_home', 'goal_away', 'red_card', 'penalty'].includes(type),
          match_half: minute < 45 ? 'first' : 'second',
          metadata: {
            eventMs: recordingTime * 1000,
            videoSecond: recordingTime,
            source: 'live-manual'
          }
        });
        console.log("Manual event saved in real-time:", type);
      } catch (error) {
        console.error("Error saving manual event:", error);
      }
    }

    toast({
      title: "Evento adicionado",
      description: newEvent.description,
    });
  }, [recordingTime, toast]);

  // Add event detected from AI transcript analysis
  // When goal is detected, auto-update score
  const addDetectedEvent = useCallback((eventData: {
    type: string;
    minute: number;
    second: number;
    description: string;
    confidence?: number;
    source?: string;
  }) => {
    const newEvent: LiveEvent = {
      id: generateUUID(),
      type: eventData.type,
      minute: eventData.minute,
      second: eventData.second,
      description: eventData.description,
      confidence: eventData.confidence,
      status: "pending", // AI-detected events start as pending for approval
      recordingTimestamp: recordingTime, // Use current recording time for accurate clip seeking
    };

    // Check for duplicate events (same type within 30 seconds)
    const isDuplicate = detectedEvents.some(
      (e) =>
        e.type === newEvent.type &&
        Math.abs((e.recordingTimestamp || 0) - (newEvent.recordingTimestamp || 0)) < 30
    );

    if (!isDuplicate) {
      setDetectedEvents((prev) => [...prev, newEvent]);
      
      // AUTO-UPDATE SCORE: If goal detected with high confidence, update score immediately
      if ((eventData.type === 'goal' || eventData.type === 'goal_home' || eventData.type === 'goal_away') 
          && eventData.confidence && eventData.confidence >= 0.8) {
        const desc = eventData.description.toLowerCase();
        
        if (eventData.type === 'goal_home' || (eventData.type === 'goal' && matchInfo.homeTeam && desc.includes(matchInfo.homeTeam.toLowerCase()))) {
          setCurrentScore((prev) => ({ ...prev, home: prev.home + 1 }));
          toast({
            title: "⚽ GOL! " + matchInfo.homeTeam,
            description: eventData.description,
            duration: 5000,
          });
        } else if (eventData.type === 'goal_away' || (eventData.type === 'goal' && matchInfo.awayTeam && desc.includes(matchInfo.awayTeam.toLowerCase()))) {
          setCurrentScore((prev) => ({ ...prev, away: prev.away + 1 }));
          toast({
            title: "⚽ GOL! " + matchInfo.awayTeam,
            description: eventData.description,
            duration: 5000,
          });
        } else {
          // Generic goal toast if can't determine team
          toast({
            title: "⚽ GOL Detectado!",
            description: eventData.description + " (confirme qual time)",
            duration: 5000,
          });
        }
      } else {
        toast({
          title: "Evento detectado",
          description: `${newEvent.type}: ${newEvent.description}`,
          duration: 3000,
        });
      }
    }
  }, [detectedEvents, recordingTime, matchInfo, toast]);

  const approveEvent = useCallback(async (eventId: string) => {
    const event = detectedEvents.find((e) => e.id === eventId);
    const matchId = tempMatchIdRef.current;
    
    if (event) {
      // Update local state
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

      // REAL-TIME: Save approved event to database immediately via local API
      if (matchId) {
        try {
          await apiClient.createEvent(matchId, {
            id: event.id,
            event_type: event.type,
            minute: event.minute,
            second: event.second,
            description: event.description,
            approval_status: "approved",
            is_highlight: ['goal', 'goal_home', 'goal_away', 'red_card', 'penalty'].includes(event.type),
            match_half: event.minute < 45 ? 'first' : 'second',
            metadata: {
              eventMs: (event.recordingTimestamp || (event.minute * 60 + event.second)) * 1000,
              videoSecond: event.recordingTimestamp || (event.minute * 60 + event.second),
              source: 'live-approved',
              confidence: event.confidence
            }
          });
          console.log("Approved event saved in real-time:", event.type);
        } catch (error) {
          console.error("Error saving approved event:", error);
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

  // NEW: Finish match data for dialog
  interface FinishMatchResult {
    matchId: string;
    videoUrl: string | null;
    eventsCount: number;
    transcriptWords: number;
    duration: number;
  }

  const [finishResult, setFinishResult] = useState<FinishMatchResult | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  // Estado para controlar análise pós-live
  const [isAnalyzingLive, setIsAnalyzingLive] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{
    step: string;
    progress: number;
  } | null>(null);

  const finishMatch = useCallback(async (): Promise<FinishMatchResult | null> => {
    stopRecording();
    setIsFinishing(true);

    try {
      const matchId = tempMatchIdRef.current;
      
      if (matchId) {
        // Save recorded video first
        toast({ 
          title: "Salvando vídeo...", 
          description: "Aguarde o upload da gravação" 
        });
        
        const videoUrl = await saveRecordedVideo(matchId);

        // Update the temp match with initial data
        await apiClient.updateMatch(matchId, {
          home_team_id: matchInfo.homeTeamId || null,
          away_team_id: matchInfo.awayTeamId || null,
          home_score: currentScore.home,
          away_score: currentScore.away,
          competition: matchInfo.competition,
          status: "processing", // Status intermediário durante análise
        });

        // Save final transcript from real-time detection
        await saveTranscriptToDatabase(matchId);

        // Get video ID for analysis
        const videos = await apiClient.getVideos(matchId);
        const savedVideo = videos.find((v: any) => v.file_url === videoUrl || v.status === 'completed');

        if (savedVideo) {
          // ═══════════════════════════════════════════════════════════════
          // NOVO: Executar pipeline completo de análise pós-live
          // ═══════════════════════════════════════════════════════════════
          setIsAnalyzingLive(true);
          setAnalysisProgress({ step: 'Iniciando análise...', progress: 5 });

          toast({
            title: "Analisando partida...",
            description: "Transcrevendo e detectando eventos automaticamente"
          });

          try {
            // Obter nomes dos times
            let homeTeamName = matchInfo.homeTeam || 'Time Casa';
            let awayTeamName = matchInfo.awayTeam || 'Time Fora';
            
            // Tentar buscar nomes completos se temos IDs
            if (matchInfo.homeTeamId) {
              try {
                const homeTeam = await apiClient.getTeam(matchInfo.homeTeamId);
                if (homeTeam?.name) homeTeamName = homeTeam.name;
              } catch (e) { /* usar nome do input */ }
            }
            if (matchInfo.awayTeamId) {
              try {
                const awayTeam = await apiClient.getTeam(matchInfo.awayTeamId);
                if (awayTeam?.name) awayTeamName = awayTeam.name;
              } catch (e) { /* usar nome do input */ }
            }

            setAnalysisProgress({ step: 'Transcrevendo vídeo...', progress: 20 });

            // Executar análise completa
            const analysisResult = await apiClient.analyzeLiveMatch(
              matchId,
              savedVideo.id,
              homeTeamName,
              awayTeamName
            );

            if (analysisResult.success) {
              setAnalysisProgress({ step: 'Análise concluída!', progress: 100 });

              // Atualizar placar com resultado da análise
              await apiClient.updateMatch(matchId, {
                home_score: analysisResult.homeScore,
                away_score: analysisResult.awayScore,
                status: "analyzed",
              });

              toast({
                title: "Análise concluída!",
                description: `${analysisResult.eventsDetected} eventos detectados, ${analysisResult.clipsGenerated} clips gerados`
              });

              console.log('[Live Analysis] Complete:', analysisResult);

              const result: FinishMatchResult = {
                matchId,
                videoUrl,
                eventsCount: analysisResult.eventsDetected,
                transcriptWords: analysisResult.transcription?.split(" ").length || 0,
                duration: recordingTime,
              };

              setFinishResult(result);
              setIsFinishing(false);
              setIsAnalyzingLive(false);
              setAnalysisProgress(null);
              return result;

            } else {
              throw new Error(analysisResult.errors?.join(', ') || 'Análise falhou');
            }

          } catch (analysisError) {
            console.error('Error in live analysis pipeline:', analysisError);
            
            // Fallback: gerar apenas clips dos eventos já detectados em tempo real
            toast({
              title: "Análise falhou",
              description: "Gerando clips dos eventos detectados em tempo real...",
              variant: "destructive"
            });

            setAnalysisProgress({ step: 'Gerando clips de fallback...', progress: 60 });

            try {
              const clipsResult = await apiClient.finalizeLiveMatchClips(matchId, savedVideo.id);
              
              toast({
                title: "Clips gerados",
                description: `${clipsResult.clipsGenerated} clips criados dos eventos em tempo real`
              });
            } catch (clipError) {
              console.error('Fallback clip generation also failed:', clipError);
            }

            // Atualizar status mesmo assim
            await apiClient.updateMatch(matchId, { status: "analyzed" });
          }

          setIsAnalyzingLive(false);
          setAnalysisProgress(null);

        } else {
          // Sem vídeo salvo - apenas finalizar
          console.warn('No saved video found, skipping analysis');
          await apiClient.updateMatch(matchId, { status: "analyzed" });
        }

        // Create analysis_job for consistency
        await apiClient.createAnalysisJob({
          match_id: matchId,
          status: 'completed',
          progress: 100,
          current_step: 'Análise ao vivo concluída',
          completed_at: new Date().toISOString(),
          result: {
            eventsDetected: approvedEvents.length + detectedEvents.length,
            source: 'live',
            duration: recordingTime,
            transcriptWords: transcriptBuffer.split(" ").length
          }
        });

        const result: FinishMatchResult = {
          matchId,
          videoUrl,
          eventsCount: approvedEvents.length + detectedEvents.length,
          transcriptWords: transcriptBuffer.split(" ").length,
          duration: recordingTime,
        };

        setFinishResult(result);
        setIsFinishing(false);
        return result;
      }

      setIsFinishing(false);
      return null;
    } catch (error) {
      console.error("Error finishing match:", error);
      toast({
        title: "Erro ao salvar partida",
        description: "Tente novamente",
        variant: "destructive",
      });
      setIsFinishing(false);
      setIsAnalyzingLive(false);
      setAnalysisProgress(null);
      return null;
    }
  }, [stopRecording, currentScore, matchInfo, approvedEvents, detectedEvents, transcriptBuffer, recordingTime, saveTranscriptToDatabase, saveRecordedVideo, toast]);

  const resetFinishResult = useCallback(() => {
    setFinishResult(null);
    tempMatchIdRef.current = null;
    setCurrentMatchId(null);
  }, []);

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
    // Video recording exports
    isRecordingVideo,
    videoUploadProgress,
    isUploadingVideo,
    // Expose current match ID as state for reactivity
    currentMatchId,
    // Finish match states
    isFinishing,
    finishResult,
    resetFinishResult,
    // Live analysis states
    isAnalyzingLive,
    analysisProgress,
    // Actions
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
