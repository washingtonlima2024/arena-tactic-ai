import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

  // Load conversation from database
  const loadConversation = useCallback(async () => {
    if (!matchId) return;

    try {
      const { data, error } = await supabase
        .from('chatbot_conversations')
        .select('*')
        .eq('match_id', matchId)
        .eq('team_type', teamType)
        .maybeSingle();

      if (error) {
        console.error('Error loading conversation:', error);
        return;
      }

      if (data?.messages) {
        // Parse the messages from JSON
        const rawMessages = data.messages as unknown;
        const loadedMessages = Array.isArray(rawMessages) 
          ? (rawMessages as ChatMessage[])
          : [];
        setMessages(loadedMessages);
        console.log(`Loaded ${loadedMessages.length} messages for ${teamType} team`);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  }, [matchId, teamType]);

  // Save conversation to database
  const saveConversation = useCallback(async (messagesToSave: ChatMessage[]) => {
    if (!matchId) return;

    setIsSaving(true);
    try {
      // Remove audioContent from messages to save space (we don't persist audio)
      const messagesWithoutAudio = messagesToSave.map(({ audioContent, ...msg }) => ({
        ...msg,
        timestamp: msg.timestamp || new Date().toISOString()
      }));

      const { error } = await supabase
        .from('chatbot_conversations')
        .upsert({
          match_id: matchId,
          team_name: teamName,
          team_type: teamType,
          messages: messagesWithoutAudio,
        }, {
          onConflict: 'match_id,team_type'
        });

      if (error) {
        console.error('Error saving conversation:', error);
      }
    } catch (error) {
      console.error('Error saving conversation:', error);
    } finally {
      setIsSaving(false);
    }
  }, [matchId, teamName, teamType]);

  // Load conversation on mount
  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  const sendMessage = async (message: string, matchContext?: MatchContext) => {
    if (!message.trim()) return;

    setIsLoading(true);
    
    // Add user message immediately
    const userMessage: ChatMessage = { 
      role: 'user', 
      content: message,
      timestamp: new Date().toISOString()
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    try {
      const { data, error } = await supabase.functions.invoke('team-chatbot', {
        body: {
          message,
          teamName,
          teamType,
          matchContext,
          conversationHistory: messages,
        },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.text,
        audioContent: data.audioContent,
        timestamp: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);

      // Save to database
      await saveConversation(finalMessages);

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
      // Remove the user message on error
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
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          
          try {
            // Transcribe the audio
            const { data, error } = await supabase.functions.invoke('transcribe-audio', {
              body: { audio: base64Audio },
            });

            if (error) throw new Error(error.message);
            if (data.error) throw new Error(data.error);

            const transcribedText = data.text;
            
            if (transcribedText) {
              // Send the transcribed text as a message
              await sendMessage(transcribedText, matchContext);
            }
            
            resolve(transcribedText);
          } catch (error) {
            console.error('Transcription error:', error);
            toast({
              title: "Erro na transcrição",
              description: "Não foi possível transcrever o áudio.",
              variant: "destructive",
            });
            resolve(null);
          }
        };
        reader.readAsDataURL(audioBlob);
        
        // Stop all tracks
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.stop();
      setIsRecording(false);
    });
  }, [sendMessage, toast]);

  const playAudio = (audioContent: string) => {
    // Stop any currently playing audio
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
    
    // Also clear from database
    if (matchId) {
      try {
        await supabase
          .from('chatbot_conversations')
          .delete()
          .eq('match_id', matchId)
          .eq('team_type', teamType);
      } catch (error) {
        console.error('Error clearing conversation:', error);
      }
    }
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