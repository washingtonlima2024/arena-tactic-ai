import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PodcastResult {
  script: string;
  audioContent: string;
  podcastType: string;
  voice: string;
}

export type PodcastType = 'tactical' | 'summary' | 'debate';

export function usePodcastGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState<PodcastType | null>(null);
  const [podcasts, setPodcasts] = useState<Record<PodcastType, PodcastResult | null>>({
    tactical: null,
    summary: null,
    debate: null,
  });
  const { toast } = useToast();

  const generatePodcast = async (
    matchId: string,
    events: any[],
    homeTeam: string,
    awayTeam: string,
    homeScore: number,
    awayScore: number,
    podcastType: PodcastType,
    tacticalAnalysis?: any
  ) => {
    setIsGenerating(true);
    setGeneratingType(podcastType);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-podcast', {
        body: {
          matchId,
          events,
          homeTeam,
          awayTeam,
          homeScore,
          awayScore,
          podcastType,
          tacticalAnalysis,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate podcast');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setPodcasts(prev => ({
        ...prev,
        [podcastType]: data,
      }));
      
      toast({
        title: "Podcast gerado!",
        description: `O podcast "${getPodcastTitle(podcastType)}" foi criado com sucesso.`,
      });

      return data;
    } catch (error) {
      console.error('Podcast generation error:', error);
      
      toast({
        title: "Erro ao gerar podcast",
        description: error instanceof Error ? error.message : "Tente novamente mais tarde.",
        variant: "destructive",
      });
      
      throw error;
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  };

  const playPodcast = (podcastType: PodcastType) => {
    const podcast = podcasts[podcastType];
    if (!podcast?.audioContent) return null;
    
    const audio = new Audio(`data:audio/mp3;base64,${podcast.audioContent}`);
    return audio;
  };

  const downloadPodcast = (podcastType: PodcastType, filename: string) => {
    const podcast = podcasts[podcastType];
    if (!podcast?.audioContent) return;
    
    const link = document.createElement('a');
    link.href = `data:audio/mp3;base64,${podcast.audioContent}`;
    link.download = filename;
    link.click();
  };

  return {
    isGenerating,
    generatingType,
    podcasts,
    generatePodcast,
    playPodcast,
    downloadPodcast,
  };
}

function getPodcastTitle(type: PodcastType): string {
  const titles: Record<PodcastType, string> = {
    tactical: 'Análise Tática',
    summary: 'Resumo da Partida',
    debate: 'Debate de Torcedores',
  };
  return titles[type];
}
