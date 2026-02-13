import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';

interface ScoreboardBoundaries {
  game_start_second: number | null;
  halftime_timestamp_seconds: number | null;
  second_half_start_second: number | null;
  stoppage_time_1st: number | null;
  stoppage_time_2nd: number | null;
  final_score?: { home: number; away: number };
  confidence: number;
  source: string;
  readings_count?: number;
  total_samples?: number;
}

interface EventValidation {
  event_id: string;
  event_type: string;
  corrected: boolean;
  minute: number;
  second?: number;
  ocr_minute: number | null;
  claimed_minute: number;
  divergence: number | null;
  confidence: number;
  source: string;
}

interface ScoreboardResult {
  success: boolean;
  boundaries?: ScoreboardBoundaries;
  validations?: EventValidation[];
  error?: string;
}

export function useScoreboardReader() {
  const [isReading, setIsReading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [boundaries, setBoundaries] = useState<ScoreboardBoundaries | null>(null);
  const [validations, setValidations] = useState<EventValidation[]>([]);

  const readScoreboard = async (matchId: string): Promise<ScoreboardResult | null> => {
    setIsReading(true);
    try {
      const data = await apiClient.readScoreboard(matchId);
      if (data?.boundaries) {
        setBoundaries(data.boundaries);
      }
      return data;
    } catch (error: any) {
      console.error('[ScoreboardReader] Erro:', error);
      toast.error(`Erro ao ler placar: ${error.message || 'Erro desconhecido'}`);
      return null;
    } finally {
      setIsReading(false);
    }
  };

  const validateEventTimes = async (matchId: string): Promise<EventValidation[]> => {
    setIsValidating(true);
    try {
      const data = await apiClient.validateEventTimesOCR(matchId);
      if (data?.validations) {
        setValidations(data.validations);
        return data.validations;
      }
      return [];
    } catch (error: any) {
      console.error('[ScoreboardReader] Erro validação:', error);
      toast.error(`Erro ao validar tempos: ${error.message || 'Erro desconhecido'}`);
      return [];
    } finally {
      setIsValidating(false);
    }
  };

  return {
    readScoreboard,
    validateEventTimes,
    isReading,
    isValidating,
    boundaries,
    validations,
  };
}
