import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { apiClient } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoSegmentBuffer, VideoSegment, calculateClipWindow } from '@/utils/videoSegmentBuffer';

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

export interface VideoChunk {
  blob: Blob;
  timestamp: number;
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
  getClipChunksForTime: (startTime: number, endTime: number) => VideoChunk[];
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
  
  const [latestVideoChunkUrl, setLatestVideoChunkUrl] = useState<string | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  
  const segmentBufferRef = useRef<VideoSegmentBuffer | null>(null);
  const [segmentCount, setSegmentCount] = useState(0);

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
  const segmentSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const isGeneratingClipRef = useRef(false);
  
  const recordingTimeRef = useRef(0);
  const clipVideoChunksRef = useRef<{ blob: Blob; timestamp: number }[]>([]);
  const allVideoChunksRef = useRef<Blob[]>([]);
  
  const addDetectedEventRef = useRef<((eventData: {
    type: string;
    minute: number;
    second: number;
    description: string;
    confidence?: number;
    source?: string;
  }) => Promise<void>) | null>(null);

  useEffect(() => {
    if (currentMatchId && !tempMatchIdRef.current) {
      tempMatchIdRef.current = currentMatchId;
      console.log('✅ tempMatchIdRef synced from currentMatchId:', currentMatchId);
    }
  }, [currentMatchId]);

  // Load existing events from database
  const loadExistingEvents = useCallback(async (matchId: string) => {
    console.log('📥 Loading existing events for match:', matchId);
    try {
      const events = await apiClient.getMatchEvents(matchId);
      
      if (events && events.length > 0) {
        console.log(`📥 Found ${events.length} existing events`);
        
        const pending = events.filter((e: any) => e.approval_status === 'pending');
        const approved = events.filter((e: any) => e.approval_status === 'approved');
        
        const mapEvent = (e: any): LiveEvent => ({
          id: e.id,
          type: e.event_type,
          minute: e.minute || 0,
          second: e.second || 0,
          description: e.description || '',
          confidence: e.metadata?.confidence,
          status: e.approval_status as 'pending' | 'approved' | 'rejected',
          recordingTimestamp: e.metadata?.videoSecond,
          clipUrl: e.clip_url || undefined,
        });
        
        setDetectedEvents(pending.map(mapEvent));
        setApprovedEvents(approved.map(mapEvent));
        
        console.log(`✅ Loaded ${pending.length} pending + ${approved.length} approved events`);
      } else {
        console.log('📥 No existing events found');
      }
    } catch (error) {
      console.error('Error loading existing events:', error);
    }
  }, []);

  // Save transcript to database
  const saveTranscriptToDatabase = useCallback(async (matchId?: string) => {
    if (!transcriptBuffer.trim()) return;
    
    const targetMatchId = matchId || tempMatchIdRef.current;
    if (!targetMatchId) return;
    
    setIsSavingTranscript(true);
    
    try {
      // Get existing transcript
      const audioList = await apiClient.getAudio(targetMatchId, 'live_transcript');
      const existing = audioList?.[0];

      if (existing) {
        await apiClient.updateAudio(existing.id, {
          script: transcriptBuffer.trim(),
          updated_at: new Date().toISOString(),
        });
      } else {
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
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          recordingTimeRef.current = newTime;
          return newTime;
        });
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

  // Upload a video segment to storage
  const uploadSegment = useCallback(async (segment: VideoSegment): Promise<string | null> => {
    const matchId = tempMatchIdRef.current;
    if (!matchId || !segment.blob) return null;
    
    try {
      console.log(`[SegmentUpload] Uploading segment ${segment.id}, size: ${(segment.blob.size / 1024 / 1024).toFixed(2)}MB`);
      
      const result = await apiClient.uploadBlob(matchId, 'videos', segment.blob, `segment-${segment.id}.webm`);
      
      segment.url = result.url;
      setSegmentCount(prev => prev + 1);
      console.log(`[SegmentUpload] Segment uploaded: ${result.url}`);
      
      toast({
        title: "Segmento salvo",
        description: `Segmento ${segmentCount + 1} salvo com sucesso`,
        duration: 2000,
      });
      
      return result.url;
    } catch (error) {
      console.error('[SegmentUpload] Error:', error);
      return null;
    }
  }, [segmentCount, toast]);

  // Initialize segment buffer
  const initializeSegmentBuffer = useCallback(() => {
    if (segmentBufferRef.current) return;
    
    segmentBufferRef.current = new VideoSegmentBuffer(
      {
        segmentDurationMs: 5 * 60 * 1000,
        overlapDurationMs: 1 * 60 * 1000,
        maxSegments: 3,
      },
      async (segment) => {
        await uploadSegment(segment);
      }
    );
    
    console.log('[SegmentBuffer] Initialized with 5-minute segments and 1-minute overlap');
  }, [uploadSegment]);

  // Save video chunks periodically
  const saveVideoChunk = useCallback(async (): Promise<string | null> => {
    if (videoChunksRef.current.length === 0 || !tempMatchIdRef.current) {
      console.log('No video chunks or no match ID - cannot save chunk');
      return null;
    }
    
    try {
      const mimeType = videoRecorderRef.current?.mimeType || 'video/webm';
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const videoBlob = new Blob(videoChunksRef.current, { type: mimeType });
      
      console.log(`Saving video chunk, size: ${(videoBlob.size / 1024).toFixed(1)} KB`);
      
      const result = await apiClient.uploadBlob(
        tempMatchIdRef.current, 
        'videos', 
        videoBlob, 
        `chunk-${Date.now()}.${extension}`
      );
      
      setLatestVideoChunkUrl(result.url);
      console.log('Video chunk saved successfully:', result.url);
      return result.url;
    } catch (error) {
      console.error('Error saving video chunk:', error);
      return null;
    }
  }, []);

  // Create temporary match
  const createTempMatch = useCallback(async (): Promise<string | null> => {
    if (tempMatchIdRef.current) {
      console.log("Match already exists, reusing:", tempMatchIdRef.current);
      return tempMatchIdRef.current;
    }

    console.log("Creating new match with info:", matchInfo);
    
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
      
      initializeSegmentBuffer();
      segmentBufferRef.current?.start(Date.now());
      setSegmentCount(0);
      
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
          const chunkSizeKB = event.data.size / 1024;
          
          videoChunksRef.current.push(event.data);
          allVideoChunksRef.current.push(event.data);
          
          const currentTime = recordingTimeRef.current;
          
          clipVideoChunksRef.current.push({ blob: event.data, timestamp: currentTime });
          
          const maxClipChunks = 36;
          if (clipVideoChunksRef.current.length > maxClipChunks) {
            clipVideoChunksRef.current = clipVideoChunksRef.current.slice(-maxClipChunks);
          }
          
          if (segmentBufferRef.current) {
            segmentBufferRef.current.addChunk(event.data, currentTime);
          }
          
          const totalSize = allVideoChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
          const warnIcon = chunkSizeKB < 1 ? '⚠️' : '📹';
          console.log(`${warnIcon} Video chunk: ${chunkSizeKB.toFixed(1)}KB at ${currentTime}s | All: ${allVideoChunksRef.current.length} (${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
        }
      };

      videoRecorder.onerror = (event) => {
        console.error('Video recorder error:', event);
      };

      videoRecorderRef.current = videoRecorder;
      videoRecorder.start(5000);
      setIsRecordingVideo(true);

      chunkSaveIntervalRef.current = setInterval(() => {
        saveVideoChunk();
      }, 20000);
      
      setTimeout(() => {
        if (videoChunksRef.current.length > 0) {
          console.log('Saving initial video chunk for early clip generation...');
          saveVideoChunk();
        }
      }, 10000);

      console.log('Video recording started with segment buffer, mimeType:', selectedMimeType || 'default');

    } catch (error) {
      console.error('Error starting video recording:', error);
      toast({
        title: "Erro na gravação de vídeo",
        description: "Não foi possível iniciar a gravação do vídeo",
        variant: "destructive",
      });
    }
  }, [toast, saveVideoChunk, initializeSegmentBuffer]);

  // Start video recording from stream directly
  const startVideoRecordingFromStream = useCallback((stream: MediaStream) => {
    try {
      console.log('[startVideoRecordingFromStream] Starting recording from MediaStream');
      
      initializeSegmentBuffer();
      segmentBufferRef.current?.start(Date.now());
      setSegmentCount(0);

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

      const videoRecorder = new MediaRecorder(stream, recorderOptions);

      videoRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data);
          allVideoChunksRef.current.push(event.data);
          
          const currentTime = recordingTimeRef.current;
          clipVideoChunksRef.current.push({ blob: event.data, timestamp: currentTime });
          
          const maxClipChunks = 36;
          if (clipVideoChunksRef.current.length > maxClipChunks) {
            clipVideoChunksRef.current = clipVideoChunksRef.current.slice(-maxClipChunks);
          }
          
          if (segmentBufferRef.current) {
            segmentBufferRef.current.addChunk(event.data, currentTime);
          }
        }
      };

      videoRecorderRef.current = videoRecorder;
      videoRecorder.start(5000);
      setIsRecordingVideo(true);

      chunkSaveIntervalRef.current = setInterval(() => {
        saveVideoChunk();
      }, 20000);

      console.log('[startVideoRecordingFromStream] Recording started, mimeType:', selectedMimeType || 'default');
    } catch (error) {
      console.error('[startVideoRecordingFromStream] Error:', error);
    }
  }, [saveVideoChunk, initializeSegmentBuffer]);

  // Stop video recording
  const stopVideoRecording = useCallback(async () => {
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
    
    if (segmentSaveIntervalRef.current) {
      clearInterval(segmentSaveIntervalRef.current);
      segmentSaveIntervalRef.current = null;
    }
    
    if (segmentBufferRef.current) {
      console.log('[SegmentBuffer] Flushing remaining segments...');
      await segmentBufferRef.current.flush();
    }

    setIsRecordingVideo(false);
    console.log('Video recording stopped, segments flushed');
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

        try {
          const transcriptData = await apiClient.transcribeAudio({ audio: base64Audio });

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
                console.log(`Detected ${eventsData.events.length} new events - saving to database...`);
                
                const realMinute = Math.floor(recordingTime / 60);
                const realSecond = recordingTime % 60;
                
                for (const e of eventsData.events) {
                  if (addDetectedEventRef.current) {
                    await addDetectedEventRef.current({
                      type: e.type,
                      minute: realMinute,
                      second: realSecond,
                      description: e.description,
                      confidence: e.confidence || 0.8,
                      source: 'live-transcription'
                    });
                  }
                }
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

  // Add manual event
  const addManualEvent = useCallback(async (type: string) => {
    const matchId = tempMatchIdRef.current || currentMatchId;
    const videoId = currentVideoIdRef.current;

    if (!matchId) {
      toast({
        title: "Erro",
        description: "Inicie a gravação antes de adicionar eventos.",
        variant: "destructive",
      });
      return;
    }

    const currentRecordingTime = recordingTimeRef.current;
    const currentMinute = Math.floor(currentRecordingTime / 60);
    const currentSecond = currentRecordingTime % 60;

    const eventLabels: Record<string, string> = {
      goal: 'Gol',
      goal_home: `Gol - ${matchInfo.homeTeam || 'Casa'}`,
      goal_away: `Gol - ${matchInfo.awayTeam || 'Fora'}`,
      yellow_card: 'Cartão Amarelo',
      red_card: 'Cartão Vermelho',
      foul: 'Falta',
      corner: 'Escanteio',
      offside: 'Impedimento',
      substitution: 'Substituição',
      penalty: 'Pênalti',
      shot: 'Finalização',
      save: 'Defesa',
    };

    const eventId = crypto.randomUUID();
    const newEvent: LiveEvent = {
      id: eventId,
      type,
      minute: currentMinute,
      second: currentSecond,
      description: eventLabels[type] || type,
      status: "approved",
      recordingTimestamp: currentRecordingTime,
    };

    setApprovedEvents((prev) => [...prev, newEvent]);
    
    if (type === 'goal_home' || type === 'goal') {
      setCurrentScore((prev) => ({ ...prev, home: prev.home + 1 }));
    } else if (type === 'goal_away') {
      setCurrentScore((prev) => ({ ...prev, away: prev.away + 1 }));
    }

    try {
      await apiClient.createEvent(matchId, {
        id: eventId,
        match_id: matchId,
        video_id: videoId || null,
        event_type: type,
        minute: currentMinute,
        second: currentSecond,
        description: newEvent.description,
        approval_status: "approved",
        is_highlight: ['goal', 'goal_home', 'goal_away', 'red_card', 'penalty'].includes(type),
        match_half: currentMinute < 45 ? 'first' : 'second',
        metadata: {
          eventMs: currentRecordingTime * 1000,
          videoSecond: currentRecordingTime,
          source: 'manual',
        }
      });
      
      console.log("✅ Manual event saved:", type, `at ${currentMinute}:${currentSecond}`);
      
      if (videoChunksRef.current.length > 0) {
        saveVideoChunk();
      }
    } catch (error) {
      console.error("Error saving manual event:", error);
    }

    toast({
      title: "Evento adicionado",
      description: `${newEvent.description} (${currentMinute}:${String(currentSecond).padStart(2, '0')})`,
      duration: 3000,
    });
  }, [currentMatchId, matchInfo, toast, saveVideoChunk]);

  // Trigger live analysis
  const triggerLiveAnalysis = useCallback(async (event: LiveEvent) => {
    const matchId = tempMatchIdRef.current || currentMatchId;
    if (!matchId) return;

    try {
      console.log('[triggerLiveAnalysis] Starting for event:', event.type);
      
      await apiClient.analyzeMatch({
        matchId,
        transcription: transcriptBuffer,
        homeTeam: matchInfo.homeTeam,
        awayTeam: matchInfo.awayTeam,
        gameStartMinute: 0,
        gameEndMinute: Math.ceil(recordingTimeRef.current / 60),
        halfType: event.minute < 45 ? 'first' : 'second',
      });
      
      console.log('[triggerLiveAnalysis] Analysis completed');
    } catch (error) {
      console.error('[triggerLiveAnalysis] Error:', error);
    }
  }, [currentMatchId, transcriptBuffer, matchInfo]);

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

  interface ClipGenerationResult {
    success: boolean;
    clipUrl?: string;
    error?: string;
  }

  // Generate clip for event
  const generateClipForEvent = useCallback(async (event: LiveEvent, videoUrl?: string): Promise<ClipGenerationResult> => {
    const matchId = tempMatchIdRef.current;
    if (!matchId) {
      return { success: false, error: 'No match ID' };
    }
    if (isGeneratingClipRef.current) {
      return { success: false, error: 'Already generating clip' };
    }
    
    isGeneratingClipRef.current = true;
    console.log(`[ClipGen] Generating clip for event ${event.id} at ${event.recordingTimestamp}s...`);
    
    try {
      const ffmpeg = await loadFFmpeg();
      
      const eventSeconds = event.recordingTimestamp || (event.minute * 60 + event.second);
      const { start: startTimeSeconds, duration: durationSeconds } = calculateClipWindow(eventSeconds, 5, 5);
      
      let videoData: Uint8Array | null = null;
      let relativeStartSeconds = 0;
      
      // PRIORITY 1: Use clipVideoChunksRef
      if (clipVideoChunksRef.current.length > 0) {
        const relevantChunks = clipVideoChunksRef.current.filter(chunk => {
          const chunkEnd = chunk.timestamp + 5;
          return chunk.timestamp <= (startTimeSeconds + durationSeconds) && chunkEnd >= startTimeSeconds;
        });
        
        if (relevantChunks.length > 0) {
          console.log(`[ClipGen] Using clipVideoChunksRef: ${relevantChunks.length} relevant chunks`);
          const mimeType = videoRecorderRef.current?.mimeType || 'video/webm';
          const rawBlob = new Blob(relevantChunks.map(c => c.blob), { type: mimeType });
          
          if (rawBlob.size > 1000) {
            const arrayBuffer = await rawBlob.arrayBuffer();
            videoData = new Uint8Array(arrayBuffer);
            const firstChunkTime = Math.min(...relevantChunks.map(c => c.timestamp));
            relativeStartSeconds = Math.max(0, startTimeSeconds - firstChunkTime);
          }
        }
      }
      
      // PRIORITY 2: Use all video chunks
      if (!videoData && videoChunksRef.current.length > 0) {
        console.log(`[ClipGen] Falling back to videoChunksRef: ${videoChunksRef.current.length} chunks`);
        const mimeType = videoRecorderRef.current?.mimeType || 'video/webm';
        const rawBlob = new Blob(videoChunksRef.current, { type: mimeType });
        
        if (rawBlob.size > 1000) {
          const arrayBuffer = await rawBlob.arrayBuffer();
          videoData = new Uint8Array(arrayBuffer);
          relativeStartSeconds = startTimeSeconds;
        }
      }
      
      // PRIORITY 3: Use segment buffer
      if (!videoData && segmentBufferRef.current) {
        const segment = segmentBufferRef.current.getSegmentForTime(eventSeconds);
        const videoBlob = segmentBufferRef.current.getBlobForTimeRange(startTimeSeconds, startTimeSeconds + durationSeconds);
        
        if (videoBlob && videoBlob.size > 1000) {
          console.log(`[ClipGen] Using segment buffer`);
          const arrayBuffer = await videoBlob.arrayBuffer();
          videoData = new Uint8Array(arrayBuffer);
          
          if (segment) {
            relativeStartSeconds = Math.max(0, startTimeSeconds - segment.startTime);
          }
        }
      }
      
      // PRIORITY 4: Download from URL
      if (!videoData && videoUrl) {
        console.log(`[ClipGen] Falling back to video URL: ${videoUrl}`);
        videoData = await fetchFile(videoUrl);
        relativeStartSeconds = startTimeSeconds;
      }
      
      if (!videoData) {
        console.warn('[ClipGen] No video data available from any source');
        isGeneratingClipRef.current = false;
        return { success: false, error: 'No video data available' };
      }
      
      // Validate input size
      const inputSizeKB = videoData.length / 1024;
      if (inputSizeKB < 100) {
        console.warn(`[ClipGen] Input video too small: ${inputSizeKB.toFixed(1)}KB`);
        isGeneratingClipRef.current = false;
        return { success: false, error: 'Input video too small' };
      }
      
      // Process with FFmpeg
      await ffmpeg.writeFile('input.webm', videoData);
      
      const extension = 'webm';
      const outputFile = `clip_${event.id}.${extension}`;
      
      await ffmpeg.exec([
        '-i', 'input.webm',
        '-ss', relativeStartSeconds.toString(),
        '-t', durationSeconds.toString(),
        '-c:v', 'libvpx',
        '-c:a', 'libvorbis',
        '-crf', '23',
        '-preset', 'ultrafast',
        outputFile
      ]);
      
      const clipData = await ffmpeg.readFile(outputFile);
      const clipDataArray = clipData instanceof Uint8Array ? new Uint8Array(clipData.buffer.slice(0)) : clipData;
      const clipBlob = new Blob([clipDataArray], { type: 'video/webm' });
      
      // Upload clip
      const result = await apiClient.uploadBlob(matchId, 'clips', clipBlob, `clip-${event.id}.webm`);
      
      // Update event with clip URL
      await apiClient.updateEvent(event.id, { clip_url: result.url });
      
      // Update local state
      setApprovedEvents(prev => prev.map(e => 
        e.id === event.id ? { ...e, clipUrl: result.url } : e
      ));
      
      // Cleanup FFmpeg files
      try {
        await ffmpeg.deleteFile('input.webm');
        await ffmpeg.deleteFile(outputFile);
      } catch {}
      
      isGeneratingClipRef.current = false;
      console.log(`[ClipGen] ✅ Clip generated: ${result.url}`);
      
      return { success: true, clipUrl: result.url };
    } catch (error) {
      console.error('[ClipGen] Error:', error);
      isGeneratingClipRef.current = false;
      return { success: false, error: String(error) };
    }
  }, [loadFFmpeg]);

  // Add detected event
  const addDetectedEvent = useCallback(async (eventData: {
    type: string;
    minute: number;
    second: number;
    description: string;
    confidence?: number;
    source?: string;
  }) => {
    const matchId = tempMatchIdRef.current || currentMatchId;
    const videoId = currentVideoIdRef.current;

    if (!matchId) {
      console.warn('⚠️ Cannot save detected event - no matchId. Event ignored.');
      return;
    }

    const eventId = crypto.randomUUID();
    const currentRecordingTime = recordingTimeRef.current;
    
    const newEvent: LiveEvent = {
      id: eventId,
      type: eventData.type,
      minute: eventData.minute,
      second: eventData.second,
      description: eventData.description,
      confidence: eventData.confidence,
      status: "pending",
      recordingTimestamp: currentRecordingTime,
    };

    const isDuplicate = detectedEvents.some(
      (e) =>
        e.type === newEvent.type &&
        Math.abs((e.recordingTimestamp || 0) - (newEvent.recordingTimestamp || 0)) < 30
    );

    if (!isDuplicate) {
      setDetectedEvents((prev) => [...prev, newEvent]);
      
      try {
        await apiClient.createEvent(matchId, {
          id: eventId,
          match_id: matchId,
          video_id: videoId || null,
          event_type: eventData.type,
          minute: eventData.minute,
          second: eventData.second,
          description: eventData.description,
          approval_status: "pending",
          is_highlight: ['goal', 'goal_home', 'goal_away', 'red_card', 'penalty'].includes(eventData.type),
          match_half: eventData.minute < 45 ? 'first' : 'second',
          metadata: {
            eventMs: currentRecordingTime * 1000,
            videoSecond: currentRecordingTime,
            source: eventData.source || 'live-detected',
            confidence: eventData.confidence
          }
        });
        console.log(`✅ Detected event saved at ${currentRecordingTime}s:`, eventData.type);
        
        if (videoChunksRef.current.length > 0) {
          saveVideoChunk();
        }
      } catch (error) {
        console.error("Error saving detected event to database:", error);
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
  }, [detectedEvents, matchInfo, toast, currentMatchId, saveVideoChunk]);

  // Keep ref synchronized
  useEffect(() => {
    addDetectedEventRef.current = addDetectedEvent;
  }, [addDetectedEvent]);

  // Approve event
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
          await apiClient.updateEvent(event.id, {
            approval_status: "approved",
            approved_at: new Date().toISOString(),
          });
          
          console.log("✅ Event approved and saved:", event.type);
          
          let chunkUrl: string | null = null;
          if (videoChunksRef.current.length > 0) {
            chunkUrl = await saveVideoChunk();
          }
          
          const videoUrl = chunkUrl || latestVideoChunkUrl;
          if (videoUrl) {
            console.log('Generating clip for approved event with URL:', videoUrl);
            
            const MAX_RETRIES = 3;
            const RETRY_DELAYS = [2000, 4000, 6000];
            let clipResult: ClipGenerationResult = { success: false };
            
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              console.log(`[ClipGen] Attempt ${attempt}/${MAX_RETRIES} for event ${event.id}`);
              clipResult = await generateClipForEvent(event, videoUrl);
              
              if (clipResult.success) {
                console.log(`✅ Clip generated successfully on attempt ${attempt}`);
                break;
              }
              
              if (attempt < MAX_RETRIES) {
                const delay = RETRY_DELAYS[attempt - 1];
                console.log(`⏳ Retry ${attempt} failed, waiting ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
            
            if (!clipResult.success) {
              console.warn(`❌ All ${MAX_RETRIES} attempts failed for event ${event.id}`);
              
              await apiClient.deleteEvent(event.id);
              setApprovedEvents((prev) => prev.filter((e) => e.id !== event.id));
              
              if (event.type === "goal") {
                const desc = event.description.toLowerCase();
                if (matchInfo.homeTeam && desc.includes(matchInfo.homeTeam.toLowerCase())) {
                  setCurrentScore((prev) => ({ ...prev, home: Math.max(0, prev.home - 1) }));
                } else if (matchInfo.awayTeam && desc.includes(matchInfo.awayTeam.toLowerCase())) {
                  setCurrentScore((prev) => ({ ...prev, away: Math.max(0, prev.away - 1) }));
                }
              }
              
              toast({
                title: "Evento removido",
                description: `Clip não gerado após ${MAX_RETRIES} tentativas`,
                variant: "destructive"
              });
              return;
            }
          } else {
            console.warn('❌ No video URL available for clip generation - deleting event');
            
            await apiClient.deleteEvent(event.id);
            setApprovedEvents((prev) => prev.filter((e) => e.id !== event.id));
            
            toast({
              title: "Evento removido",
              description: "Sem vídeo disponível para gerar clip",
              variant: "destructive"
            });
            return;
          }

          console.log('Triggering live analysis for approved event:', event.type);
          triggerLiveAnalysis(event);
        } catch (error) {
          console.error("Error approving event:", error);
        }
      }
    }
  }, [detectedEvents, matchInfo, latestVideoChunkUrl, generateClipForEvent, saveVideoChunk, triggerLiveAnalysis, currentMatchId, toast]);

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

  // Start recording
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

      if (existingMatchId) {
        matchId = existingMatchId;
        tempMatchIdRef.current = matchId;
        setCurrentMatchId(matchId);
        
        await apiClient.updateMatch(matchId, { status: "live" });
        
        const existingEvents = await apiClient.getMatchEvents(matchId);
        
        if (existingEvents?.length) {
          setApprovedEvents(existingEvents.map((e: any) => ({
            id: e.id,
            type: e.event_type,
            minute: e.minute || 0,
            second: e.second || 0,
            description: e.description || "",
            status: "approved" as const,
            recordingTimestamp: e.metadata?.videoSecond || (e.minute || 0) * 60 + (e.second || 0),
            clipUrl: e.clip_url || undefined
          })));
        }

        const matchData = await apiClient.getMatch(matchId);
        
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
        matchId = await createTempMatch();
        if (!matchId) {
          toast({
            title: "Erro ao iniciar",
            description: "Não foi possível criar a partida.",
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
      
      if (!existingMatchId) {
        setRecordingTime(0);
        recordingTimeRef.current = 0;
        setTranscriptBuffer("");
        setTranscriptChunks([]);
      }
      
      audioChunksRef.current = [];
      videoChunksRef.current = [];
      clipVideoChunksRef.current = [];
      allVideoChunksRef.current = [];

      // Create video record
      if (!existingMatchId) {
        try {
          const videoRecord = await apiClient.createVideo({
            match_id: matchId,
            file_url: '',
            file_name: 'Gravação em andamento',
            video_type: 'full',
            status: 'recording',
            start_minute: 0,
          });

          if (videoRecord) {
            setCurrentVideoId(videoRecord.id);
            currentVideoIdRef.current = videoRecord.id;
            console.log('[startRecording] ✅ Video record created:', videoRecord.id);
          }
        } catch (videoCreateError) {
          console.error('[startRecording] Failed to create video record:', videoCreateError);
        }
      } else {
        loadExistingEvents(matchId);
        
        try {
          const videos = await apiClient.getVideos(matchId);
          const existingVideo = videos?.[0];
          
          if (existingVideo) {
            setCurrentVideoId(existingVideo.id);
            currentVideoIdRef.current = existingVideo.id;
            console.log('[startRecording] Using existing video record:', existingVideo.id);
          } else {
            const videoRecord = await apiClient.createVideo({
              match_id: matchId,
              file_url: '',
              file_name: 'Gravação em andamento',
              video_type: 'full',
              status: 'recording',
              start_minute: 0,
            });

            if (videoRecord) {
              setCurrentVideoId(videoRecord.id);
              currentVideoIdRef.current = videoRecord.id;
            }
          }
        } catch (error) {
          console.error('[startRecording] Error handling video record:', error);
        }
      }

      // Start video recording
      if (videoElement) {
        console.log('[startRecording] Using videoElement for video recording');
        if (videoElement.readyState >= 2) {
          startVideoRecording(videoElement);
        } else {
          videoElement.addEventListener('loadeddata', () => {
            startVideoRecording(videoElement);
          }, { once: true });
        }
      } else if (cameraStream) {
        console.log('[startRecording] Using cameraStream directly');
        startVideoRecordingFromStream(cameraStream);
      } else {
        console.warn('[startRecording] No video source available');
      }

      transcriptionIntervalRef.current = setInterval(() => {
        processAudioChunk();
      }, 10000);
      
      setTimeout(() => {
        processAudioChunk();
      }, 5000);

      const hasVideoRecording = !!videoElement || !!cameraStream;
      toast({
        title: "Transmissão iniciada",
        description: hasVideoRecording 
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
  }, [cameraStream, toast, createTempMatch, startVideoRecording, startVideoRecordingFromStream, processAudioChunk, loadExistingEvents]);

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

  // Finish match
  const finishMatch = useCallback(async (): Promise<FinishMatchResult | null> => {
    setIsFinishing(true);
    
    const matchId = tempMatchIdRef.current;
    let videoUrl: string | null = null;
    let videoId: string | null = null;
    
    console.log('=== FINISH MATCH START ===');
    console.log('[finishMatch] matchId:', matchId);
    console.log('[finishMatch] allVideoChunks:', allVideoChunksRef.current.length);
    console.log('[finishMatch] approvedEvents:', approvedEvents.length);
    
    // Sync events from database
    let syncedEventsCount = approvedEvents.length;
    try {
      if (matchId) {
        const dbEvents = await apiClient.getMatchEvents(matchId);
        
        if (dbEvents) {
          syncedEventsCount = Math.max(approvedEvents.length, dbEvents.length);
          console.log(`[finishMatch] Events synced - state: ${approvedEvents.length}, db: ${dbEvents.length}`);
        }
      }
    } catch (syncError) {
      console.error('[finishMatch] Error syncing events:', syncError);
    }
    
    // STEP 1: Save video
    const existingVideoId = currentVideoIdRef.current;
    
    if (videoRecorderRef.current && videoRecorderRef.current.state === 'recording') {
      console.log('[finishMatch] Requesting final data from MediaRecorder...');
      videoRecorderRef.current.requestData();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    try {
      let chunksToUse = allVideoChunksRef.current.length > 0 
        ? [...allVideoChunksRef.current]
        : [...videoChunksRef.current];
      
      if (chunksToUse.length === 0 && clipVideoChunksRef.current.length > 0) {
        chunksToUse = clipVideoChunksRef.current.map(c => c.blob);
      }
      
      console.log(`[finishMatch] Using ${chunksToUse.length} video chunks`);
      
      if (matchId && chunksToUse.length > 0) {
        toast({ 
          title: "Salvando vídeo...", 
          description: `Aguarde o upload (${chunksToUse.length} segmentos)` 
        });
        
        const mimeType = videoRecorderRef.current?.mimeType || 'video/webm';
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const videoBlob = new Blob(chunksToUse, { type: mimeType });
        
        if (videoBlob.size < 1000) {
          throw new Error('Video data too small');
        }
        
        console.log(`[finishMatch] Saving video: ${(videoBlob.size / (1024 * 1024)).toFixed(2)} MB`);
        
        setIsUploadingVideo(true);
        setVideoUploadProgress(20);
        
        const result = await apiClient.uploadBlob(matchId, 'videos', videoBlob, `live-${Date.now()}.${extension}`);
        videoUrl = result.url;
        
        setVideoUploadProgress(70);
        
        // Update video record
        if (existingVideoId) {
          await apiClient.updateVideo(existingVideoId, {
            file_url: videoUrl,
            file_name: 'Transmissão ao vivo',
            end_minute: Math.ceil(recordingTime / 60),
            duration_seconds: recordingTime,
            status: 'complete'
          });
          videoId = existingVideoId;
        } else {
          const newVideo = await apiClient.createVideo({
            match_id: matchId,
            file_url: videoUrl,
            file_name: 'Transmissão ao vivo',
            video_type: 'full',
            start_minute: 0,
            end_minute: Math.ceil(recordingTime / 60),
            duration_seconds: recordingTime,
            status: 'complete'
          });
          videoId = newVideo?.id;
        }
        
        setVideoUploadProgress(100);
        console.log('[finishMatch] Video saved:', videoUrl);
      }
    } catch (videoError) {
      console.error('[finishMatch] Video upload error:', videoError);
    } finally {
      setIsUploadingVideo(false);
    }
    
    // STEP 2: Link events to video
    if (videoId && matchId) {
      try {
        const events = await apiClient.getMatchEvents(matchId);
        for (const event of events || []) {
          if (!event.video_id) {
            await apiClient.updateEvent(event.id, { video_id: videoId });
          }
        }
      } catch (error) {
        console.error('[finishMatch] Error linking events:', error);
      }
    }
    
    // Stop recording
    stopRecording();
    
    // STEP 3: Generate clips
    try {
      if (videoUrl && approvedEvents.length > 0) {
        const eventsWithoutClips = approvedEvents.filter(e => !e.clipUrl);
        
        if (eventsWithoutClips.length > 0) {
          toast({ 
            title: "Gerando clips...", 
            description: `Processando ${eventsWithoutClips.length} eventos` 
          });
          
          for (const event of eventsWithoutClips) {
            if (!isGeneratingClipRef.current) {
              try {
                await generateClipForEvent(event, videoUrl);
              } catch (clipError) {
                console.warn('[finishMatch] Failed to generate clip:', event.id, clipError);
              }
            }
          }
        }
      }
    } catch (clipsError) {
      console.error('[finishMatch] Error generating clips:', clipsError);
    }

    // STEP 4: Update match record
    try {
      if (matchId) {
        await apiClient.updateMatch(matchId, {
          home_team_id: matchInfo.homeTeamId || null,
          away_team_id: matchInfo.awayTeamId || null,
          home_score: currentScore.home,
          away_score: currentScore.away,
          competition: matchInfo.competition,
          status: "analyzed",
        });
        console.log('[finishMatch] Match record updated');
      }
    } catch (matchUpdateError) {
      console.error('[finishMatch] Error updating match:', matchUpdateError);
    }

    // STEP 5: Save transcript
    try {
      if (matchId) {
        await saveTranscriptToDatabase(matchId);
        console.log('[finishMatch] Transcript saved');
      }
    } catch (transcriptError) {
      console.error('[finishMatch] Error saving transcript:', transcriptError);
    }

    // STEP 6: Create analysis job record
    try {
      if (matchId) {
        await apiClient.createAnalysisJob({
          match_id: matchId,
          video_id: videoId,
          status: 'completed',
          progress: 100,
          current_step: 'Análise ao vivo concluída',
          completed_at: new Date().toISOString(),
          result: {
            eventsDetected: syncedEventsCount,
            eventsWithClips: approvedEvents.filter(e => e.clipUrl).length,
            videoUrl: videoUrl,
            source: 'live',
            duration: recordingTime,
            transcriptWords: transcriptBuffer.split(" ").length,
            summary: {
              goals: approvedEvents.filter(e => e.type.includes('goal')).length,
              cards: approvedEvents.filter(e => e.type.includes('card')).length,
              fouls: approvedEvents.filter(e => e.type === 'foul').length,
              totalEvents: syncedEventsCount,
            }
          }
        });
        console.log('[finishMatch] Analysis job created');
      }
    } catch (analysisError) {
      console.error('[finishMatch] Error creating analysis job:', analysisError);
    }

    // Prepare result
    const result: FinishMatchResult | null = matchId ? {
      matchId,
      videoUrl,
      eventsCount: syncedEventsCount,
      transcriptWords: transcriptBuffer.split(" ").length,
      duration: recordingTime,
    } : null;

    console.log('[finishMatch] Complete. Result:', result);

    setFinishResult(result);
    setIsFinishing(false);
    
    if (matchId) {
      toast({ 
        title: "Partida finalizada!", 
        description: `${syncedEventsCount} eventos salvos${videoUrl ? ' com vídeo' : ''}.` 
      });
    }
    
    return result;
  }, [stopRecording, currentScore, matchInfo, approvedEvents, transcriptBuffer, recordingTime, saveTranscriptToDatabase, toast, generateClipForEvent, isRecordingVideo]);

  // Reset finish result
  const resetFinishResult = useCallback(() => {
    setFinishResult(null);
    tempMatchIdRef.current = null;
    setCurrentMatchId(null);
    setCurrentVideoId(null);
    currentVideoIdRef.current = null;
    setDetectedEvents([]);
    setApprovedEvents([]);
    setCurrentScore({ home: 0, away: 0 });
    setTranscriptBuffer("");
    setTranscriptChunks([]);
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    setLatestVideoChunkUrl(null);
    clipVideoChunksRef.current = [];
    videoChunksRef.current = [];
    allVideoChunksRef.current = [];
  }, []);

  // Get clip chunks for time range
  const getClipChunksForTime = useCallback((startTime: number, endTime: number): VideoChunk[] => {
    console.log('[getClipChunksForTime] Searching chunks for range:', startTime, '-', endTime);
    
    if (clipVideoChunksRef.current.length === 0) {
      return [];
    }

    const matchingChunks = clipVideoChunksRef.current.filter(chunk => {
      const chunkStartTime = chunk.timestamp;
      const chunkEndTime = chunk.timestamp + 5;
      return chunkStartTime <= endTime && chunkEndTime >= startTime;
    });

    console.log('[getClipChunksForTime] Found', matchingChunks.length, 'matching chunks');
    return matchingChunks;
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
    getClipChunksForTime,
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
