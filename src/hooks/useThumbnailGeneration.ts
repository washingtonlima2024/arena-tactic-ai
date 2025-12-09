import { useState, useEffect, useCallback } from 'react';
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
  matchId: string;
  description?: string;
}

export function useThumbnailGeneration(matchId?: string) {
  const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailData>>({});
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Load existing thumbnails from database
  const loadThumbnails = useCallback(async () => {
    if (!matchId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('thumbnails')
        .select('*')
        .eq('match_id', matchId);

      if (error) {
        console.error('Error loading thumbnails:', error);
        return;
      }

      if (data && data.length > 0) {
        const loaded: Record<string, ThumbnailData> = {};
        data.forEach((thumb) => {
          loaded[thumb.event_id] = {
            eventId: thumb.event_id,
            imageUrl: thumb.image_url,
            eventType: thumb.event_type,
            title: thumb.title || ''
          };
        });
        setThumbnails(loaded);
        console.log(`Loaded ${data.length} thumbnails from database`);
      }
    } catch (error) {
      console.error('Error loading thumbnails:', error);
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    loadThumbnails();
  }, [loadThumbnails]);

  const generateThumbnail = async (params: GenerateThumbnailParams) => {
    const { eventId, eventType, minute, homeTeam, awayTeam, homeScore, awayScore, matchId: eventMatchId, description } = params;

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

      const prompt = `Create a dynamic sports action thumbnail for a soccer match moment:
Event: ${eventLabel} at minute ${minute}
Match: ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}
${description ? `Context: ${description}` : ''}

CRITICAL: Do NOT include any text, words, letters, numbers, or typography in the image.
Generate ONLY a visual scene without any text overlay.

Style: Professional sports broadcast graphics, dramatic lighting, soccer field background, energy and motion effects. Use green and teal/turquoise color scheme. 16:9 aspect ratio. Modern clean design with dynamic action feel. Show players in motion, ball, stadium atmosphere. NO TEXT AT ALL.`;

      const { data, error } = await supabase.functions.invoke('generate-thumbnail', {
        body: { 
          prompt, 
          eventType, 
          matchInfo: `${homeTeam} vs ${awayTeam}`,
          eventId,
          matchId: eventMatchId
        }
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
    
    for (const event of events) {
      if (!thumbnails[event.eventId]) {
        await generateThumbnail(event);
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
    generatingIds,
    isLoading,
    reload: loadThumbnails
  };
}