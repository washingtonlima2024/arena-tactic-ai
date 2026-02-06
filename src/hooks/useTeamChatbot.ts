import { useState, useRef, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  audioContent?: string;
  timestamp?: string;
}

interface MatchContext {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  events: any[];
  tacticalAnalysis?: string;
}

export function useTeamChatbot(teamName: string, teamType: 'home' | 'away', matchId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  // Load conversation - simplified for local API
  const loadConversation = useCallback(async () => {
    // Local API doesn't persist chatbot conversations by default
    // This could be extended to store in localStorage or the API
  }, [matchId, teamType]);

  // Save conversation - simplified for local API
  const saveConversation = useCallback(async (messagesToSave: ChatMessage[]) => {
    // Could extend to save to localStorage or API
  }, [matchId, teamName, teamType]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  const sendMessage = async (message: string, matchContext?: MatchContext) => {
    if (!message.trim()) return;

    setIsLoading(true);
    
    const userMessage: ChatMessage = { 
      role: 'user', 
      content: message,
      timestamp: new Date().toISOString()
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const data = await apiClient.teamChatbot({
        message,
        teamName,
        teamType,
        matchContext: matchContext ? {
          homeTeam: matchContext.homeTeam,
          awayTeam: matchContext.awayTeam,
          homeScore: matchContext.homeScore,
          awayScore: matchContext.awayScore,
        } : undefined,
        conversationHistory,
        withAudio: true,
      });

      // Clean markdown asterisks and emojis from response
      const cleanText = (data.text || '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/#{1,6}\s?/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{200D}\u{20E3}\u{FE00}-\u{FE0F}]/gu, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: cleanText,
        audioContent: data.audioContent,
        timestamp: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);

      // Auto-play audio response
      if (data.audioContent) {
        playAudio(data.audioContent);
      }

      return data;
    } catch (error) {
      console.error('Chatbot error:', error);
      toast({
        title: "Erro no chatbot",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
      setMessages(messages);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Erro ao acessar microfone",
        description: "Verifique as permissões do navegador.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopRecording = useCallback(async (matchContext?: MatchContext) => {
    return new Promise<string | null>((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // For now, just show a message that voice recording needs transcription endpoint
        toast({
          title: "Recurso em desenvolvimento",
          description: "Transcrição de voz será implementada em breve.",
        });
        
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
        resolve(null);
      };

      mediaRecorderRef.current.stop();
      setIsRecording(false);
    });
  }, [toast]);

  const playAudio = (audioContent: string) => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    const audio = document.createElement('audio') as HTMLAudioElement;
    audio.src = `data:audio/mp3;base64,${audioContent}`;
    
    audio.onplay = () => setIsPlayingAudio(true);
    audio.onended = () => setIsPlayingAudio(false);
    audio.onerror = () => setIsPlayingAudio(false);
    
    currentAudioRef.current = audio;
    audio.play();
  };

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setIsPlayingAudio(false);
    }
  };

  const clearMessages = async () => {
    setMessages([]);
  };

  return {
    messages,
    isLoading,
    isRecording,
    isPlayingAudio,
    isSaving,
    sendMessage,
    startRecording,
    stopRecording,
    playAudio,
    stopAudio,
    clearMessages,
    reloadConversation: loadConversation,
  };
}
