import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
      const { data, error } = await supabase
        .from('generated_audio')
        .select('*')
        .eq('match_id', matchId)
        .like('audio_type', 'podcast_%');

      if (error) throw error;

      const loadedPodcasts: Record<PodcastType, PodcastResult | null> = {
        tactical: null,
        summary: null,
        debate: null,
      };

      data?.forEach((item) => {
        const type = item.audio_type.replace('podcast_', '') as PodcastType;
        if (type in loadedPodcasts) {
          loadedPodcasts[type] = {
            script: item.script || '',
            audioUrl: item.audio_url || '',
            podcastType: type,
            voice: item.voice || '',
          };
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

      // Upload audio to storage
      const audioBlob = base64ToBlob(data.audioContent, 'audio/mp3');
      const fileName = `podcast-${podcastType}-${matchId}-${Date.now()}.mp3`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('generated-audio')
        .upload(fileName, audioBlob, {
          contentType: 'audio/mp3',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('generated-audio')
        .getPublicUrl(fileName);

      const audioUrl = urlData.publicUrl;

      // Save to database (upsert)
      const audioType = `podcast_${podcastType}`;
      const { error: dbError } = await supabase
        .from('generated_audio')
        .upsert({
          match_id: matchId,
          audio_type: audioType,
          voice: data.voice,
          script: data.script,
          audio_url: audioUrl,
        }, {
          onConflict: 'match_id,audio_type,voice',
        });

      if (dbError) throw dbError;

      const result: PodcastResult = {
        script: data.script,
        audioUrl: audioUrl,
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

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}
