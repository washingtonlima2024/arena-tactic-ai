// Hook for reactive clip synchronization with events
// Delegates all video processing to the backend Python server

import { useCallback, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';
import { CLIP_BUFFER_BEFORE_MS, CLIP_BUFFER_AFTER_MS, toMs } from './useClipGeneration';

export interface MatchEvent {
  id: string;
  match_id: string;
  event_type: string;
  minute: number | null;
  second: number | null;
  description: string | null;
  clip_url: string | null;
  clip_pending: boolean | null;
  video_id: string | null;
  match_half: string | null;
  metadata?: Record<string, unknown>;
}

export interface VideoInfo {
  id: string;
  file_url: string;
  video_type: string | null;
  start_minute: number | null;
  duration_seconds: number | null;
}

export interface ClipSyncStatus {
  eventId: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  message: string;
}

// Check if event needs clip regeneration based on changes
export function needsClipRegeneration(
  oldEvent: MatchEvent | null,
  newEvent: MatchEvent
): boolean {
  if (oldEvent?.clip_pending === true && newEvent.clip_pending === false) {
    return false;
  }
  if (!oldEvent && !newEvent.clip_url) return true;
  if (newEvent.clip_pending === true) return true;
  if (oldEvent?.minute !== newEvent.minute) return true;
  if (oldEvent?.second !== newEvent.second) return true;
  if (oldEvent?.event_type !== newEvent.event_type) return true;
  if (oldEvent?.description !== newEvent.description) return true;
  return false;
}

// Find video for event based on half/minute
export function findVideoForEvent(
  event: MatchEvent,
  videos: VideoInfo[]
): VideoInfo | null {
  if (!videos || videos.length === 0) return null;
  
  const eventHalf = event.match_half || 
    ((event.minute || 0) < 45 ? 'first' : 'second');
  
  const halfType = eventHalf === 'first' ? 'first_half' : 'second_half';
  const halfVideo = videos.find(v => v.video_type === halfType);
  if (halfVideo) return halfVideo;
  
  const fullVideo = videos.find(v => v.video_type === 'full');
  if (fullVideo) return fullVideo;
  
  return videos[0] || null;
}

export function useEventClipSync() {
  const processingRef = useRef<Set<string>>(new Set());

  // Generate clip for a single event via backend
  const generateEventClip = useCallback(async (
    event: MatchEvent,
    video: VideoInfo,
    onProgress?: (status: ClipSyncStatus) => void
  ): Promise<string | null> => {
    if (processingRef.current.has(event.id)) {
      console.log('[EventClipSync] Event already being processed:', event.id);
      return null;
    }

    processingRef.current.add(event.id);
    
    const updateProgress = (progress: number, message: string, status: ClipSyncStatus['status'] = 'processing') => {
      onProgress?.({
        eventId: event.id,
        status,
        progress,
        message
      });
    };

    try {
      updateProgress(10, 'Enviando para processamento no servidor...');
      
      // Call backend to regenerate clip
      const result = await apiClient.regenerateClips(event.match_id, { eventIds: [event.id] });
      
      if (result.regenerated > 0) {
        updateProgress(100, 'Clip gerado com sucesso!', 'done');
        
        // Fetch updated event to get clip URL
        const events = await apiClient.getMatchEvents(event.match_id);
        const updatedEvent = events.find((e: any) => e.id === event.id);
        return updatedEvent?.clip_url || null;
      }
      
      updateProgress(0, 'Falha ao gerar clip', 'error');
      return null;
      
    } catch (error) {
      console.error('[EventClipSync] Error generating clip:', error);
      updateProgress(0, error instanceof Error ? error.message : 'Erro desconhecido', 'error');
      return null;
    } finally {
      processingRef.current.delete(event.id);
    }
  }, []);

  const isProcessing = useCallback((eventId: string): boolean => {
    return processingRef.current.has(eventId);
  }, []);

  return {
    generateEventClip,
    isProcessing,
    needsClipRegeneration,
    findVideoForEvent
  };
}
