import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PlayerPosition {
  id: string;
  x: number;
  y: number;
  team: 'home' | 'away' | 'unknown';
  confidence: number;
}

interface BallPosition {
  x: number;
  y: number;
  confidence: number;
}

interface DetectionResult {
  players: PlayerPosition[];
  ball: BallPosition | null;
  referee: PlayerPosition | null;
  frameTimestamp: number;
  processingTimeMs: number;
  warning?: string;
}

interface UsePlayerDetectionOptions {
  onDetection?: (result: DetectionResult) => void;
  modelId?: string;
  confidence?: number;
}

export function usePlayerDetection(options: UsePlayerDetectionOptions = {}) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detectFromImage = useCallback(async (
    imageBase64: string,
    frameTimestamp: number = 0
  ): Promise<DetectionResult | null> => {
    setIsDetecting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('detect-players', {
        body: {
          imageBase64,
          frameTimestamp,
          modelId: options.modelId,
          confidence: options.confidence || 0.4,
        },
      });

      if (fnError) throw fnError;

      const result = data as DetectionResult;
      setLastResult(result);
      
      if (result.warning) {
        console.warn('Detection warning:', result.warning);
      }

      options.onDetection?.(result);
      return result;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detection failed';
      setError(message);
      toast.error('Erro na detecção', { description: message });
      return null;
    } finally {
      setIsDetecting(false);
    }
  }, [options]);

  const detectFromUrl = useCallback(async (
    imageUrl: string,
    frameTimestamp: number = 0
  ): Promise<DetectionResult | null> => {
    setIsDetecting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('detect-players', {
        body: {
          imageUrl,
          frameTimestamp,
          modelId: options.modelId,
          confidence: options.confidence || 0.4,
        },
      });

      if (fnError) throw fnError;

      const result = data as DetectionResult;
      setLastResult(result);
      
      if (result.warning) {
        console.warn('Detection warning:', result.warning);
      }

      options.onDetection?.(result);
      return result;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detection failed';
      setError(message);
      toast.error('Erro na detecção', { description: message });
      return null;
    } finally {
      setIsDetecting(false);
    }
  }, [options]);

  // Extract frame from video element and detect
  const detectFromVideoElement = useCallback(async (
    videoElement: HTMLVideoElement
  ): Promise<DetectionResult | null> => {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 1280;
    canvas.height = videoElement.videoHeight || 720;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Canvas context not available');
      return null;
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    // Get base64 without the data URL prefix
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    
    return detectFromImage(base64, videoElement.currentTime);
  }, [detectFromImage]);

  return {
    detectFromImage,
    detectFromUrl,
    detectFromVideoElement,
    isDetecting,
    lastResult,
    error,
  };
}
