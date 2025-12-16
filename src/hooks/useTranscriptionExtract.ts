import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExtractResult {
  srtContent: string;
  transcribedText: string;
  method: string;
}

export function useTranscriptionExtract() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);

  const extractFromVideo = async (videoUrl: string, matchId?: string): Promise<ExtractResult | null> => {
    setIsExtracting(true);
    setProgress(10);

    try {
      toast.info('Extraindo áudio do vídeo...', { duration: 3000 });
      setProgress(30);

      const { data, error } = await supabase.functions.invoke('extract-audio-srt', {
        body: { 
          videoUrl,
          matchId,
        },
      });

      setProgress(90);

      if (error) {
        console.error('Error extracting transcription:', error);
        toast.error('Erro ao extrair transcrição: ' + error.message);
        return null;
      }

      if (!data?.success) {
        toast.error(data?.error || 'Erro ao processar áudio');
        return null;
      }

      setProgress(100);
      
      const result: ExtractResult = {
        srtContent: data.srtContent || '',
        transcribedText: data.transcribedText || '',
        method: data.method || 'whisper',
      };

      const lineCount = result.srtContent.split('\n\n').filter(b => b.trim()).length;
      toast.success(`Transcrição extraída! ${lineCount} segmentos detectados.`);

      return result;
    } catch (error: any) {
      console.error('Error in extractFromVideo:', error);
      toast.error('Erro ao extrair transcrição');
      return null;
    } finally {
      setIsExtracting(false);
      setProgress(0);
    }
  };

  const extractFromEmbed = async (embedUrl: string, matchId: string): Promise<ExtractResult | null> => {
    setIsExtracting(true);
    setProgress(10);

    try {
      toast.info('Gerando transcrição baseada em eventos...', { duration: 3000 });
      setProgress(50);

      const { data, error } = await supabase.functions.invoke('extract-audio-srt', {
        body: { 
          embedUrl,
          matchId,
        },
      });

      setProgress(90);

      if (error) {
        console.error('Error extracting from embed:', error);
        toast.error('Erro ao gerar transcrição: ' + error.message);
        return null;
      }

      if (!data?.success) {
        toast.error(data?.error || 'Erro ao processar embed');
        return null;
      }

      setProgress(100);

      return {
        srtContent: data.srtContent || '',
        transcribedText: data.transcribedText || '',
        method: data.method || 'events',
      };
    } catch (error: any) {
      console.error('Error in extractFromEmbed:', error);
      toast.error('Erro ao gerar transcrição');
      return null;
    } finally {
      setIsExtracting(false);
      setProgress(0);
    }
  };

  return {
    extractFromVideo,
    extractFromEmbed,
    isExtracting,
    progress,
  };
}
