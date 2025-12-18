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
            
            // Draw video frame
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // === OVERLAY: Event Badge and Minute ===
            const eventLabels: Record<string, string> = {
              goal: 'GOL',
              shot: 'FINALIZAÇÃO',
              shot_on_target: 'CHUTE',
              save: 'DEFESA',
              foul: 'FALTA',
              yellow_card: 'AMARELO',
              red_card: 'VERMELHO',
              corner: 'ESCANTEIO',
              penalty: 'PÊNALTI',
              offside: 'IMPEDIMENTO',
              substitution: 'SUBST',
              high_press: 'PRESSÃO',
              transition: 'TRANSIÇÃO',
              ball_recovery: 'RECUPERAÇÃO',
            };
            const eventLabel = eventLabels[eventType] || eventType.toUpperCase().replace(/_/g, ' ');
            const minute = Math.floor(timestamp / 60);
            
            // Badge colors based on event type
            const badgeColors: Record<string, { bg: string; text: string }> = {
              goal: { bg: '#10b981', text: '#ffffff' }, // Green
              shot: { bg: '#f59e0b', text: '#ffffff' }, // Amber
              shot_on_target: { bg: '#f59e0b', text: '#ffffff' },
              save: { bg: '#3b82f6', text: '#ffffff' }, // Blue
              foul: { bg: '#ef4444', text: '#ffffff' }, // Red
              yellow_card: { bg: '#eab308', text: '#000000' }, // Yellow
              red_card: { bg: '#dc2626', text: '#ffffff' }, // Red
              corner: { bg: '#8b5cf6', text: '#ffffff' }, // Purple
              penalty: { bg: '#ec4899', text: '#ffffff' }, // Pink
              offside: { bg: '#6366f1', text: '#ffffff' }, // Indigo
            };
            const colors = badgeColors[eventType] || { bg: '#10b981', text: '#ffffff' };
            
            const scale = canvas.width / 1280; // Scale based on video width
            const padding = 20 * scale;
            const badgeHeight = 50 * scale;
            const fontSize = 28 * scale;
            const minuteFontSize = 36 * scale;
            
            // Draw semi-transparent gradient at bottom
            const gradient = ctx.createLinearGradient(0, canvas.height - 120 * scale, 0, canvas.height);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, canvas.height - 120 * scale, canvas.width, 120 * scale);
            
            // Draw event type badge (bottom left)
            ctx.font = `bold ${fontSize}px sans-serif`;
            const badgeText = eventLabel;
            const textMetrics = ctx.measureText(badgeText);
            const badgeWidth = textMetrics.width + 30 * scale;
            
            const badgeX = padding;
            const badgeY = canvas.height - padding - badgeHeight;
            
            // Badge background with rounded corners
            ctx.fillStyle = colors.bg;
            ctx.beginPath();
            const radius = 8 * scale;
            ctx.moveTo(badgeX + radius, badgeY);
            ctx.lineTo(badgeX + badgeWidth - radius, badgeY);
            ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + radius);
            ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - radius);
            ctx.quadraticCurveTo(badgeX + badgeWidth, badgeY + badgeHeight, badgeX + badgeWidth - radius, badgeY + badgeHeight);
            ctx.lineTo(badgeX + radius, badgeY + badgeHeight);
            ctx.quadraticCurveTo(badgeX, badgeY + badgeHeight, badgeX, badgeY + badgeHeight - radius);
            ctx.lineTo(badgeX, badgeY + radius);
            ctx.quadraticCurveTo(badgeX, badgeY, badgeX + radius, badgeY);
            ctx.closePath();
            ctx.fill();
            
            // Badge text
            ctx.fillStyle = colors.text;
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, badgeX + 15 * scale, badgeY + badgeHeight / 2);
            
            // Draw minute badge (bottom right)
            const minuteText = `${minute}'`;
            ctx.font = `bold ${minuteFontSize}px sans-serif`;
            const minuteMetrics = ctx.measureText(minuteText);
            const minuteBadgeWidth = minuteMetrics.width + 30 * scale;
            const minuteBadgeX = canvas.width - padding - minuteBadgeWidth;
            
            // Minute badge background (dark with green accent)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.beginPath();
            ctx.moveTo(minuteBadgeX + radius, badgeY);
            ctx.lineTo(minuteBadgeX + minuteBadgeWidth - radius, badgeY);
            ctx.quadraticCurveTo(minuteBadgeX + minuteBadgeWidth, badgeY, minuteBadgeX + minuteBadgeWidth, badgeY + radius);
            ctx.lineTo(minuteBadgeX + minuteBadgeWidth, badgeY + badgeHeight - radius);
            ctx.quadraticCurveTo(minuteBadgeX + minuteBadgeWidth, badgeY + badgeHeight, minuteBadgeX + minuteBadgeWidth - radius, badgeY + badgeHeight);
            ctx.lineTo(minuteBadgeX + radius, badgeY + badgeHeight);
            ctx.quadraticCurveTo(minuteBadgeX, badgeY + badgeHeight, minuteBadgeX, badgeY + badgeHeight - radius);
            ctx.lineTo(minuteBadgeX, badgeY + radius);
            ctx.quadraticCurveTo(minuteBadgeX, badgeY, minuteBadgeX + radius, badgeY);
            ctx.closePath();
            ctx.fill();
            
            // Green accent line on left of minute badge
            ctx.fillStyle = '#10b981';
            ctx.fillRect(minuteBadgeX, badgeY + 5 * scale, 4 * scale, badgeHeight - 10 * scale);
            
            // Minute text
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.fillText(minuteText, minuteBadgeX + 15 * scale, badgeY + badgeHeight / 2);
            
            // Convert to blob for upload
            const blob = await new Promise<Blob | null>((res) => {
              canvas.toBlob((b) => res(b), 'image/jpeg', 0.90);
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
            
            // Generate title (reuse eventLabel and minute from overlay)
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