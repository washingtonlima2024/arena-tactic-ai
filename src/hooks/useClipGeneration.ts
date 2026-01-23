// Clip generation hook - delegates to backend Python server
// All video processing is done server-side using native FFmpeg

import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';

// ═══════════════════════════════════════════════════════════════════════════════
// CLIP TIMING CONSTANTS - Synchronized with video-processor/server.py
// ═══════════════════════════════════════════════════════════════════════════════
export const CLIP_BUFFER_BEFORE_MS = 15000; // 15 seconds before event
export const CLIP_BUFFER_AFTER_MS = 15000;  // 15 seconds after event

// Standardized 30-second clips for all event types
export const EVENT_CLIP_TIMINGS: Record<string, { before: number; after: number }> = {
  goal: { before: 15000, after: 15000 },
  penalty: { before: 15000, after: 15000 },
  red_card: { before: 15000, after: 15000 },
  shot_on_target: { before: 15000, after: 15000 },
  shot: { before: 15000, after: 15000 },
  save: { before: 15000, after: 15000 },
  yellow_card: { before: 15000, after: 15000 },
  corner: { before: 15000, after: 15000 },
  free_kick: { before: 15000, after: 15000 },
  foul: { before: 15000, after: 15000 },
  offside: { before: 15000, after: 15000 },
  substitution: { before: 15000, after: 15000 },
  default: { before: 15000, after: 15000 }
};

export function getEventTimings(eventType: string): { before: number; after: number } {
  return EVENT_CLIP_TIMINGS[eventType] || EVENT_CLIP_TIMINGS.default;
}

export interface ClipConfig {
  eventId: string;
  eventMs: number;
  videoUrl: string;
  matchId: string;
  bufferBeforeMs?: number;
  bufferAfterMs?: number;
  eventType?: string;
  eventMinute?: number;
  eventDescription?: string;
}

export interface ClipPlaybackInfo {
  eventId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
}

export interface ClipGenerationProgress {
  stage: 'idle' | 'loading' | 'downloading' | 'extracting' | 'uploading' | 'thumbnail' | 'complete' | 'error';
  progress: number;
  message: string;
  currentEvent?: string;
  completedCount?: number;
  totalCount?: number;
  thumbnailsGenerated?: number;
}

export function toMs(minute: number, second: number = 0): number {
  return (minute * 60 + second) * 1000;
}

export function useClipGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ClipGenerationProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const [generatingEventIds, setGeneratingEventIds] = useState<Set<string>>(new Set());
  
  const cancelRef = useRef(false);

  // Calculate playback timestamps for a clip (without extraction)
  const getClipPlaybackInfo = useCallback((config: ClipConfig): ClipPlaybackInfo => {
    const eventTimings = getEventTimings(config.eventType || 'default');
    const bufferBefore = config.bufferBeforeMs ?? eventTimings.before;
    const bufferAfter = config.bufferAfterMs ?? eventTimings.after;
    
    const eventSeconds = config.eventMs / 1000;
    const startTimeSeconds = Math.max(0, eventSeconds - (bufferBefore / 1000));
    const endTimeSeconds = eventSeconds + (bufferAfter / 1000);
    const durationSeconds = endTimeSeconds - startTimeSeconds;
    
    return {
      eventId: config.eventId,
      startTimeSeconds,
      endTimeSeconds,
      durationSeconds
    };
  }, []);

  // Generate a single clip via backend
  const generateClip = useCallback(async (config: ClipConfig): Promise<string | null> => {
    if (cancelRef.current) return null;
    
    setGeneratingEventIds(prev => new Set([...prev, config.eventId]));
    
    try {
      setProgress({
        stage: 'extracting',
        progress: 30,
        message: 'Gerando clip via servidor...',
        currentEvent: config.eventId
      });

      // Call backend to regenerate clip for this event
      const result = await apiClient.regenerateClips(config.matchId, { eventIds: [config.eventId] });
      
      if (result.regenerated > 0) {
        setProgress({
          stage: 'complete',
          progress: 100,
          message: 'Clip gerado com sucesso!'
        });
        
        // Fetch updated event to get clip URL
        const events = await apiClient.getMatchEvents(config.matchId);
        const event = events.find((e: any) => e.id === config.eventId);
        return event?.clip_url || null;
      }
      
      return null;
    } catch (error) {
      console.error('[ClipGeneration] Error:', error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erro ao gerar clip'
      });
      return null;
    } finally {
      setGeneratingEventIds(prev => {
        const next = new Set(prev);
        next.delete(config.eventId);
        return next;
      });
    }
  }, []);

  // Generate clips for multiple events via backend
  const generateAllClips = useCallback(async (
    events: Array<{
      id: string;
      event_type: string;
      minute?: number | null;
      second?: number | null;
      metadata?: any;
    }>,
    videoUrl: string,
    matchId: string,
    options?: {
      limit?: number;
      videoStartMinute?: number;
      videoDurationSeconds?: number;
    }
  ): Promise<{ success: number; failed: number; thumbnails: number }> => {
    if (events.length === 0) {
      return { success: 0, failed: 0, thumbnails: 0 };
    }

    cancelRef.current = false;
    setIsGenerating(true);
    
    const eventIds = events.slice(0, options?.limit || 20).map(e => e.id);
    
    setProgress({
      stage: 'extracting',
      progress: 10,
      message: `Gerando ${eventIds.length} clips via servidor...`,
      totalCount: eventIds.length,
      completedCount: 0
    });

    try {
      const result = await apiClient.regenerateClips(matchId, { eventIds });
      
      setProgress({
        stage: 'complete',
        progress: 100,
        message: `${result.regenerated || 0} clips gerados!`,
        completedCount: result.regenerated || 0,
        totalCount: eventIds.length
      });
      
      return {
        success: result.regenerated || 0,
        failed: result.failed || 0,
        thumbnails: result.regenerated || 0
      };
    } catch (error) {
      console.error('[ClipGeneration] Batch error:', error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Erro ao gerar clips'
      });
      return { success: 0, failed: eventIds.length, thumbnails: 0 };
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setIsGenerating(false);
    setProgress({ stage: 'idle', progress: 0, message: 'Cancelado' });
  }, []);

  const reset = useCallback(() => {
    setProgress({ stage: 'idle', progress: 0, message: '' });
    setGeneratingEventIds(new Set());
  }, []);

  const isEventGenerating = useCallback((eventId: string): boolean => {
    return generatingEventIds.has(eventId);
  }, [generatingEventIds]);

  // Alias for backward compatibility
  const isGeneratingEvent = isEventGenerating;

  return {
    generateClip,
    generateAllClips,
    getClipPlaybackInfo,
    isGenerating,
    progress,
    cancel,
    reset,
    isEventGenerating,
    isGeneratingEvent
  };
}
