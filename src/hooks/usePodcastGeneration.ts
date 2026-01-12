import { useState } from 'react';
import { apiClient, normalizeStorageUrl } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

interface PodcastResult {
  script: string;
  audioUrl: string;
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

  // Load saved podcasts for a match
  const loadPodcasts = async (matchId: string) => {
    try {
      const audioData = await apiClient.getAudio(matchId);
      
      const loadedPodcasts: Record<PodcastType, PodcastResult | null> = {
        tactical: null,
        summary: null,
        debate: null,
      };

      audioData?.forEach((item: any) => {
        if (item.audio_type?.startsWith('podcast_')) {
          const type = item.audio_type.replace('podcast_', '') as PodcastType;
          if (type in loadedPodcasts) {
            loadedPodcasts[type] = {
              script: item.script || '',
              audioUrl: normalizeStorageUrl(item.audio_url) || item.audio_url || '',
              podcastType: type,
              voice: item.voice || '',
            };
          }
        }
      });

      setPodcasts(loadedPodcasts);
      return loadedPodcasts;
    } catch (error) {
      console.error('Error loading podcasts:', error);
      return null;
    }
  };

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
      const data = await apiClient.generatePodcast({
        matchId,
        events,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        podcastType,
        tacticalAnalysis,
      });

      if (data.error) {
        throw new Error(data.error);
      }

      const result: PodcastResult = {
        script: data.script,
        audioUrl: normalizeStorageUrl(data.audioUrl) || data.audioUrl,
        podcastType: podcastType,
        voice: data.voice,
      };

      setPodcasts(prev => ({
        ...prev,
        [podcastType]: result,
      }));
      
      toast({
        title: "Podcast gerado!",
        description: `O podcast "${getPodcastTitle(podcastType)}" foi criado e salvo com sucesso.`,
      });

      return result;
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

  const downloadPodcast = (podcastType: PodcastType, filename: string) => {
    const podcast = podcasts[podcastType];
    if (!podcast?.audioUrl) return;
    
    const link = document.createElement('a');
    link.href = podcast.audioUrl;
    link.download = filename;
    link.target = '_blank';
    link.click();
  };

  return {
    isGenerating,
    generatingType,
    podcasts,
    generatePodcast,
    loadPodcasts,
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
