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

interface ExtractFrameParams {
  eventId: string;
  eventType: string;
  videoUrl: string;
  timestamp: number; // in seconds
  matchId: string;
}

export function useThumbnailGeneration(matchId?: string) {
  const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailData>>({});
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());
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

  // Extract frame from video using canvas and upload to Storage
  const extractFrameFromVideo = async (params: ExtractFrameParams): Promise<ThumbnailData | null> => {
    const { eventId, eventType, videoUrl, timestamp, matchId: eventMatchId } = params;

    if (extractingIds.has(eventId)) return null;

    setExtractingIds(prev => new Set(prev).add(eventId));

    try {
      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.preload = 'metadata';
        video.muted = true;
        
        let timeoutId: number;
        let resolved = false;
        
        const cleanup = () => {
          clearTimeout(timeoutId);
          video.remove();
        };
        
        const handleError = (error: string) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(new Error(error));
        };
        
        video.onloadedmetadata = () => {
          // Ensure timestamp is within video duration
          const targetTime = Math.min(timestamp, video.duration - 0.1);
          video.currentTime = Math.max(0, targetTime);
        };

        video.onseeked = async () => {
          if (resolved) return;
          resolved = true;
          
          try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              throw new Error('Failed to get canvas context');
            }
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convert to blob for upload
            const blob = await new Promise<Blob | null>((res) => {
              canvas.toBlob((b) => res(b), 'image/jpeg', 0.85);
            });
            
            if (!blob) {
              throw new Error('Failed to create image blob');
            }
            
            // Upload to Supabase Storage
            const fileName = `${eventMatchId}/${eventId}-frame.jpg`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('thumbnails')
              .upload(fileName, blob, {
                contentType: 'image/jpeg',
                upsert: true
              });
            
            if (uploadError) {
              console.error('Storage upload error:', uploadError);
              throw new Error('Erro ao salvar frame no storage');
            }
            
            // Get public URL
            const { data: urlData } = supabase.storage
              .from('thumbnails')
              .getPublicUrl(fileName);
            
            const imageUrl = urlData.publicUrl;
            
            // Generate title
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
            const minute = Math.floor(timestamp / 60);
            const title = `${eventLabel} - ${minute}'`;
            
            // Save to database
            const { error: dbError } = await supabase
              .from('thumbnails')
              .upsert({
                event_id: eventId,
                match_id: eventMatchId,
                image_url: imageUrl,
                event_type: eventType,
                title
              }, { onConflict: 'event_id' });
            
            if (dbError) {
              console.error('Error saving thumbnail to DB:', dbError);
            }
            
            const thumbnailData: ThumbnailData = {
              eventId,
              imageUrl,
              eventType,
              title
            };
            
            setThumbnails(prev => ({
              ...prev,
              [eventId]: thumbnailData
            }));
            
            cleanup();
            canvas.remove();
            
            toast.success(`Frame extraído: ${eventLabel}`);
            resolve(thumbnailData);
          } catch (err) {
            cleanup();
            reject(err);
          }
        };

        video.onerror = () => {
          handleError('Falha ao carregar vídeo (CORS ou URL inválida)');
        };

        // Set timeout for loading
        timeoutId = window.setTimeout(() => {
          if (!resolved) {
            handleError('Timeout ao carregar vídeo');
          }
        }, 15000);

        video.src = videoUrl;
        video.load();
      });
    } catch (error) {
      console.error('Error extracting frame:', error);
      toast.error('Erro ao extrair frame do vídeo');
      return null;
    } finally {
      setExtractingIds(prev => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

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

  const extractAllFrames = async (events: ExtractFrameParams[]) => {
    toast.info(`Extraindo ${events.length} frames do vídeo...`);
    
    for (const event of events) {
      if (!thumbnails[event.eventId]) {
        await extractFrameFromVideo(event);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    toast.success('Todos os frames foram extraídos!');
  };

  const isGenerating = (eventId: string) => generatingIds.has(eventId);
  const isExtracting = (eventId: string) => extractingIds.has(eventId);
  const hasThumbnail = (eventId: string) => !!thumbnails[eventId];
  const getThumbnail = (eventId: string) => thumbnails[eventId];

  return {
    thumbnails,
    generateThumbnail,
    generateAllThumbnails,
    extractFrameFromVideo,
    extractAllFrames,
    isGenerating,
    isExtracting,
    hasThumbnail,
    getThumbnail,
    generatingIds,
    extractingIds,
    isLoading,
    reload: loadThumbnails
  };
}