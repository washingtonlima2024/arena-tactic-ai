import { useState, useRef, useCallback, useMemo } from 'react';
import { apiClient } from '@/lib/apiClient';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface MatchContext {
  match: any;
  events: any[];
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export function useArenaChatbot(matchContext?: MatchContext | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const generateId = () => Math.random().toString(36).substring(7);

  // Build context string for the AI
  const contextString = useMemo(() => {
    if (!matchContext) return '';
    
    const { homeTeam, awayTeam, homeScore, awayScore, events, match } = matchContext;
    
    let ctx = `\n\n[CONTEXTO DA PARTIDA ATUAL]\n`;
    ctx += `Partida: ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}\n`;
    
    if (match?.competition) {
      ctx += `Competição: ${match.competition}\n`;
    }
    if (match?.match_date) {
      ctx += `Data: ${new Date(match.match_date).toLocaleDateString('pt-BR')}\n`;
    }
    if (match?.status) {
      ctx += `Status: ${match.status}\n`;
    }
    
    if (events && events.length > 0) {
      ctx += `\nEventos da partida (${events.length} total):\n`;
      events.slice(0, 20).forEach(e => {
        ctx += `- ${e.minute || 0}': ${e.event_type} - ${e.description || ''}\n`;
      });
      if (events.length > 20) {
        ctx += `... e mais ${events.length - 20} eventos\n`;
      }
    }
    
    return ctx;
  }, [matchContext]);

  // Fallback to Lovable Cloud edge function
  const sendViaCloud = useCallback(async (
    message: string,
    conversationHistory: { role: string; content: string }[]
  ): Promise<string | null> => {
    console.log('[ArenaChatbot] Using Lovable Cloud fallback...');
    
    try {
      const { data, error } = await supabase.functions.invoke('arena-chatbot', {
        body: {
          message,
          matchContext: matchContext ? {
            homeTeam: matchContext.homeTeam,
            awayTeam: matchContext.awayTeam,
            homeScore: matchContext.homeScore,
            awayScore: matchContext.awayScore,
            competition: matchContext.match?.competition,
            status: matchContext.match?.status,
          } : undefined,
          conversationHistory,
        },
      });

      if (error) {
        console.error('[ArenaChatbot] Cloud error:', error);
        throw new Error(error.message || 'Erro no serviço de IA');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data?.text || null;
    } catch (error) {
      console.error('[ArenaChatbot] Cloud fallback failed:', error);
      throw error;
    }
  }, [matchContext]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Add context to first message or when asking about the match
    let enrichedText = text;
    if (contextString && (messages.length === 0 || text.toLowerCase().includes('partida') || text.toLowerCase().includes('jogo'))) {
      enrichedText = text + contextString;
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      let responseText: string | null = null;

      // Try local server first
      try {
        const data = await apiClient.chatbot({
          message: enrichedText,
          matchContext: matchContext ? {
            homeTeam: matchContext.homeTeam,
            awayTeam: matchContext.awayTeam,
            homeScore: matchContext.homeScore,
            awayScore: matchContext.awayScore,
            competition: matchContext.match?.competition,
            status: matchContext.match?.status,
          } : undefined,
          conversationHistory,
        });
        responseText = data.text;
      } catch (localError) {
        console.warn('[ArenaChatbot] Local server failed, trying cloud fallback:', localError);
        
        // Fallback to Lovable Cloud
        responseText = await sendViaCloud(enrichedText, conversationHistory);
      }

      if (responseText) {
        const assistantMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: responseText,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, assistantMessage]);
        return responseText;
      }

      throw new Error('Não foi possível obter resposta do assistente');
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, contextString, matchContext, sendViaCloud]);

  const speakText = useCallback(async (text: string) => {
    if (!text || isPlaying) return;

    setIsPlaying(true);
    try {
      // Try local TTS first
      let audioContent: string | undefined;
      
      try {
        const data = await apiClient.tts({ text, voice: 'onyx' });
        audioContent = data?.audioContent;
      } catch {
        // TTS not available without local server, use browser TTS
        console.log('[ArenaChatbot] Using browser TTS fallback');
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'pt-BR';
          utterance.onend = () => setIsPlaying(false);
          utterance.onerror = () => setIsPlaying(false);
          window.speechSynthesis.speak(utterance);
          return;
        }
        throw new Error('TTS não disponível');
      }

      if (audioContent) {
        const audioData = atob(audioContent);
        const audioArray = new Uint8Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          audioArray[i] = audioData.charCodeAt(i);
        }
        const blob = new Blob([audioArray], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(blob);

        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(audioUrl);
        };

        audio.onerror = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(audioUrl);
        };

        await audio.play();
      }
    } catch (error) {
      console.error('TTS error:', error);
      toast.error('Erro ao reproduzir áudio');
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
    // Also stop browser TTS if active
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    stopAudio();
  }, [stopAudio]);

  return {
    messages,
    isLoading,
    isPlaying,
    sendMessage,
    speakText,
    stopAudio,
    clearMessages,
  };
}
