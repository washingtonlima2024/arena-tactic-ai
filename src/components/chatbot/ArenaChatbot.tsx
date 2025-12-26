import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useArenaChatbot } from '@/hooks/useArenaChatbot';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  MessageCircle,
  X,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Minimize2,
  Maximize2,
  GripVertical,
  Sparkles,
  Bot,
  User,
  Loader2,
  Trash2,
} from 'lucide-react';

export function ArenaChatbot() {
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('match');
  
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [autoSpeak, setAutoSpeak] = useState(true);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch match context if we have a matchId
  const { data: matchContext } = useQuery({
    queryKey: ['chatbot-match-context', matchId],
    queryFn: async () => {
      if (!matchId) return null;
      
      const { data: match } = await supabase
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(name, short_name),
          away_team:teams!matches_away_team_id_fkey(name, short_name)
        `)
        .eq('id', matchId)
        .single();
      
      if (!match) return null;
      
      const { data: events } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .order('minute', { ascending: true });
      
      return {
        match,
        events: events || [],
        homeTeam: match.home_team?.name || 'Time Casa',
        awayTeam: match.away_team?.name || 'Time Visitante',
        homeScore: match.home_score || 0,
        awayScore: match.away_score || 0,
      };
    },
    enabled: !!matchId,
  });

  const {
    messages,
    isLoading,
    isPlaying,
    sendMessage,
    speakText,
    stopAudio,
    clearMessages,
  } = useArenaChatbot(matchContext);

  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    isSupported: voiceSupported,
  } = useSpeechRecognition();

  // Scroll to bottom on new messages - using viewport ref
  useEffect(() => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Update input with transcript
  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);
    }
  }, [transcript]);

  // Handle dragging with improved smoothness
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (chatContainerRef.current) {
      const rect = chatContainerRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      requestAnimationFrame(() => {
        const newX = window.innerWidth - (e.clientX - dragOffset.x) - (chatContainerRef.current?.offsetWidth || 384);
        const newY = window.innerHeight - (e.clientY - dragOffset.y) - (chatContainerRef.current?.offsetHeight || 512);

        setPosition({
          x: Math.max(0, Math.min(newX, window.innerWidth - 100)),
          y: Math.max(0, Math.min(newY, window.innerHeight - 100)),
        });
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleSendMessage = async () => {
    const messageToSend = inputValue.trim();
    if (!messageToSend) return;

    setInputValue('');
    resetTranscript();

    if (isListening) {
      stopListening();
    }

    const response = await sendMessage(messageToSend);
    
    if (response && autoSpeak) {
      speakText(response);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setIsMinimized(false);
    // Send greeting if no messages
    if (messages.length === 0) {
      setTimeout(() => {
        sendMessage('Olá! Me apresente a Arena Play e como você pode me ajudar.');
      }, 500);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="fixed z-50 group"
        style={{ right: position.x, bottom: position.y }}
      >
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-primary rounded-full blur-lg opacity-50 group-hover:opacity-80 transition-opacity animate-pulse" />
          
          {/* Button */}
          <div className="relative flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 border border-primary/30">
            <Bot className="w-8 h-8 text-primary-foreground" />
            
            {/* Pulse rings */}
            <div className="absolute inset-0 rounded-full border-2 border-primary/50 animate-ping" />
            <div className="absolute inset-0 rounded-full border border-primary/30 animate-pulse" />
          </div>

          {/* Label */}
          <div className="absolute -top-2 -right-2 bg-arena-emerald text-white text-xs px-2 py-0.5 rounded-full font-semibold shadow-md">
            AI
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      ref={chatContainerRef}
      className={cn(
        "fixed z-50 transition-all duration-300",
        isDragging && "cursor-grabbing select-none"
      )}
      style={{ right: position.x, bottom: position.y }}
    >
      <Card
        variant="glass"
        className={cn(
          "flex flex-col overflow-hidden shadow-2xl border-primary/30",
          "bg-background/50 backdrop-blur-xl",
          isMinimized ? "w-72 h-14" : "w-96 h-[32rem]",
          isDragging && "transition-none"
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-primary/20 border-b border-border/50 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="absolute inset-0 bg-primary rounded-full blur-sm opacity-50" />
              <div className="relative flex items-center justify-center w-8 h-8 bg-gradient-to-br from-primary to-primary/70 rounded-full">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">Arena Play AI</h3>
              {!isMinimized && (
                <p className="text-xs text-muted-foreground">Seu assistente tático</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
            
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? (
                <Maximize2 className="w-3.5 h-3.5" />
              ) : (
                <Minimize2 className="w-3.5 h-3.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Messages */}
            <ScrollArea className="flex-1 p-4" viewportRef={scrollViewportRef}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 bg-primary/30 rounded-full blur-xl animate-pulse" />
                    <div className="relative flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full border border-primary/30">
                      <Sparkles className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <h4 className="font-display font-semibold mb-2">Arena Play AI</h4>
                  <p className="text-sm text-muted-foreground max-w-[250px]">
                    Pergunte sobre análise tática, funcionalidades do sistema ou peça ajuda com qualquer recurso.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex gap-2",
                        message.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      {message.role === 'assistant' && (
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}
                      
                      <div
                        className={cn(
                          "max-w-[80%] px-3 py-2 rounded-2xl text-sm",
                          message.role === 'user'
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted/70 text-foreground rounded-bl-md"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        
                        {message.role === 'assistant' && message.content && (
                          <button
                            onClick={() => isPlaying ? stopAudio() : speakText(message.content)}
                            className="mt-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            {isPlaying ? (
                              <>
                                <VolumeX className="w-3 h-3" /> Parar
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3 h-3" /> Ouvir
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {message.role === 'user' && (
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                          <User className="w-4 h-4 text-secondary-foreground" />
                        </div>
                      )}
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex gap-2 justify-start">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-primary-foreground" />
                      </div>
                      <div className="bg-muted/70 px-4 py-2 rounded-2xl rounded-bl-md">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <div className="p-3 border-t border-border/50 bg-background/30">
              {/* Controls Row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={autoSpeak ? "arena" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setAutoSpeak(!autoSpeak)}
                  >
                    <Volume2 className="w-3 h-3 mr-1" />
                    {autoSpeak ? 'Voz On' : 'Voz Off'}
                  </Badge>

                  {isPlaying && (
                    <Badge variant="secondary" className="text-xs animate-pulse">
                      <Volume2 className="w-3 h-3 mr-1" />
                      Falando...
                    </Badge>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  onClick={clearMessages}
                  disabled={messages.length === 0}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Limpar
                </Button>
              </div>

              {/* Input Row */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isListening ? "Ouvindo..." : "Digite sua pergunta..."}
                    className={cn(
                      "pr-10 bg-background/50",
                      isListening && "border-primary ring-2 ring-primary/30"
                    )}
                    disabled={isLoading}
                  />
                  
                  {isListening && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <span className="flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
                      </span>
                    </div>
                  )}
                </div>

                {voiceSupported && (
                  <Button
                    variant={isListening ? "destructive" : "outline"}
                    size="icon"
                    onClick={toggleVoiceInput}
                    disabled={isLoading}
                    className="flex-shrink-0"
                  >
                    {isListening ? (
                      <MicOff className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </Button>
                )}

                <Button
                  variant="arena"
                  size="icon"
                  onClick={handleSendMessage}
                  disabled={isLoading || !inputValue.trim()}
                  className="flex-shrink-0"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
