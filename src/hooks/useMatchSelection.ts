import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAllCompletedMatches, MatchWithDetails } from '@/hooks/useMatchDetails';

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
 * Priority: URL param > local state > first match in list
 */
export function useMatchSelection(): UseMatchSelectionResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const matchIdFromUrl = searchParams.get('match');
  
  const { data: matches = [], isLoading: matchesLoading } = useAllCompletedMatches();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(matchIdFromUrl);

  // Sync state when URL changes externally
  useEffect(() => {
    if (matchIdFromUrl && matchIdFromUrl !== selectedMatchId) {
      setSelectedMatchId(matchIdFromUrl);
    }
  }, [matchIdFromUrl, selectedMatchId]);

  // Determine current match ID with priority: URL > state > first match
  const currentMatchId = matchIdFromUrl || selectedMatchId || matches[0]?.id || null;

  // Auto-set URL when entering page without match param but we have matches
  useEffect(() => {
    if (!matchIdFromUrl && matches.length > 0 && currentMatchId) {
      setSearchParams({ match: currentMatchId }, { replace: true });
    }
  }, [matchIdFromUrl, matches.length, currentMatchId, setSearchParams]);

  // Find the selected match object
  const selectedMatch = matches.find(m => m.id === currentMatchId);

  // Handler to change match selection
  const setSelectedMatch = useCallback((matchId: string) => {
    setSelectedMatchId(matchId);
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
