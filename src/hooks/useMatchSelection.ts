import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAllCompletedMatches, MatchWithDetails } from '@/hooks/useMatchDetails';

const STORAGE_KEY = 'arena_selected_match';

interface UseMatchSelectionResult {
  // Current match ID (from URL, state, or first match)
  currentMatchId: string | null;
  // Selected match object
  selectedMatch: MatchWithDetails | undefined;
  // All available matches
  matches: MatchWithDetails[];
  // Loading state
  isLoading: boolean;
  // Function to change the selected match (updates URL and state)
  setSelectedMatch: (matchId: string) => void;
}

/**
 * Centralized hook for managing match selection with URL synchronization.
 * Ensures consistent behavior across Events, Analysis, and Media pages.
 * 
 * Priority: URL param > sessionStorage > first match in list
 * 
 * IMPORTANT: This hook now invalidates relevant queries when match changes,
 * ensuring all pages update immediately without needing page navigation.
 */
export function useMatchSelection(): UseMatchSelectionResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const matchIdFromUrl = searchParams.get('match');
  const previousMatchId = useRef<string | null>(null);
  
  const { data: matches = [], isLoading: matchesLoading } = useAllCompletedMatches();
  
  // Determine current match ID with clear priority
  const currentMatchId = useMemo(() => {
    // 1. URL has highest priority
    if (matchIdFromUrl) {
      // Persist to storage when URL changes
      sessionStorage.setItem(STORAGE_KEY, matchIdFromUrl);
      return matchIdFromUrl;
    }
    
    // 2. Try sessionStorage
    const storedId = sessionStorage.getItem(STORAGE_KEY);
    if (storedId && matches.some(m => m.id === storedId)) {
      return storedId;
    }
    
    // 3. Fallback to first match
    if (matches.length > 0) {
      const firstId = matches[0].id;
      sessionStorage.setItem(STORAGE_KEY, firstId);
      return firstId;
    }
    
    return null;
  }, [matchIdFromUrl, matches]);

  // Invalidate queries when match changes
  useEffect(() => {
    if (currentMatchId && previousMatchId.current && currentMatchId !== previousMatchId.current) {
      console.log('[MatchSelection] Match changed from', previousMatchId.current, 'to', currentMatchId);
      
      // Invalidate all match-related queries to force refetch
      // Use exact key matching for more precise invalidation
      const queriesToInvalidate = [
        ['match-events', previousMatchId.current],
        ['match-events', currentMatchId],
        ['match-videos', previousMatchId.current],
        ['match-videos', currentMatchId],
        ['match-video', previousMatchId.current],
        ['match-video', currentMatchId],
        ['match-analysis', previousMatchId.current],
        ['match-analysis', currentMatchId],
        ['event-thumbnails', previousMatchId.current],
        ['event-thumbnails', currentMatchId],
        ['thumbnails', previousMatchId.current],
        ['thumbnails', currentMatchId],
        ['analysis-jobs', previousMatchId.current],
        ['analysis-jobs', currentMatchId],
        ['generated-audio', previousMatchId.current],
        ['generated-audio', currentMatchId],
        ['goal-events', previousMatchId.current],
        ['goal-events', currentMatchId],
        ['match-videos-audio', previousMatchId.current],
        ['match-videos-audio', currentMatchId],
      ];
      
      queriesToInvalidate.forEach(queryKey => {
        queryClient.invalidateQueries({ queryKey });
      });
      
      // Also invalidate by partial key match for broader coverage
      queryClient.invalidateQueries({ queryKey: ['match-events'] });
      queryClient.invalidateQueries({ queryKey: ['match-video'] });
      queryClient.invalidateQueries({ queryKey: ['match-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['clips'] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      
      // Dispatch custom event for components that need direct notification
      window.dispatchEvent(new CustomEvent('match-selection-changed', { 
        detail: { 
          previousMatchId: previousMatchId.current, 
          newMatchId: currentMatchId 
        } 
      }));
    }
    
    previousMatchId.current = currentMatchId;
  }, [currentMatchId, queryClient]);

  // Auto-set URL when entering page without match param
  useEffect(() => {
    if (!matchIdFromUrl && currentMatchId && matches.length > 0) {
      setSearchParams({ match: currentMatchId }, { replace: true });
    }
  }, [matchIdFromUrl, currentMatchId, matches.length, setSearchParams]);

  // Find the selected match object
  const selectedMatch = useMemo(() => {
    return matches.find(m => m.id === currentMatchId);
  }, [matches, currentMatchId]);

  // Handler to change match selection - save to storage and update URL
  const setSelectedMatch = useCallback((matchId: string) => {
    sessionStorage.setItem(STORAGE_KEY, matchId);
    setSearchParams({ match: matchId });
  }, [setSearchParams]);

  return {
    currentMatchId,
    selectedMatch,
    matches,
    isLoading: matchesLoading,
    setSelectedMatch,
  };
}
