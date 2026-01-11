import { useCallback, useRef, useState, useEffect } from 'react';
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
  onConnectionChange?: (connected: boolean) => void;
  onConnectionError?: (error: string) => void;
  maxRetries?: number;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

export const useElevenLabsScribe = (options: UseElevenLabsScribeOptions = {}) => {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'>('idle');
  const partialRef = useRef<string>('');
  const isReconnectingRef = useRef(false);
  const shouldBeConnectedRef = useRef(false);

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    languageCode: 'pt',
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
    onError: (wsError) => {
      console.error('Scribe WebSocket error:', wsError);
      const errorMsg = wsError instanceof Error ? wsError.message : 'WebSocket error';
      setError(errorMsg);
      options.onConnectionError?.(errorMsg);
      
      // Try to reconnect if we should be connected
      if (shouldBeConnectedRef.current && !isReconnectingRef.current) {
        handleReconnect();
      }
    },
  });

  const handleReconnect = useCallback(async () => {
    if (isReconnectingRef.current || retryCount >= MAX_RETRY_ATTEMPTS) {
      if (retryCount >= MAX_RETRY_ATTEMPTS) {
        console.error('Max retry attempts reached');
        setConnectionStatus('failed');
        setError('Falha na conexão após múltiplas tentativas');
        options.onConnectionError?.('Falha na conexão após múltiplas tentativas');
      }
      return;
    }

    isReconnectingRef.current = true;
    setConnectionStatus('reconnecting');
    const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
    
    console.log(`Reconnecting in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      await connectInternal();
      setRetryCount(0);
      isReconnectingRef.current = false;
    } catch (err) {
      setRetryCount(prev => prev + 1);
      isReconnectingRef.current = false;
      
      // Try again if under limit
      if (retryCount + 1 < MAX_RETRY_ATTEMPTS) {
        handleReconnect();
      }
    }
  }, [retryCount]);

  const connectInternal = useCallback(async () => {
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

    // Wait a bit to ensure WebSocket is fully established
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (!scribe.isConnected) {
      throw new Error('WebSocket connection not established');
    }

    console.log('Connected to ElevenLabs Scribe');
    setConnectionStatus('connected');
    options.onConnectionChange?.(true);
  }, [scribe, options]);

  const connect = useCallback(async () => {
    if (scribe.isConnected) {
      console.log('Already connected to Scribe');
      return true;
    }

    if (isConnecting) {
      console.log('Connection already in progress');
      return false;
    }

    setIsConnecting(true);
    setConnectionStatus('connecting');
    setError(null);
    setRetryCount(0);
    shouldBeConnectedRef.current = true;

    try {
      await connectInternal();
      
      toast({
        title: "Transcrição conectada",
        description: "ElevenLabs Scribe ativo em tempo real",
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      console.error('Scribe connection error:', err);
      setError(message);
      setConnectionStatus('failed');
      
      toast({
        title: "Erro na transcrição",
        description: message,
        variant: "destructive",
      });
      
      // Start retry process
      handleReconnect();
      
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [scribe, toast, connectInternal, handleReconnect, isConnecting]);

  const disconnect = useCallback(() => {
    shouldBeConnectedRef.current = false;
    isReconnectingRef.current = false;
    setRetryCount(0);
    setConnectionStatus('idle');
    
    if (scribe.isConnected) {
      scribe.disconnect();
      partialRef.current = '';
      console.log('Disconnected from Scribe');
      options.onConnectionChange?.(false);
    }
  }, [scribe, options]);

  // Monitor connection state
  useEffect(() => {
    if (scribe.isConnected) {
      setConnectionStatus('connected');
      setError(null);
    }
  }, [scribe.isConnected]);

  return {
    isConnected: scribe.isConnected,
    isConnecting,
    connectionStatus,
    partialTranscript: scribe.partialTranscript || '',
    committedTranscripts: scribe.committedTranscripts,
    error,
    retryCount,
    connect,
    disconnect,
  };
};
