import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseVideoAudioTranscriptionOptions {
  onTranscript?: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
  chunkDurationMs?: number;
  language?: string; // ISO language code: 'pt', 'es', 'en'
}

export const useVideoAudioTranscription = (options: UseVideoAudioTranscriptionOptions = {}) => {
  const { onTranscript, onPartialTranscript, chunkDurationMs = 10000, language = "pt" } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [committedTranscripts, setCommittedTranscripts] = useState<Array<{ id: string; text: string; timestamp: Date }>>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);
  const isRecordingRef = useRef(false);

  // Check if there's actual audio activity using analyser
  const checkAudioActivity = useCallback(() => {
    if (!analyserRef.current) return false;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    
    // Threshold for detecting actual audio (not just silence/noise)
    return average > 5;
  }, []);

  // Record a complete audio segment and transcribe it
  const recordAndTranscribe = useCallback(async () => {
    if (isProcessingRef.current || !streamRef.current || !isRecordingRef.current) return;

    // Check audio activity first
    if (!checkAudioActivity()) {
      console.log("No audio activity detected, skipping transcription");
      return;
    }

    isProcessingRef.current = true;
    setPartialTranscript("Gravando...");
    onPartialTranscript?.("Gravando...");

    try {
      // Create a new MediaRecorder for each segment to get complete WebM files
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      const chunks: Blob[] = [];

      const recordingPromise = new Promise<Blob>((resolve) => {
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });
          resolve(blob);
        };
      });

      // Start recording
      mediaRecorder.start();

      // Record for the chunk duration (minus some buffer time)
      const recordDuration = Math.min(chunkDurationMs - 500, 9500);
      
      await new Promise(resolve => setTimeout(resolve, recordDuration));

      // Stop recording
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }

      setPartialTranscript("Transcrevendo...");
      onPartialTranscript?.("Transcrevendo...");

      const audioBlob = await recordingPromise;

      // Skip if too small
      if (audioBlob.size < 5000) {
        console.log("Audio chunk too small, skipping:", audioBlob.size);
        setPartialTranscript("");
        onPartialTranscript?.("");
        isProcessingRef.current = false;
        return;
      }

      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Log first bytes to verify WebM header
      const headerBytes = Array.from(uint8Array.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log("Audio header bytes:", headerBytes);
      
      let binary = "";
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64Audio = btoa(binary);

      console.log("Sending audio chunk to Whisper:", audioBlob.size, "bytes, language:", language);

      const { data, error: fnError } = await supabase.functions.invoke("transcribe-audio", {
        body: { audio: base64Audio, language },
      });

      if (fnError) {
        console.error("Transcription error:", fnError);
        setError(fnError.message);
        return;
      }

      if (data?.success && data?.text?.trim()) {
        const transcriptText = data.text.trim();
        
        // Filter out Whisper hallucinations
        const hallucinations = [
          "Legendas by",
          "Legendado por",
          "Tradução e Legendas",
          "Obrigado por assistir",
          "Inscreva-se",
          "Pílulas do Evangelho",
          "Transcrição ou",
          "Colabore conosco",
          "nosso grupo no Facebook",
          "Seja você também",
          "voluntário nesta causa",
          "www.",
          ".com",
          ".br",
        ];
        
        const isHallucination = hallucinations.some(h => 
          transcriptText.toLowerCase().includes(h.toLowerCase())
        );
        
        if (isHallucination) {
          console.log("Filtered hallucination:", transcriptText.substring(0, 50));
          return;
        }

        console.log("Video audio transcription:", transcriptText);

        const newTranscript = {
          id: crypto.randomUUID(),
          text: transcriptText,
          timestamp: new Date(),
        };

        setCommittedTranscripts((prev) => [...prev, newTranscript]);
        onTranscript?.(transcriptText);
      }
    } catch (err) {
      console.error("Error processing audio chunk:", err);
      setError(err instanceof Error ? err.message : "Erro ao processar áudio");
    } finally {
      isProcessingRef.current = false;
      setPartialTranscript("");
      onPartialTranscript?.("");
    }
  }, [onTranscript, onPartialTranscript, language, chunkDurationMs, checkAudioActivity]);

  // Connect to video element and start capturing audio
  const connect = useCallback(async (videoElement: HTMLVideoElement) => {
    if (isConnected || isConnecting) return;

    setIsConnecting(true);
    setError(null);

    try {
      // Check if video has audio
      if (videoElement.muted) {
        console.log("Video is muted, unmuting for transcription");
      }

      // Create audio context
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Create media element source from video
      let source: MediaElementAudioSourceNode;
      try {
        source = audioContext.createMediaElementSource(videoElement);
        sourceNodeRef.current = source;
      } catch (err) {
        console.error("Error creating media element source:", err);
        setError("Erro ao conectar ao áudio do vídeo. Tente recarregar a página.");
        setIsConnecting(false);
        return;
      }

      // Create analyser for volume detection
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // Create a destination to capture the audio
      const destination = audioContext.createMediaStreamDestination();
      
      // Connect source -> analyser -> destination (for recording)
      // Also connect source -> output (so user can hear)
      source.connect(analyser);
      analyser.connect(destination);
      source.connect(audioContext.destination);

      streamRef.current = destination.stream;

      // Unmute video so audio plays
      videoElement.muted = false;
      videoElement.volume = 1;

      isRecordingRef.current = true;
      setIsConnected(true);
      
      // Start the recording/transcription cycle
      // Small delay to let audio context initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Set up interval to record and transcribe
      intervalRef.current = setInterval(() => {
        if (isRecordingRef.current && !isProcessingRef.current) {
          recordAndTranscribe();
        }
      }, chunkDurationMs);

      // Start first transcription after a short delay
      setTimeout(() => {
        if (isRecordingRef.current) {
          recordAndTranscribe();
        }
      }, 1000);

      console.log("Video audio transcription connected successfully");
    } catch (err) {
      console.error("Error connecting to video audio:", err);
      setError(err instanceof Error ? err.message : "Erro ao conectar ao áudio do vídeo");
    } finally {
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting, chunkDurationMs, recordAndTranscribe]);

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    isRecordingRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Disconnect nodes
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Ignore if already disconnected
      }
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    sourceNodeRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;

    setIsConnected(false);
    setPartialTranscript("");
    console.log("Video audio transcription disconnected");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Expose analyser for volume visualization
  const getAnalyser = useCallback(() => analyserRef.current, []);

  return {
    isConnected,
    isConnecting,
    partialTranscript,
    committedTranscripts,
    error,
    connect,
    disconnect,
    getAnalyser,
  };
};
