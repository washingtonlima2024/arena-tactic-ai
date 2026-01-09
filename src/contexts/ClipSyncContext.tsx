// Simplified context for clip status monitoring
// Server-side processing handles clip generation automatically
// 100% Local Mode - Uses apiClient instead of Supabase

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient, isLocalServerAvailable } from '@/lib/apiClient';

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

  // Fetch clip statuses from local API
  const refreshStatuses = useCallback(async () => {
    if (!matchId) {
      setClipStatuses([]);
      return;
    }

    const serverUp = await isLocalServerAvailable();
    if (!serverUp) {
      console.warn('[ClipSync] Servidor local indisponível');
      return;
    }

    try {
      const events = await apiClient.getMatchEvents(matchId);
      
      const statuses: ClipStatus[] = (events || []).map((event: any) => ({
        eventId: event.id,
        hasClip: !!event.clip_url,
        isPending: event.clip_pending ?? false
      }));

      setClipStatuses(statuses);
    } catch (error) {
      console.error('[ClipSync] Error fetching statuses:', error);
    }
  }, [matchId]);

  // Initial fetch
  useEffect(() => {
    refreshStatuses();
  }, [refreshStatuses]);

  // Polling for updates (every 10 seconds when match is active)
  useEffect(() => {
    if (!matchId) return;

    const interval = setInterval(() => {
      refreshStatuses();
    }, 10000);

    return () => clearInterval(interval);
  }, [matchId, refreshStatuses]);

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
