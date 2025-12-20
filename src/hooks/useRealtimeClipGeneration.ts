/**
 * Real-time Clip Generation Hook
 * 
 * Generates video clips immediately when events are detected during live broadcast.
 * Uses the video segment buffer to extract clips without waiting for match to finish.
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoSegmentBuffer, calculateClipWindow } from '@/utils/videoSegmentBuffer';
import { useToast } from '@/hooks/use-toast';

export interface ClipGenerationEvent {
  id: string;
  type: string;
  minute: number;
  second: number;
  description: string;
  recordingTimestamp: number; // Recording time in seconds when event occurred
}

export interface ClipGenerationResult {
  eventId: string;
  clipUrl: string | null;
  error?: string;
}

interface UseRealtimeClipGenerationProps {
  matchId: string | null;
  segmentBuffer: VideoSegmentBuffer | null;
}

export function useRealtimeClipGeneration({ matchId, segmentBuffer }: UseRealtimeClipGenerationProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationQueue, setGenerationQueue] = useState<string[]>([]);
  
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const isLoadingFFmpeg = useRef(false);

  /**
   * Load FFmpeg WASM
   */
  const loadFFmpeg = useCallback(async (): Promise<FFmpeg> => {
    if (ffmpegRef.current?.loaded) {
      return ffmpegRef.current;
    }

    if (isLoadingFFmpeg.current) {
      // Wait for existing load
      while (isLoadingFFmpeg.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (ffmpegRef.current?.loaded) {
        return ffmpegRef.current;
      }
    }

    isLoadingFFmpeg.current = true;

    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      console.log('[RealtimeClip] FFmpeg loaded successfully');
      return ffmpeg;
    } finally {
      isLoadingFFmpeg.current = false;
    }
  }, []);

  /**
   * Generate clip for a specific event using current video buffer
   */
  const generateClipForEvent = useCallback(async (
    event: ClipGenerationEvent
  ): Promise<ClipGenerationResult> => {
    if (!matchId) {
      return { eventId: event.id, clipUrl: null, error: 'No match ID' };
    }

    if (!segmentBuffer) {
      return { eventId: event.id, clipUrl: null, error: 'No segment buffer' };
    }

    console.log(`[RealtimeClip] Generating clip for event ${event.id} at ${event.recordingTimestamp}s`);
    
    setGenerationQueue(prev => [...prev, event.id]);
    setIsGenerating(true);

    try {
      // Calculate clip window (5s before, 5s after event)
      const { start, end, duration } = calculateClipWindow(
        event.recordingTimestamp,
        5, // 5 seconds before
        5  // 5 seconds after
      );

      console.log(`[RealtimeClip] Clip window: ${start}s - ${end}s (${duration}s)`);

      // Get video blob from segment buffer
      const videoBlob = segmentBuffer.getBlobForTimeRange(start, end);
      
      if (!videoBlob || videoBlob.size < 1000) {
        console.warn('[RealtimeClip] No valid video data for time range');
        return { eventId: event.id, clipUrl: null, error: 'No video data available' };
      }

      console.log(`[RealtimeClip] Video blob size: ${(videoBlob.size / 1024).toFixed(1)}KB`);

      // Load FFmpeg
      const ffmpeg = await loadFFmpeg();

      // Get segment start time to calculate relative offset
      const segment = segmentBuffer.getSegmentForTime(event.recordingTimestamp);
      const segmentStartTime = segment?.startTime || 0;
      const relativeStart = Math.max(0, start - segmentStartTime);

      // Write video to FFmpeg
      const videoData = new Uint8Array(await videoBlob.arrayBuffer());
      await ffmpeg.writeFile('input.webm', videoData);

      // Convert time to FFmpeg timestamp format
      const hours = Math.floor(relativeStart / 3600);
      const minutes = Math.floor((relativeStart % 3600) / 60);
      const seconds = relativeStart % 60;
      const startTimestamp = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;

      console.log(`[RealtimeClip] Extracting from ${startTimestamp} for ${duration}s`);

      // Extract clip
      await ffmpeg.exec([
        '-ss', startTimestamp,
        '-i', 'input.webm',
        '-t', duration.toString(),
        '-c:v', 'libvpx-vp9',
        '-c:a', 'libopus',
        '-b:v', '1M',
        '-avoid_negative_ts', 'make_zero',
        'output.webm'
      ]);

      // Read output
      const clipData = await ffmpeg.readFile('output.webm');
      
      let clipBlob: Blob;
      if (clipData instanceof Uint8Array) {
        const buffer = new ArrayBuffer(clipData.length);
        const view = new Uint8Array(buffer);
        view.set(clipData);
        clipBlob = new Blob([buffer], { type: 'video/webm' });
      } else {
        clipBlob = new Blob([clipData as BlobPart], { type: 'video/webm' });
      }

      // Cleanup FFmpeg files
      await ffmpeg.deleteFile('input.webm');
      await ffmpeg.deleteFile('output.webm');

      if (clipBlob.size < 500) {
        console.warn('[RealtimeClip] Generated clip too small, likely failed');
        return { eventId: event.id, clipUrl: null, error: 'Clip generation failed' };
      }

      console.log(`[RealtimeClip] Clip generated: ${(clipBlob.size / 1024).toFixed(1)}KB`);

      // Upload to storage
      const filePath = `${matchId}/${event.id}-${event.type}-${event.minute}min.webm`;
      
      const { error: uploadError } = await supabase.storage
        .from('event-clips')
        .upload(filePath, clipBlob, {
          contentType: 'video/webm',
          upsert: true
        });

      if (uploadError) {
        console.error('[RealtimeClip] Upload error:', uploadError);
        return { eventId: event.id, clipUrl: null, error: uploadError.message };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('event-clips')
        .getPublicUrl(filePath);

      const clipUrl = urlData.publicUrl;

      // Update database
      await supabase
        .from('match_events')
        .update({ clip_url: clipUrl })
        .eq('id', event.id);

      console.log(`[RealtimeClip] Clip uploaded: ${clipUrl}`);

      toast({
        title: "Clip gerado",
        description: `Clip do ${event.type} aos ${event.minute}' criado`,
      });

      return { eventId: event.id, clipUrl };

    } catch (error) {
      console.error('[RealtimeClip] Error generating clip:', error);
      return { 
        eventId: event.id, 
        clipUrl: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    } finally {
      setGenerationQueue(prev => prev.filter(id => id !== event.id));
      setIsGenerating(prev => generationQueue.length > 1);
    }
  }, [matchId, segmentBuffer, loadFFmpeg, toast, generationQueue.length]);

  /**
   * Generate clips for multiple events (batch processing)
   */
  const generateClipsForEvents = useCallback(async (
    events: ClipGenerationEvent[]
  ): Promise<ClipGenerationResult[]> => {
    const results: ClipGenerationResult[] = [];
    
    for (const event of events) {
      const result = await generateClipForEvent(event);
      results.push(result);
      
      // Small delay between clips to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return results;
  }, [generateClipForEvent]);

  /**
   * Check if a specific event's clip is being generated
   */
  const isGeneratingEvent = useCallback((eventId: string): boolean => {
    return generationQueue.includes(eventId);
  }, [generationQueue]);

  return {
    generateClipForEvent,
    generateClipsForEvents,
    isGenerating,
    isGeneratingEvent,
    generationQueue,
  };
}
