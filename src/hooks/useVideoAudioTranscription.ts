import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseVideoAudioTranscriptionOptions {
  onTranscript?: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
  chunkDurationMs?: number; // How often to send audio chunks (default: 10 seconds)
}

export const useVideoAudioTranscription = (options: UseVideoAudioTranscriptionOptions = {}) => {
  const { onTranscript, onPartialTranscript, chunkDurationMs = 10000 } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [committedTranscripts, setCommittedTranscripts] = useState<Array<{ id: string; text: string; timestamp: Date }>>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);
  const hasAudioActivityRef = useRef(false);

  // Check if there's actual audio activity using analyser
  const checkAudioActivity = useCallback(() => {
    if (!analyserRef.current) return false;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    
    // Threshold for detecting actual audio (not just silence/noise)
    const hasActivity = average > 5;
    
    if (hasActivity) {
      hasAudioActivityRef.current = true;
    }
    
    return hasActivity;
  }, []);

  // Process and send audio chunk to Whisper
  const processAudioChunk = useCallback(async () => {
    if (isProcessingRef.current || chunksRef.current.length === 0) return;

    // Check if there was any audio activity in this period
    if (!hasAudioActivityRef.current) {
      console.log("No audio activity detected, skipping transcription");
      chunksRef.current = [];
      return;
    }

    isProcessingRef.current = true;
    hasAudioActivityRef.current = false; // Reset for next period
    setPartialTranscript("Transcrevendo...");
    onPartialTranscript?.("Transcrevendo...");

    try {
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm;codecs=opus" });
      chunksRef.current = []; // Clear chunks after collecting

      // Skip if too small (less than 5KB - more conservative threshold)
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
      let binary = "";
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64Audio = btoa(binary);

      console.log("Sending audio chunk to Whisper:", audioBlob.size, "bytes");

      const { data, error: fnError } = await supabase.functions.invoke("transcribe-audio", {
        body: { audio: base64Audio },
      });

      if (fnError) {
        console.error("Transcription error:", fnError);
        setError(fnError.message);
        return;
      }

      if (data?.success && data?.text?.trim()) {
        const transcriptText = data.text.trim();
        
        // Filter out Whisper hallucinations - common patterns when audio is empty/low quality
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
  }, [onTranscript, onPartialTranscript]);

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
      // Note: This can only be done once per video element
      let source: MediaElementAudioSourceNode;
      try {
        source = audioContext.createMediaElementSource(videoElement);
        sourceNodeRef.current = source;
      } catch (err) {
        // If source already exists, we might need to reuse existing context
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

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(destination.stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          // Check audio activity when receiving data
          checkAudioActivity();
        }
      };

      // Start recording with time slices
      mediaRecorder.start(1000); // Collect data every second

      // Set up interval to process chunks
      intervalRef.current = setInterval(() => {
        processAudioChunk();
      }, chunkDurationMs);

      // Unmute video so audio plays
      videoElement.muted = false;
      videoElement.volume = 1;

      setIsConnected(true);
      console.log("Video audio transcription connected successfully");
    } catch (err) {
      console.error("Error connecting to video audio:", err);
      setError(err instanceof Error ? err.message : "Erro ao conectar ao áudio do vídeo");
    } finally {
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting, chunkDurationMs, processAudioChunk, checkAudioActivity]);

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Don't close the audio context as it may be reused
    // Just disconnect nodes
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
    chunksRef.current = [];
    hasAudioActivityRef.current = false;

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

  return {
    isConnected,
    isConnecting,
    partialTranscript,
    committedTranscripts,
    error,
    connect,
    disconnect,
  };
};
