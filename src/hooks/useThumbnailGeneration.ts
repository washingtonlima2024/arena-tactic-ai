import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ThumbnailData {
  eventId: string;
  imageUrl: string;
  eventType: string;
  title: string;
}

interface GenerateThumbnailParams {
  eventId: string;
  eventType: string;
  minute: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  description?: string;
}

export function useThumbnailGeneration() {
  const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailData>>({});
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  const generateThumbnail = async (params: GenerateThumbnailParams) => {
    const { eventId, eventType, minute, homeTeam, awayTeam, homeScore, awayScore, description } = params;

    if (generatingIds.has(eventId)) return;

    setGeneratingIds(prev => new Set(prev).add(eventId));

    try {
      const eventLabels: Record<string, string> = {
        goal: 'GOL',
        shot: 'FINALIZAÇÃO',
        shot_on_target: 'CHUTE NO GOL',
        save: 'DEFESA',
        foul: 'FALTA',
        yellow_card: 'CARTÃO AMARELO',
        red_card: 'CARTÃO VERMELHO',
        corner: 'ESCANTEIO',
        penalty: 'PÊNALTI',
        offside: 'IMPEDIMENTO',
      };

      const eventLabel = eventLabels[eventType] || eventType.toUpperCase();

      // Create a sports-themed prompt for the thumbnail
      const prompt = `Create a dynamic sports thumbnail for a soccer match moment:
Event: ${eventLabel} at minute ${minute}'
Match: ${homeTeam} ${homeScore} vs ${awayScore} ${awayTeam}
${description ? `Description: ${description}` : ''}

Style: Professional sports broadcast graphic, dramatic lighting, soccer field background, bold typography showing "${eventLabel}" and "${minute}'" prominently. Use green and teal color scheme. 16:9 aspect ratio. Modern, clean design with energy and motion effects.`;

      const { data, error } = await supabase.functions.invoke('generate-thumbnail', {
        body: { prompt, eventType, matchInfo: `${homeTeam} vs ${awayTeam}` }
      });

      if (error) throw error;

      if (data?.imageUrl) {
        const thumbnailData: ThumbnailData = {
          eventId,
          imageUrl: data.imageUrl,
          eventType,
          title: `${eventLabel} - ${minute}'`
        };

        setThumbnails(prev => ({
          ...prev,
          [eventId]: thumbnailData
        }));

        toast.success(`Thumbnail gerada: ${eventLabel}`);
        return thumbnailData;
      }
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      toast.error('Erro ao gerar thumbnail');
    } finally {
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  const generateAllThumbnails = async (events: GenerateThumbnailParams[]) => {
    toast.info(`Gerando ${events.length} thumbnails...`);
    
    // Generate thumbnails sequentially to avoid rate limits
    for (const event of events) {
      if (!thumbnails[event.eventId]) {
        await generateThumbnail(event);
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    toast.success('Todas as thumbnails foram geradas!');
  };

  const isGenerating = (eventId: string) => generatingIds.has(eventId);
  const hasThumbnail = (eventId: string) => !!thumbnails[eventId];
  const getThumbnail = (eventId: string) => thumbnails[eventId];

  return {
    thumbnails,
    generateThumbnail,
    generateAllThumbnails,
    isGenerating,
    hasThumbnail,
    getThumbnail,
    generatingIds
  };
}
