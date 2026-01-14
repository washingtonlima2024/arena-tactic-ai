import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
 */
export function useMatchSelection(): UseMatchSelectionResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const matchIdFromUrl = searchParams.get('match');
  
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
