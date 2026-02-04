import { useState } from 'react';
import { apiClient, normalizeStorageUrl } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

interface NarrationResult {
  script: string;
  audioUrl: string;
  voice: string;
  scriptOnly?: boolean;
}

export function useNarrationGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [narration, setNarration] = useState<NarrationResult | null>(null);
  const { toast } = useToast();

  // Load saved narration for a match
  const loadNarration = async (matchId: string, voice: string) => {
    try {
      const audioData = await apiClient.getAudio(matchId, 'narration');
      const match = audioData.find((a: any) => a.voice === voice);

      if (match?.audio_url) {
        const normalizedUrl = normalizeStorageUrl(match.audio_url);
        setNarration({
          script: match.script || '',
          audioUrl: normalizedUrl || match.audio_url,
          voice: match.voice || voice,
        });
        return match;
      }
      
      setNarration(null);
      return null;
    } catch (error) {
      console.error('Error loading narration:', error);
      return null;
    }
  };

  const generateNarration = async (
    matchId: string,
    events: any[],
    homeTeam: string,
    awayTeam: string,
    homeScore: number,
    awayScore: number,
    voice: 'narrator' | 'commentator' | 'dynamic' = 'narrator'
  ): Promise<NarrationResult | null> => {
    setIsGenerating(true);
    
    try {
      const data = await apiClient.generateNarration({
        matchId,
        events,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        voice,
      });

      if (data.error) {
        throw new Error(data.error);
      }

      // Check if audio was actually generated
      if (!data.audioUrl) {
        // Still save the script for display
        const scriptOnlyResult = {
          script: data.script,
          audioUrl: '',
          voice: data.voice,
          scriptOnly: true, // Flag to indicate only script was generated
        };
        
        setNarration(scriptOnlyResult);
        
        toast({
          title: "Script gerado!",
          description: "Use a aba 'kakttus Voice' para ouvir a narração.",
          variant: "default",
        });
        
        return scriptOnlyResult;
      }

      const result: NarrationResult = {
        script: data.script,
        audioUrl: normalizeStorageUrl(data.audioUrl) || data.audioUrl,
        voice: data.voice,
        scriptOnly: false,
      };

      setNarration(result);
      
      toast({
        title: "Narração gerada!",
        description: "A narração da partida foi criada e salva com sucesso.",
      });

      return result;
    } catch (error) {
      console.error('Narration generation error:', error);
      
      toast({
        title: "Erro ao gerar narração",
        description: error instanceof Error ? error.message : "Tente novamente mais tarde.",
        variant: "destructive",
      });
      
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadAudio = (audioUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = filename;
    link.target = '_blank';
    link.click();
  };

  return {
    isGenerating,
    narration,
    generateNarration,
    loadNarration,
    downloadAudio,
  };
}
