import { useState, useEffect, useCallback } from 'react';
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
  
  // Read from sessionStorage as fallback
  const storedMatchId = typeof window !== 'undefined' 
    ? sessionStorage.getItem(STORAGE_KEY) 
    : null;
  
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(
    matchIdFromUrl || storedMatchId
  );

  // Sync state when URL changes externally and persist to storage
  useEffect(() => {
    if (matchIdFromUrl && matchIdFromUrl !== selectedMatchId) {
      setSelectedMatchId(matchIdFromUrl);
      sessionStorage.setItem(STORAGE_KEY, matchIdFromUrl);
    }
  }, [matchIdFromUrl, selectedMatchId]);

  // Determine current match ID with priority: URL > stored > state > first match
  const currentMatchId = matchIdFromUrl || storedMatchId || selectedMatchId || matches[0]?.id || null;

  // Auto-set URL when entering page without match param
  // IMPORTANT: Use stored/state instead of matches[0]
  useEffect(() => {
    if (!matchIdFromUrl && matches.length > 0 && currentMatchId) {
      // Check if stored match still exists in the list
      const matchExists = matches.some(m => m.id === currentMatchId);
      if (matchExists) {
        setSearchParams({ match: currentMatchId }, { replace: true });
      } else if (matches[0]) {
        // Fallback to first match only if stored one doesn't exist
        const fallbackId = matches[0].id;
        sessionStorage.setItem(STORAGE_KEY, fallbackId);
        setSearchParams({ match: fallbackId }, { replace: true });
      }
    }
  }, [matchIdFromUrl, matches.length, currentMatchId, setSearchParams, matches]);

  // Find the selected match object
  const selectedMatch = matches.find(m => m.id === currentMatchId);

  // Handler to change match selection - save to storage
  const setSelectedMatch = useCallback((matchId: string) => {
    setSelectedMatchId(matchId);
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
