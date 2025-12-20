import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

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
  recordingTimestamp?: number;
  clipUrl?: string;
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

export interface FinishMatchResult {
  matchId: string;
  videoUrl: string | null;
  eventsCount: number;
  transcriptWords: number;
  duration: number;
}

interface LiveBroadcastContextType {
  // State
  matchInfo: MatchInfo;
  setMatchInfo: (info: MatchInfo) => void;
  streamUrl: string;
  setStreamUrl: (url: string) => void;
  cameraStream: MediaStream | null;
  setCameraStream: (stream: MediaStream | null) => void;
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  detectedEvents: LiveEvent[];
  approvedEvents: LiveEvent[];
  currentScore: Score;
  transcriptBuffer: string;
  transcriptChunks: TranscriptChunk[];
  isSavingTranscript: boolean;
  lastSavedAt: Date | null;
  isProcessingAudio: boolean;
  lastProcessedAt: Date | null;
  currentMatchId: string | null;
  isRecordingVideo: boolean;
  videoUploadProgress: number;
  isUploadingVideo: boolean;
  isFinishing: boolean;
  finishResult: FinishMatchResult | null;
  latestVideoChunkUrl: string | null;
  
  // Actions
  startRecording: (videoElement?: HTMLVideoElement | null, existingMatchId?: string | null) => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  addManualEvent: (type: string) => Promise<void>;
  addDetectedEvent: (eventData: {
    type: string;
    minute: number;
    second: number;
    description: string;
    confidence?: number;
    source?: string;
  }) => void;
  approveEvent: (eventId: string) => Promise<void>;
  editEvent: (eventId: string, updates: Partial<LiveEvent>) => void;
  removeEvent: (eventId: string) => void;
  updateScore: (team: "home" | "away", delta: number) => void;
  finishMatch: () => Promise<FinishMatchResult | null>;
  resetFinishResult: () => void;
  setTranscriptBuffer: (buffer: string) => void;
  setTranscriptChunks: (chunks: TranscriptChunk[]) => void;
}

const LiveBroadcastContext = createContext<LiveBroadcastContextType | null>(null);

export function LiveBroadcastProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  
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
  
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  
  const [finishResult, setFinishResult] = useState<FinishMatchResult | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  
  // NEW: Latest video chunk URL for real-time clip generation
  const [latestVideoChunkUrl, setLatestVideoChunkUrl] = useState<string | null>(null);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tempMatchIdRef = useRef<string | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chunkSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const isGeneratingClipRef = useRef(false);
  
  // Ref to hold addDetectedEvent function (to avoid circular dependency in processAudioChunk)
  const addDetectedEventRef = useRef<((eventData: {
    type: string;
    minute: number;
    second: number;
    description: string;
    confidence?: number;
    source?: string;
  }) => Promise<void>) | null>(null);

  // CRITICAL: Keep tempMatchIdRef synchronized with currentMatchId state
  useEffect(() => {
    if (currentMatchId && !tempMatchIdRef.current) {
      tempMatchIdRef.current = currentMatchId;
      console.log('✅ tempMatchIdRef synced from currentMatchId:', currentMatchId);
    }
  }, [currentMatchId]);

  // Save transcript to database
  const saveTranscriptToDatabase = useCallback(async (matchId?: string) => {
    if (!transcriptBuffer.trim()) return;
    
    const targetMatchId = matchId || tempMatchIdRef.current;
    if (!targetMatchId) return;
    
    setIsSavingTranscript(true);
    
    try {
      const { data: existing } = await supabase
        .from("generated_audio")
        .select("id, script")
        .eq("match_id", targetMatchId)
        .eq("audio_type", "live_transcript")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("generated_audio")
          .update({
            script: transcriptBuffer.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
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

  // Save score to database when it changes during recording
  useEffect(() => {
    if (!isRecording || !tempMatchIdRef.current) return;
    
    const saveScoreToDatabase = async () => {
      try {
        await supabase
          .from("matches")
          .update({
            home_score: currentScore.home,
            away_score: currentScore.away,
          })
          .eq("id", tempMatchIdRef.current);
        console.log("Score saved in real-time:", currentScore);
      } catch (error) {
        console.error("Error saving score:", error);
      }
    };
    
    saveScoreToDatabase();
  }, [currentScore, isRecording]);

  // NEW: Save video chunks periodically for real-time clip generation
  // Returns the URL directly to avoid race condition with state
  const saveVideoChunk = useCallback(async (): Promise<string | null> => {
    if (videoChunksRef.current.length === 0 || !tempMatchIdRef.current) {
      console.log('No video chunks or no match ID - cannot save chunk');
      return null;
    }
    
    try {
      const mimeType = videoRecorderRef.current?.mimeType || 'video/webm';
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const videoBlob = new Blob(videoChunksRef.current, { type: mimeType });
      
      const filePath = `live-chunks/${tempMatchIdRef.current}/chunk-${Date.now()}.${extension}`;
      console.log(`Saving video chunk: ${filePath}, size: ${(videoBlob.size / 1024).toFixed(1)} KB`);
      
      const { error: uploadError } = await supabase.storage
        .from('match-videos')
        .upload(filePath, videoBlob, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        console.error('Error uploading video chunk:', uploadError);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('match-videos')
        .getPublicUrl(filePath);
      
      const chunkUrl = urlData.publicUrl;
      setLatestVideoChunkUrl(chunkUrl);
      console.log('Video chunk saved successfully:', chunkUrl);
      return chunkUrl;
    } catch (error) {
      console.error('Error saving video chunk:', error);
      return null;
    }
  }, []);

  // Create temporary match
  const createTempMatch = useCallback(async (): Promise<string | null> => {
    // PREVENT DUPLICATE: If we already have a match ID, don't create a new one
    if (tempMatchIdRef.current) {
      console.log("Match already exists, reusing:", tempMatchIdRef.current);
      return tempMatchIdRef.current;
    }

    console.log("Creating new match with info:", matchInfo);
    
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

      if (error) {
        console.error("Error creating match:", error);
        toast({
          title: "Erro ao criar partida",
          description: error.message,
          variant: "destructive",
        });
        return null;
      }

      if (match) {
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
    } catch (error) {
      console.error("Unexpected error creating match:", error);
      toast({
        title: "Erro inesperado",
        description: "Não foi possível criar a partida",
        variant: "destructive",
      });
      return null;
    }
  }, [matchInfo, toast]);

  // Start video recording
  const startVideoRecording = useCallback((videoElement: HTMLVideoElement) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth || 1280;
      canvas.height = videoElement.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      canvasRef.current = canvas;
      videoElementRef.current = videoElement;

      console.log(`Starting video recording: ${canvas.width}x${canvas.height}`);
      // NOTE: Always draw frames, even before isRecording is true
      // This ensures we capture video from the very start
      const drawFrame = () => {
        if (ctx && videoElementRef.current) {
          ctx.drawImage(videoElementRef.current, 0, 0, canvas.width, canvas.height);
        }
        animationFrameRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrame();

      const canvasStream = canvas.captureStream(30);

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
      videoRecorder.start(5000);
      setIsRecordingVideo(true);

      // Start periodic chunk saving for clip generation (every 20 seconds)
      chunkSaveIntervalRef.current = setInterval(() => {
        saveVideoChunk();
      }, 20000);
      
      // Save first chunk after 10 seconds to enable early clip generation
      setTimeout(() => {
        if (videoChunksRef.current.length > 0) {
          console.log('Saving initial video chunk for early clip generation...');
          saveVideoChunk();
        }
      }, 10000);

      console.log('Video recording started with mimeType:', selectedMimeType || 'default');

    } catch (error) {
      console.error('Error starting video recording:', error);
      toast({
        title: "Erro na gravação de vídeo",
        description: "Não foi possível iniciar a gravação do vídeo",
        variant: "destructive",
      });
    }
  }, [isRecording, isPaused, toast, saveVideoChunk]);

  // Save recorded video
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

      const { data: urlData } = supabase.storage
        .from('match-videos')
        .getPublicUrl(filePath);

      const videoUrl = urlData.publicUrl;

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

  // Stop video recording
  const stopVideoRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
      videoRecorderRef.current.stop();
    }

    if (chunkSaveIntervalRef.current) {
      clearInterval(chunkSaveIntervalRef.current);
      chunkSaveIntervalRef.current = null;
    }

    setIsRecordingVideo(false);
    console.log('Video recording stopped');
  }, []);

  // Process audio chunk
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
            console.log(`Detected ${eventsData.events.length} new events - saving to database...`);
            
            // Calculate REAL minute/second based on actual recordingTime
            // (AI-returned minute may be wrong since it doesn't know the real recording time)
            const realMinute = Math.floor(recordingTime / 60);
            const realSecond = recordingTime % 60;
            
            // Call addDetectedEvent via ref for each event (saves to DB + state)
            for (const e of eventsData.events) {
              if (addDetectedEventRef.current) {
                await addDetectedEventRef.current({
                  type: e.type,
                  minute: realMinute,  // Use real recording time, not AI-guessed time
                  second: realSecond,
                  description: e.description,
                  confidence: e.confidence || 0.8,
                  source: 'live-transcription'
                });
              }
            }
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

  // Start recording - Now accepts existingMatchId to continue existing match
  const startRecording = useCallback(async (videoElement?: HTMLVideoElement | null, existingMatchId?: string | null) => {
    try {
      let audioStream: MediaStream;
      
      if (cameraStream) {
        const audioTracks = cameraStream.getAudioTracks();
        if (audioTracks.length === 0) {
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

      audioStreamRef.current = audioStream;

      let matchId: string | null;

      // FIX: Use existing match if provided, don't create new one
      if (existingMatchId) {
        matchId = existingMatchId;
        tempMatchIdRef.current = matchId;
        setCurrentMatchId(matchId);
        
        // Update status to 'live'
        await supabase
          .from("matches")
          .update({ status: "live" })
          .eq("id", matchId);
        
        // Load existing events
        const { data: existingEvents } = await supabase
          .from("match_events")
          .select("*")
          .eq("match_id", matchId)
          .order("minute", { ascending: true });
        
        if (existingEvents?.length) {
          setApprovedEvents(existingEvents.map((e) => ({
            id: e.id,
            type: e.event_type,
            minute: e.minute || 0,
            second: e.second || 0,
            description: e.description || "",
            status: "approved" as const,
            recordingTimestamp: e.metadata && typeof e.metadata === 'object' && 'videoSecond' in e.metadata 
              ? (e.metadata as any).videoSecond 
              : (e.minute || 0) * 60 + (e.second || 0),
            clipUrl: e.clip_url || undefined
          })));
        }

        // Load existing score
        const { data: matchData } = await supabase
          .from("matches")
          .select("home_score, away_score")
          .eq("id", matchId)
          .single();
        
        if (matchData) {
          setCurrentScore({
            home: matchData.home_score || 0,
            away: matchData.away_score || 0
          });
        }
        
        toast({
          title: "Continuando partida",
          description: "Retomando gravação da partida existente",
        });
      } else {
        // Create new match
        matchId = await createTempMatch();
        if (!matchId) {
          toast({
            title: "Erro ao iniciar",
            description: "Não foi possível criar a partida. Verifique os dados e tente novamente.",
            variant: "destructive",
          });
          audioStream.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
          return;
        }
      }

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
      
      // Only reset if new match
      if (!existingMatchId) {
        setRecordingTime(0);
        setTranscriptBuffer("");
        setTranscriptChunks([]);
      }
      
      audioChunksRef.current = [];
      videoChunksRef.current = [];

      if (videoElement) {
        if (videoElement.readyState >= 2) {
          startVideoRecording(videoElement);
        } else {
          videoElement.addEventListener('loadeddata', () => {
            startVideoRecording(videoElement);
          }, { once: true });
        }
      }

      transcriptionIntervalRef.current = setInterval(() => {
        processAudioChunk();
      }, 10000);
      
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
  }, [cameraStream, toast, createTempMatch, startVideoRecording, processAudioChunk]);

  // Stop recording
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
    
    stopVideoRecording();
    
    if (transcriptBuffer.trim()) {
      saveTranscriptToDatabase();
    }
    
    setIsRecording(false);
    setIsPaused(false);
  }, [transcriptBuffer, saveTranscriptToDatabase, stopVideoRecording]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      
      if (videoRecorderRef.current && videoRecorderRef.current.state === 'recording') {
        videoRecorderRef.current.pause();
      }
      
      setIsPaused(true);
      
      if (transcriptBuffer.trim()) {
        saveTranscriptToDatabase();
      }
    }
  }, [isRecording, transcriptBuffer, saveTranscriptToDatabase]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isPaused) {
      mediaRecorderRef.current.resume();
      
      if (videoRecorderRef.current && videoRecorderRef.current.state === 'paused') {
        videoRecorderRef.current.resume();
      }
      
      setIsPaused(false);
    }
  }, [isPaused]);

  // Load FFmpeg for clip generation
  const loadFFmpeg = useCallback(async () => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
  }, []);

  // Generate clip for event using FFmpeg
  const generateClipForEvent = useCallback(async (event: LiveEvent, videoUrl: string) => {
    const matchId = tempMatchIdRef.current;
    if (!matchId || !videoUrl || isGeneratingClipRef.current) return;
    
    isGeneratingClipRef.current = true;
    console.log(`Generating clip for event ${event.id}...`);
    
    try {
      const ffmpeg = await loadFFmpeg();
      
      // Calculate timestamps (3s before, 5s after)
      const eventSeconds = event.recordingTimestamp || (event.minute * 60 + event.second);
      const startTimeSeconds = Math.max(0, eventSeconds - 3);
      const durationSeconds = 8;
      
      // Download the video chunk
      const videoData = await fetchFile(videoUrl);
      await ffmpeg.writeFile('input.mp4', videoData);
      
      // Convert ms to FFmpeg timestamp
      const hours = Math.floor(startTimeSeconds / 3600);
      const minutes = Math.floor((startTimeSeconds % 3600) / 60);
      const seconds = startTimeSeconds % 60;
      const startTimestamp = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
      
      // Extract clip
      await ffmpeg.exec([
        '-ss', startTimestamp,
        '-i', 'input.mp4',
        '-t', durationSeconds.toString(),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        'output.mp4'
      ]);
      
      // Read output
      const clipData = await ffmpeg.readFile('output.mp4');
      let clipBlob: Blob;
      if (clipData instanceof Uint8Array) {
        // Create a new ArrayBuffer and copy the data
        const buffer = new ArrayBuffer(clipData.length);
        const view = new Uint8Array(buffer);
        view.set(clipData);
        clipBlob = new Blob([buffer], { type: 'video/mp4' });
      } else {
        clipBlob = new Blob([clipData as BlobPart], { type: 'video/mp4' });
      }
      
      // Clean up
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp4');
      
      // Upload to storage
      const filePath = `${matchId}/${event.id}.mp4`;
      const { error: uploadError } = await supabase.storage
        .from('event-clips')
        .upload(filePath, clipBlob, {
          contentType: 'video/mp4',
          upsert: true
        });

      if (uploadError) {
        console.error('Clip upload error:', uploadError);
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('event-clips')
        .getPublicUrl(filePath);

      const clipUrl = urlData.publicUrl;

      // Update database
      await supabase
        .from('match_events')
        .update({ clip_url: clipUrl })
        .eq('id', event.id);

      // Update local state
      setApprovedEvents(prev => prev.map(e => 
        e.id === event.id ? { ...e, clipUrl } : e
      ));

      console.log(`Clip generated for event ${event.id}:`, clipUrl);
      
      toast({
        title: "Clip gerado",
        description: `Clip do evento ${event.type} criado com sucesso`,
      });
    } catch (error) {
      console.error('Error generating clip:', error);
    } finally {
      isGeneratingClipRef.current = false;
    }
  }, [loadFFmpeg, toast]);

  // Call live analysis edge function
  const triggerLiveAnalysis = useCallback(async (event: LiveEvent) => {
    const matchId = tempMatchIdRef.current;
    if (!matchId) return;

    try {
      await supabase.functions.invoke('generate-live-analysis', {
        body: {
          matchId,
          event: {
            id: event.id,
            type: event.type,
            minute: event.minute,
            second: event.second,
            description: event.description,
            confidence: event.confidence,
          },
          allEvents: approvedEvents.map(e => ({
            type: e.type,
            minute: e.minute,
            second: e.second,
            description: e.description,
          })),
          homeTeam: matchInfo.homeTeam,
          awayTeam: matchInfo.awayTeam,
          score: currentScore,
        }
      });
      console.log('Live analysis triggered for event:', event.type);
    } catch (error) {
      console.error('Error triggering live analysis:', error);
    }
  }, [approvedEvents, matchInfo, currentScore]);

  // Add manual event
  const addManualEvent = useCallback(async (type: string) => {
    // CRITICAL: Use multiple fallbacks for matchId
    const matchId = tempMatchIdRef.current || currentMatchId;
    const minute = Math.floor(recordingTime / 60);
    const second = recordingTime % 60;

    console.log('=== ADD MANUAL EVENT ===');
    console.log('type:', type);
    console.log('tempMatchIdRef.current:', tempMatchIdRef.current);
    console.log('currentMatchId state:', currentMatchId);
    console.log('matchId used:', matchId);
    console.log('isRecording:', isRecording);

    if (!matchId) {
      console.error('❌ CRITICAL: No matchId available - event will NOT be saved to database');
      toast({
        title: "Erro",
        description: "Inicie a gravação antes de adicionar eventos",
        variant: "destructive"
      });
      return;
    }

    const eventId = crypto.randomUUID();
    const newEvent: LiveEvent = {
      id: eventId,
      type,
      minute,
      second,
      description: `${type} aos ${minute}'${second}"`,
      status: "approved",
      recordingTimestamp: recordingTime,
    };

    setApprovedEvents((prev) => [...prev, newEvent]);

    if (type === "goal_home") {
      setCurrentScore((prev) => ({ ...prev, home: prev.home + 1 }));
    } else if (type === "goal_away") {
      setCurrentScore((prev) => ({ ...prev, away: prev.away + 1 }));
    }

    // Always save to database since we validated matchId
    {
        try {
          await supabase.from("match_events").insert({
            id: eventId,
            match_id: matchId,
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
          
          // IMMEDIATE: Save video chunk and get URL directly (fixes race condition)
          let chunkUrl: string | null = null;
          if (videoChunksRef.current.length > 0) {
            chunkUrl = await saveVideoChunk();
            console.log('Video chunk saved for manual event, URL:', chunkUrl);
          }
          
          // Generate clip using the returned URL (not stale state)
          const videoUrl = chunkUrl || latestVideoChunkUrl;
          if (videoUrl) {
            console.log('Generating clip for manual event with URL:', videoUrl);
            generateClipForEvent(newEvent, videoUrl);
          } else {
            console.log('No video URL available for clip generation');
          }

          // Trigger live analysis immediately
          console.log('Triggering live analysis for manual event:', type);
          triggerLiveAnalysis(newEvent);
        } catch (error) {
          console.error("Error saving manual event:", error);
        }
      }

    toast({
      title: "Evento adicionado",
      description: newEvent.description,
    });
  }, [recordingTime, toast, latestVideoChunkUrl, generateClipForEvent, saveVideoChunk, triggerLiveAnalysis, currentMatchId, isRecording]);

  // Add detected event from AI - NOW SAVES TO DATABASE IMMEDIATELY
  const addDetectedEvent = useCallback(async (eventData: {
    type: string;
    minute: number;
    second: number;
    description: string;
    confidence?: number;
    source?: string;
  }) => {
    const matchId = tempMatchIdRef.current || currentMatchId;
    const eventId = crypto.randomUUID();
    
    const newEvent: LiveEvent = {
      id: eventId,
      type: eventData.type,
      minute: eventData.minute,
      second: eventData.second,
      description: eventData.description,
      confidence: eventData.confidence,
      status: "pending",
      recordingTimestamp: recordingTime,
    };

    const isDuplicate = detectedEvents.some(
      (e) =>
        e.type === newEvent.type &&
        Math.abs((e.recordingTimestamp || 0) - (newEvent.recordingTimestamp || 0)) < 30
    );

    if (!isDuplicate) {
      setDetectedEvents((prev) => [...prev, newEvent]);
      
      // IMMEDIATELY save to database (pending approval)
      if (matchId) {
        try {
          await supabase.from("match_events").insert({
            id: eventId,
            match_id: matchId,
            event_type: eventData.type,
            minute: eventData.minute,
            second: eventData.second,
            description: eventData.description,
            approval_status: "pending",
            is_highlight: ['goal', 'goal_home', 'goal_away', 'red_card', 'penalty'].includes(eventData.type),
            match_half: eventData.minute < 45 ? 'first' : 'second',
            metadata: {
              eventMs: recordingTime * 1000,
              videoSecond: recordingTime,
              source: eventData.source || 'live-detected',
              confidence: eventData.confidence
            }
          });
          console.log("✅ Detected event saved immediately to database:", eventData.type);
          
          // Save video chunk for potential clip generation later
          if (videoChunksRef.current.length > 0) {
            saveVideoChunk();
          }
        } catch (error) {
          console.error("Error saving detected event to database:", error);
        }
      } else {
        console.warn("⚠️ No matchId available - event only saved locally");
      }
      
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
  }, [detectedEvents, recordingTime, matchInfo, toast, currentMatchId, saveVideoChunk]);

  // Keep ref synchronized with the latest addDetectedEvent function
  useEffect(() => {
    addDetectedEventRef.current = addDetectedEvent;
  }, [addDetectedEvent]);

  const approveEvent = useCallback(async (eventId: string) => {
    const event = detectedEvents.find((e) => e.id === eventId);
    const matchId = tempMatchIdRef.current || currentMatchId;
    
    if (event) {
      setDetectedEvents((prev) => prev.filter((e) => e.id !== eventId));
      setApprovedEvents((prev) => [...prev, { ...event, status: "approved" }]);

      if (event.type === "goal") {
        const desc = event.description.toLowerCase();
        if (matchInfo.homeTeam && desc.includes(matchInfo.homeTeam.toLowerCase())) {
          setCurrentScore((prev) => ({ ...prev, home: prev.home + 1 }));
        } else if (matchInfo.awayTeam && desc.includes(matchInfo.awayTeam.toLowerCase())) {
          setCurrentScore((prev) => ({ ...prev, away: prev.away + 1 }));
        }
      }

      if (matchId) {
        try {
          // UPDATE existing event (already saved when detected) instead of INSERT
          const { error: updateError } = await supabase
            .from("match_events")
            .update({
              approval_status: "approved",
              approved_at: new Date().toISOString(),
            })
            .eq("id", event.id);
          
          if (updateError) {
            // Fallback: try insert if update fails (event might not exist)
            console.warn("Update failed, trying insert:", updateError);
            await supabase.from("match_events").insert({
              id: event.id,
              match_id: matchId,
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
          }
          
          console.log("✅ Event approved and saved:", event.type);
          
          // IMMEDIATE: Save video chunk and get URL directly
          let chunkUrl: string | null = null;
          if (videoChunksRef.current.length > 0) {
            chunkUrl = await saveVideoChunk();
            console.log('Video chunk saved for approved event, URL:', chunkUrl);
          }
          
          // Generate clip using the returned URL
          const videoUrl = chunkUrl || latestVideoChunkUrl;
          if (videoUrl) {
            console.log('Generating clip for approved event with URL:', videoUrl);
            generateClipForEvent(event, videoUrl);
          } else {
            console.log('No video URL available for clip generation - clips can be generated later from Analysis page');
          }

          // Trigger live analysis immediately
          console.log('Triggering live analysis for approved event:', event.type);
          triggerLiveAnalysis(event);
        } catch (error) {
          console.error("Error approving event:", error);
        }
      }
    }
  }, [detectedEvents, matchInfo, latestVideoChunkUrl, generateClipForEvent, saveVideoChunk, triggerLiveAnalysis, currentMatchId]);

  // Edit event
  const editEvent = useCallback((eventId: string, updates: Partial<LiveEvent>) => {
    setDetectedEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, ...updates } : e))
    );
    setApprovedEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, ...updates } : e))
    );
  }, []);

  // Remove event
  const removeEvent = useCallback((eventId: string) => {
    setDetectedEvents((prev) => prev.filter((e) => e.id !== eventId));
    setApprovedEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  // Update score
  const updateScore = useCallback((team: "home" | "away", delta: number) => {
    setCurrentScore((prev) => ({
      ...prev,
      [team]: Math.max(0, prev[team] + delta),
    }));
  }, []);

  // Finish match
  const finishMatch = useCallback(async (): Promise<FinishMatchResult | null> => {
    stopRecording();
    setIsFinishing(true);

    try {
      const matchId = tempMatchIdRef.current;
      
      if (matchId) {
        toast({ 
          title: "Salvando vídeo...", 
          description: "Aguarde o upload da gravação" 
        });
        
        const videoUrl = await saveRecordedVideo(matchId);

        await supabase
          .from("matches")
          .update({
            home_team_id: matchInfo.homeTeamId || null,
            away_team_id: matchInfo.awayTeamId || null,
            home_score: currentScore.home,
            away_score: currentScore.away,
            competition: matchInfo.competition,
            status: "analyzed",
          })
          .eq("id", matchId);

        await saveTranscriptToDatabase(matchId);

        console.log(`Finish match: ${approvedEvents.length} events already saved in real-time`);

        await supabase.from("analysis_jobs").insert({
          match_id: matchId,
          status: 'completed',
          progress: 100,
          current_step: 'Análise ao vivo concluída',
          completed_at: new Date().toISOString(),
          result: {
            eventsDetected: approvedEvents.length,
            source: 'live',
            duration: recordingTime,
            transcriptWords: transcriptBuffer.split(" ").length
          }
        });

        const result: FinishMatchResult = {
          matchId,
          videoUrl,
          eventsCount: approvedEvents.length,
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
      return null;
    }
  }, [stopRecording, currentScore, matchInfo, approvedEvents, transcriptBuffer, recordingTime, saveTranscriptToDatabase, saveRecordedVideo, toast]);

  // Reset finish result
  const resetFinishResult = useCallback(() => {
    setFinishResult(null);
    tempMatchIdRef.current = null;
    setCurrentMatchId(null);
    setDetectedEvents([]);
    setApprovedEvents([]);
    setCurrentScore({ home: 0, away: 0 });
    setTranscriptBuffer("");
    setTranscriptChunks([]);
    setRecordingTime(0);
    setLatestVideoChunkUrl(null);
  }, []);

  const value: LiveBroadcastContextType = {
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
    currentMatchId,
    isRecordingVideo,
    videoUploadProgress,
    isUploadingVideo,
    isFinishing,
    finishResult,
    latestVideoChunkUrl,
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
    resetFinishResult,
    setTranscriptBuffer,
    setTranscriptChunks,
  };

  return (
    <LiveBroadcastContext.Provider value={value}>
      {children}
    </LiveBroadcastContext.Provider>
  );
}

export function useLiveBroadcastContext() {
  const context = useContext(LiveBroadcastContext);
  if (!context) {
    throw new Error("useLiveBroadcastContext must be used within LiveBroadcastProvider");
  }
  return context;
}
