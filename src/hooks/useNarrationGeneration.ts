import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NarrationResult {
  script: string;
  audioContent: string;
  voice: string;
}

export function useNarrationGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [narration, setNarration] = useState<NarrationResult | null>(null);
  const { toast } = useToast();

  const generateNarration = async (
    matchId: string,
    events: any[],
    homeTeam: string,
    awayTeam: string,
    homeScore: number,
    awayScore: number,
    voice: 'narrator' | 'commentator' | 'dynamic' = 'narrator'
  ) => {
    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-narration', {
        body: {
          matchId,
          events,
          homeTeam,
          awayTeam,
          homeScore,
          awayScore,
          voice,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate narration');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setNarration(data);
      
      toast({
        title: "Narração gerada!",
        description: "A narração da partida foi criada com sucesso.",
      });

      return data;
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

  const playAudio = (audioContent: string) => {
    const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
    return audio;
  };

  const downloadAudio = (audioContent: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `data:audio/mp3;base64,${audioContent}`;
    link.download = filename;
    link.click();
  };

  return {
    isGenerating,
    narration,
    generateNarration,
    playAudio,
    downloadAudio,
  };
}
