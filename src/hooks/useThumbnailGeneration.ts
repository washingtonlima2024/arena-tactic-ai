import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';
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
      const data = await apiClient.getThumbnails(matchId);

      if (data && data.length > 0) {
        const loaded: Record<string, ThumbnailData> = {};
        data.forEach((thumb: any) => {
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

  // Extract frame from video using canvas and upload to local storage
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
              goal: { bg: '#10b981', text: '#ffffff' },
              shot: { bg: '#f59e0b', text: '#ffffff' },
              shot_on_target: { bg: '#f59e0b', text: '#ffffff' },
              save: { bg: '#3b82f6', text: '#ffffff' },
              foul: { bg: '#ef4444', text: '#ffffff' },
              yellow_card: { bg: '#eab308', text: '#000000' },
              red_card: { bg: '#dc2626', text: '#ffffff' },
              corner: { bg: '#8b5cf6', text: '#ffffff' },
              penalty: { bg: '#ec4899', text: '#ffffff' },
              offside: { bg: '#6366f1', text: '#ffffff' },
            };
            const colors = badgeColors[eventType] || { bg: '#10b981', text: '#ffffff' };
            
            const scale = canvas.width / 1280;
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
            
            // Minute badge background
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
            
            // Green accent line
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
            
            // Upload to local storage
            const fileName = `${eventId}-frame.jpg`;
            const uploadResult = await apiClient.uploadBlob(eventMatchId, 'images', blob, fileName);
            
            const imageUrl = uploadResult.url;
            const title = `${eventLabel} - ${minute}'`;
            
            // Save to database
            await apiClient.createThumbnail({
              event_id: eventId,
              match_id: eventMatchId,
              image_url: imageUrl,
              event_type: eventType,
              title
            });
            
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

      const data = await apiClient.generateThumbnailAI({
        prompt, 
        eventId,
        matchId: eventMatchId,
        eventType
      });

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

  const generateAllThumbnails = async (events: Array<{
    id: string;
    event_type: string;
    minute: number | null;
    description?: string | null;
  }>, homeTeam: string, awayTeam: string, homeScore: number, awayScore: number, eventMatchId: string) => {
    const eventsToGenerate = events.filter(e => !thumbnails[e.id] && !generatingIds.has(e.id));
    
    for (const event of eventsToGenerate) {
      await generateThumbnail({
        eventId: event.id,
        eventType: event.event_type,
        minute: event.minute || 0,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        matchId: eventMatchId,
        description: event.description || undefined
      });
      // Small delay between generations
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  const extractAllFrames = async (events: Array<{
    id: string;
    event_type: string;
    minute: number | null;
    second?: number | null;
  }>, videoUrl: string, eventMatchId: string, videoStartMinute: number = 0) => {
    const eventsToExtract = events.filter(e => !thumbnails[e.id] && !extractingIds.has(e.id));
    
    for (const event of eventsToExtract) {
      const eventMinute = event.minute || 0;
      const eventSecond = event.second || 0;
      const timestamp = ((eventMinute - videoStartMinute) * 60) + eventSecond;
      
      await extractFrameFromVideo({
        eventId: event.id,
        eventType: event.event_type,
        videoUrl,
        timestamp: Math.max(0, timestamp),
        matchId: eventMatchId
      });
      // Small delay between extractions
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  return {
    thumbnails,
    isLoading,
    generatingIds,
    extractingIds,
    loadThumbnails,
    generateThumbnail,
    extractFrameFromVideo,
    generateAllThumbnails,
    extractAllFrames,
    getThumbnail: (eventId: string) => thumbnails[eventId] || null,
    hasThumbnail: (eventId: string) => !!thumbnails[eventId],
    isGenerating: (eventId: string) => generatingIds.has(eventId),
    isExtracting: (eventId: string) => extractingIds.has(eventId)
  };
}
