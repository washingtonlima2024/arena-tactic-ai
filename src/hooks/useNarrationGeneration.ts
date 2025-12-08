import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NarrationResult {
  script: string;
  audioUrl: string;
  voice: string;
}

export function useNarrationGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [narration, setNarration] = useState<NarrationResult | null>(null);
  const { toast } = useToast();

  // Load saved narration for a match
  const loadNarration = async (matchId: string, voice: string) => {
    try {
      const { data, error } = await supabase
        .from('generated_audio')
        .select('*')
        .eq('match_id', matchId)
        .eq('audio_type', 'narration')
        .eq('voice', voice)
        .maybeSingle();

      if (error) throw error;

      if (data?.audio_url) {
        setNarration({
          script: data.script || '',
          audioUrl: data.audio_url,
          voice: data.voice || voice,
        });
        return data;
      }
      
      setNarration(null);
      return null;
    } catch (error) {
      console.error('Error loading narration:', error);
      return null;
    }
  };

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

      // Upload audio to storage
      const audioBlob = base64ToBlob(data.audioContent, 'audio/mp3');
      const fileName = `narration-${matchId}-${voice}-${Date.now()}.mp3`;
      
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
      const { error: dbError } = await supabase
        .from('generated_audio')
        .upsert({
          match_id: matchId,
          audio_type: 'narration',
          voice: voice,
          script: data.script,
          audio_url: audioUrl,
        }, {
          onConflict: 'match_id,audio_type,voice',
        });

      if (dbError) throw dbError;

      const result = {
        script: data.script,
        audioUrl: audioUrl,
        voice: data.voice,
      };

      setNarration(result);
      
      toast({
        title: "Narração gerada!",
        description: "A narração da partida foi criada e salva com sucesso.",
      });

      return result;
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

  const downloadAudio = (audioUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = filename;
    link.target = '_blank';
    link.click();
  };

  return {
    isGenerating,
    narration,
    generateNarration,
    loadNarration,
    downloadAudio,
  };
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
