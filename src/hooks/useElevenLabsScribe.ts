import { useCallback, useRef, useState } from 'react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ScribeTranscript {
  id: string;
  text: string;
  timestamp: Date;
}

interface UseElevenLabsScribeOptions {
  onTranscript?: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
}

export const useElevenLabsScribe = (options: UseElevenLabsScribeOptions = {}) => {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const partialRef = useRef<string>('');

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD, // Automatic speech segmentation based on silence
    languageCode: 'pt', // Portuguese
    onPartialTranscript: (data) => {
      console.log('Partial transcript:', data.text);
      partialRef.current = data.text;
      options.onPartialTranscript?.(data.text);
    },
    onCommittedTranscript: (data) => {
      console.log('Committed transcript:', data.text);
      partialRef.current = '';
      options.onTranscript?.(data.text);
    },
    onCommittedTranscriptWithTimestamps: (data) => {
      console.log('Committed with timestamps:', data.text, data.words);
    },
    onError: (error) => {
      console.error('Scribe error:', error);
      setError(error instanceof Error ? error.message : 'Transcription error');
    },
  });

  const connect = useCallback(async () => {
    if (scribe.isConnected) {
      console.log('Already connected to Scribe');
      return true;
    }

    setIsConnecting(true);
    setError(null);

    try {
      console.log('Requesting ElevenLabs Scribe token...');
      
      const { data, error: tokenError } = await supabase.functions.invoke(
        'elevenlabs-scribe-token'
      );

      if (tokenError || !data?.token) {
        throw new Error(tokenError?.message || 'Failed to get scribe token');
      }

      console.log('Token received, connecting to Scribe...');

      await scribe.connect({
        token: data.token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log('Connected to ElevenLabs Scribe');
      
      toast({
        title: "Transcrição conectada",
        description: "ElevenLabs Scribe ativo em tempo real",
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      console.error('Scribe connection error:', err);
      setError(message);
      
      toast({
        title: "Erro na transcrição",
        description: message,
        variant: "destructive",
      });
      
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [scribe, toast]);

  const disconnect = useCallback(() => {
    if (scribe.isConnected) {
      scribe.disconnect();
      partialRef.current = '';
      console.log('Disconnected from Scribe');
    }
  }, [scribe]);

  return {
    isConnected: scribe.isConnected,
    isConnecting,
    partialTranscript: scribe.partialTranscript || '',
    committedTranscripts: scribe.committedTranscripts,
    error,
    connect,
    disconnect,
  };
};
