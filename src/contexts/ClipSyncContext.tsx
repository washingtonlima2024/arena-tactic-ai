// Simplified context for clip status monitoring
// Server-side processing handles clip generation automatically

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ClipStatus {
  eventId: string;
  hasClip: boolean;
  isPending: boolean;
}

interface ClipSyncContextValue {
  // Status
  clipStatuses: ClipStatus[];
  pendingCount: number;
  readyCount: number;
  
  // Helpers
  getClipStatus: (eventId: string) => ClipStatus | undefined;
  hasClip: (eventId: string) => boolean;
  isPending: (eventId: string) => boolean;
  
  // Refresh
  refreshStatuses: () => Promise<void>;
}

const ClipSyncContext = createContext<ClipSyncContextValue | null>(null);

export function useClipSync() {
  const context = useContext(ClipSyncContext);
  if (!context) {
    return {
      clipStatuses: [],
      pendingCount: 0,
      readyCount: 0,
      getClipStatus: () => undefined,
      hasClip: () => false,
      isPending: () => false,
      refreshStatuses: async () => {}
    } as ClipSyncContextValue;
  }
  return context;
}

interface ClipSyncProviderProps {
  children: React.ReactNode;
  matchId?: string | null;
}

export function ClipSyncProvider({ children, matchId }: ClipSyncProviderProps) {
  const [clipStatuses, setClipStatuses] = useState<ClipStatus[]>([]);

  // Fetch clip statuses from database
  const refreshStatuses = useCallback(async () => {
    if (!matchId) {
      setClipStatuses([]);
      return;
    }

    const { data, error } = await supabase
      .from('match_events')
      .select('id, clip_url, clip_pending')
      .eq('match_id', matchId);

    if (error) {
      console.error('[ClipSync] Error fetching statuses:', error);
      return;
    }

    const statuses: ClipStatus[] = (data || []).map(event => ({
      eventId: event.id,
      hasClip: !!event.clip_url,
      isPending: event.clip_pending ?? false
    }));

    setClipStatuses(statuses);
  }, [matchId]);

  // Initial fetch
  useEffect(() => {
    refreshStatuses();
  }, [refreshStatuses]);

  // Listen to realtime changes
  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`clip-status-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_events',
          filter: `match_id=eq.${matchId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const event = payload.new as { id: string; clip_url?: string; clip_pending?: boolean };
            setClipStatuses(prev => {
              const existing = prev.findIndex(s => s.eventId === event.id);
              const newStatus: ClipStatus = {
                eventId: event.id,
                hasClip: !!event.clip_url,
                isPending: event.clip_pending ?? false
              };
              
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = newStatus;
                return updated;
              }
              return [...prev, newStatus];
            });
          } else if (payload.eventType === 'DELETE') {
            const event = payload.old as { id: string };
            setClipStatuses(prev => prev.filter(s => s.eventId !== event.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // Computed values
  const pendingCount = clipStatuses.filter(s => s.isPending).length;
  const readyCount = clipStatuses.filter(s => s.hasClip && !s.isPending).length;

  // Helpers
  const getClipStatus = useCallback((eventId: string) => {
    return clipStatuses.find(s => s.eventId === eventId);
  }, [clipStatuses]);

  const hasClip = useCallback((eventId: string) => {
    return clipStatuses.some(s => s.eventId === eventId && s.hasClip);
  }, [clipStatuses]);

  const isPending = useCallback((eventId: string) => {
    return clipStatuses.some(s => s.eventId === eventId && s.isPending);
  }, [clipStatuses]);

  const value: ClipSyncContextValue = {
    clipStatuses,
    pendingCount,
    readyCount,
    getClipStatus,
    hasClip,
    isPending,
    refreshStatuses
  };

  return (
    <ClipSyncContext.Provider value={value}>
      {children}
    </ClipSyncContext.Provider>
  );
}
