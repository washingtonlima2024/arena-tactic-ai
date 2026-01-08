// Global context for reactive clip synchronization
// Listens to match_events changes and automatically generates/regenerates clips

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEventClipSync, MatchEvent, VideoInfo, ClipSyncStatus, needsClipRegeneration, findVideoForEvent } from '@/hooks/useEventClipSync';
import { toast } from 'sonner';

interface ClipSyncContextValue {
  // Queue state
  queue: ClipSyncStatus[];
  isProcessing: boolean;
  currentEventId: string | null;
  
  // Actions
  queueEvent: (event: MatchEvent, videos: VideoInfo[]) => void;
  queueMultipleEvents: (events: MatchEvent[], videos: VideoInfo[]) => void;
  cancelAll: () => void;
  
  // Status helpers
  getEventStatus: (eventId: string) => ClipSyncStatus | undefined;
  isEventProcessing: (eventId: string) => boolean;
}

const ClipSyncContext = createContext<ClipSyncContextValue | null>(null);

export function useClipSync() {
  const context = useContext(ClipSyncContext);
  // Return safe defaults when used outside provider (e.g., during initial render)
  if (!context) {
    return {
      queue: [],
      isProcessing: false,
      currentEventId: null,
      queueEvent: () => {},
      queueMultipleEvents: () => {},
      cancelAll: () => {},
      getEventStatus: () => undefined,
      isEventProcessing: () => false
    } as ClipSyncContextValue;
  }
  return context;
}

interface ClipSyncProviderProps {
  children: React.ReactNode;
  matchId?: string | null;
}

export function ClipSyncProvider({ children, matchId }: ClipSyncProviderProps) {
  const [queue, setQueue] = useState<ClipSyncStatus[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { generateEventClip } = useEventClipSync();
  
  const processingQueueRef = useRef<Array<{ event: MatchEvent; video: VideoInfo }>>([]);
  const cancelledRef = useRef(false);
  const videoCacheRef = useRef<Map<string, VideoInfo[]>>(new Map());

  // Fetch videos for a match
  const fetchMatchVideos = useCallback(async (targetMatchId: string): Promise<VideoInfo[]> => {
    // Check cache first
    if (videoCacheRef.current.has(targetMatchId)) {
      return videoCacheRef.current.get(targetMatchId)!;
    }

    const { data, error } = await supabase
      .from('videos')
      .select('id, file_url, video_type, start_minute, duration_seconds')
      .eq('match_id', targetMatchId);

    if (error || !data) {
      console.error('[ClipSyncProvider] Error fetching videos:', error);
      return [];
    }

    videoCacheRef.current.set(targetMatchId, data);
    return data;
  }, []);

  // Process the queue
  const processQueue = useCallback(async () => {
    if (processingQueueRef.current.length === 0 || isProcessing) return;
    
    setIsProcessing(true);
    cancelledRef.current = false;

    while (processingQueueRef.current.length > 0 && !cancelledRef.current) {
      const item = processingQueueRef.current.shift();
      if (!item) break;

      const { event, video } = item;
      setCurrentEventId(event.id);

      // Update queue status
      setQueue(prev => prev.map(q => 
        q.eventId === event.id 
          ? { ...q, status: 'processing' as const, message: 'Processando...' }
          : q
      ));

      try {
        await generateEventClip(event, video, (status) => {
          setQueue(prev => prev.map(q => 
            q.eventId === status.eventId ? status : q
          ));
        });
      } catch (error) {
        console.error('[ClipSyncProvider] Error processing event:', event.id, error);
        setQueue(prev => prev.map(q => 
          q.eventId === event.id 
            ? { ...q, status: 'error' as const, message: 'Erro ao processar' }
            : q
        ));
      }
    }

    setCurrentEventId(null);
    setIsProcessing(false);

    // Clean up completed items after a delay
    setTimeout(() => {
      setQueue(prev => prev.filter(q => q.status !== 'done'));
    }, 3000);
  }, [isProcessing, generateEventClip]);

  // Queue a single event for processing
  const queueEvent = useCallback((event: MatchEvent, videos: VideoInfo[]) => {
    const video = findVideoForEvent(event, videos);
    if (!video) {
      console.error('[ClipSyncProvider] No video found for event:', event.id);
      toast.error('Nenhum vídeo encontrado para o evento');
      return;
    }

    // Check if already in queue
    const existingIndex = processingQueueRef.current.findIndex(
      item => item.event.id === event.id
    );

    if (existingIndex >= 0) {
      // Update existing item
      processingQueueRef.current[existingIndex] = { event, video };
    } else {
      // Add to queue
      processingQueueRef.current.push({ event, video });
      setQueue(prev => [...prev, {
        eventId: event.id,
        status: 'pending',
        progress: 0,
        message: 'Aguardando...'
      }]);
    }

    // Start processing if not already
    processQueue();
  }, [processQueue]);

  // Queue multiple events
  const queueMultipleEvents = useCallback((events: MatchEvent[], videos: VideoInfo[]) => {
    const toAdd: Array<{ event: MatchEvent; video: VideoInfo }> = [];
    const newStatuses: ClipSyncStatus[] = [];

    for (const event of events) {
      const video = findVideoForEvent(event, videos);
      if (!video) continue;

      // Skip if already queued
      if (processingQueueRef.current.some(item => item.event.id === event.id)) continue;
      if (queue.some(q => q.eventId === event.id)) continue;

      toAdd.push({ event, video });
      newStatuses.push({
        eventId: event.id,
        status: 'pending',
        progress: 0,
        message: 'Aguardando...'
      });
    }

    if (toAdd.length > 0) {
      processingQueueRef.current.push(...toAdd);
      setQueue(prev => [...prev, ...newStatuses]);
      toast.info(`${toAdd.length} clips adicionados à fila`);
      processQueue();
    }
  }, [queue, processQueue]);

  // Cancel all pending operations
  const cancelAll = useCallback(() => {
    cancelledRef.current = true;
    processingQueueRef.current = [];
    setQueue([]);
    setCurrentEventId(null);
    setIsProcessing(false);
  }, []);

  // Get status for a specific event
  const getEventStatus = useCallback((eventId: string): ClipSyncStatus | undefined => {
    return queue.find(q => q.eventId === eventId);
  }, [queue]);

  // Check if event is being processed
  const isEventProcessing = useCallback((eventId: string): boolean => {
    return currentEventId === eventId || 
           queue.some(q => q.eventId === eventId && q.status === 'processing');
  }, [currentEventId, queue]);

  // Note: Clips pendentes são processados automaticamente pelo servidor Python
  // Este useEffect apenas monitora e mostra notificação quando há clips prontos
  useEffect(() => {
    if (!matchId) return;
    
    const checkClipsReady = async () => {
      console.log('[ClipSyncProvider] Verificando status de clips...');
      
      const { data: events, error } = await supabase
        .from('match_events')
        .select('id, clip_url, clip_pending')
        .eq('match_id', matchId);
      
      if (error) {
        console.error('[ClipSyncProvider] Error fetching events:', error);
        return;
      }
      
      if (!events) return;
      
      const withClips = events.filter(e => e.clip_url && !e.clip_pending);
      const pending = events.filter(e => e.clip_pending);
      
      if (withClips.length > 0) {
        console.log(`[ClipSyncProvider] ${withClips.length} clips prontos`);
      }
      
      if (pending.length > 0) {
        console.log(`[ClipSyncProvider] ${pending.length} clips pendentes (serão processados pelo servidor)`);
      }
    };
    
    const timer = setTimeout(checkClipsReady, 1000);
    return () => clearTimeout(timer);
  }, [matchId]);

  // Listen to realtime changes for match_events - apenas para atualizar UI
  useEffect(() => {
    if (!matchId) return;

    console.log('[ClipSyncProvider] Setting up realtime listener for match:', matchId);

    const channel = supabase
      .channel(`clip-sync-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_events',
          filter: `match_id=eq.${matchId}`
        },
        async (payload) => {
          console.log('[ClipSyncProvider] Received realtime event:', payload.eventType);

          if (payload.eventType === 'UPDATE') {
            const newEvent = payload.new as MatchEvent;
            
            // Apenas notificar quando clip ficou pronto
            if (newEvent.clip_url && !newEvent.clip_pending) {
              console.log('[ClipSyncProvider] Clip ready for event:', newEvent.id);
              // Não mostrar toast para cada clip - apenas log
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[ClipSyncProvider] Realtime subscription status:', status);
      });

    return () => {
      console.log('[ClipSyncProvider] Cleaning up realtime listener');
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const value: ClipSyncContextValue = {
    queue,
    isProcessing,
    currentEventId,
    queueEvent,
    queueMultipleEvents,
    cancelAll,
    getEventStatus,
    isEventProcessing
  };

  return (
    <ClipSyncContext.Provider value={value}>
      {children}
    </ClipSyncContext.Provider>
  );
}
