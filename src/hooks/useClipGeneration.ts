// Simplified clip generation - uses timestamp-based playback instead of FFmpeg extraction
// No heavy dependencies, instant playback from original video

import { useState, useCallback } from 'react';

// Timing constants in milliseconds
export const CLIP_BUFFER_BEFORE_MS = 3000; // 3 seconds before event
export const CLIP_BUFFER_AFTER_MS = 5000;  // 5 seconds after event

export interface ClipConfig {
  eventId: string;
  eventMs: number; // Event time in milliseconds
  videoUrl: string;
  bufferBeforeMs?: number;
  bufferAfterMs?: number;
}

export interface ClipPlaybackInfo {
  eventId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
}

export interface ClipGenerationProgress {
  stage: 'idle' | 'complete';
  progress: number;
  message: string;
}

// Helper: Convert minute + second to milliseconds
export function toMs(minute: number, second: number = 0): number {
  return (minute * 60 + second) * 1000;
}

// Helper: Convert minutes to milliseconds
export function minutesToMs(minutes: number): number {
  return minutes * 60 * 1000;
}

// Helper: Convert seconds to milliseconds
export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

export function useClipGeneration() {
  const [isGenerating] = useState(false);
  const [progress] = useState<ClipGenerationProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });

  // Calculate playback timestamps for a clip (no extraction needed)
  const getClipPlaybackInfo = useCallback((config: ClipConfig): ClipPlaybackInfo => {
    const bufferBefore = config.bufferBeforeMs ?? CLIP_BUFFER_BEFORE_MS;
    const bufferAfter = config.bufferAfterMs ?? CLIP_BUFFER_AFTER_MS;
    
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

  // For compatibility - these do nothing now (timestamp playback replaces extraction)
  const generateClip = useCallback(async () => null, []);
  const generateAllClips = useCallback(async () => {}, []);
  const cancel = useCallback(() => {}, []);
  const reset = useCallback(() => {}, []);
  const isGeneratingEvent = useCallback(() => false, []);

  return {
    isGenerating,
    progress,
    getClipPlaybackInfo,
    generateClip,
    generateAllClips,
    cancel,
    isGeneratingEvent,
    reset,
    isCancelled: false,
    // Legacy compatibility
    isLoaded: true,
    generatingEventIds: new Set<string>(),
    generateAllClipsOptimized: generateAllClips
  };
}
