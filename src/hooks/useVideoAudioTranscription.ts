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
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  // Process and send audio chunk to Whisper
  const processAudioChunk = useCallback(async () => {
    if (isProcessingRef.current || chunksRef.current.length === 0) return;

    isProcessingRef.current = true;
    setPartialTranscript("Transcrevendo...");
    onPartialTranscript?.("Transcrevendo...");

    try {
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm;codecs=opus" });
      chunksRef.current = []; // Clear chunks after collecting

      // Skip if too small (less than 1KB)
      if (audioBlob.size < 1000) {
        console.log("Audio chunk too small, skipping:", audioBlob.size);
        setPartialTranscript("");
        onPartialTranscript?.("");
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
      // Create audio context
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Create media element source from video
      const source = audioContext.createMediaElementSource(videoElement);

      // Create a destination to capture the audio
      const destination = audioContext.createMediaStreamDestination();
      
      // Connect source to both destination (for recording) and speakers (so user can hear)
      source.connect(destination);
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

      setIsConnected(true);
      console.log("Video audio transcription connected");
    } catch (err) {
      console.error("Error connecting to video audio:", err);
      setError(err instanceof Error ? err.message : "Erro ao conectar ao áudio do vídeo");
    } finally {
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting, chunkDurationMs, processAudioChunk]);

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

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;

    streamRef.current = null;
    chunksRef.current = [];

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
