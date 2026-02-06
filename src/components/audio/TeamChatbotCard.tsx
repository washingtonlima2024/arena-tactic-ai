import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Mic, 
  MicOff,
  Send, 
  Volume2, 
  VolumeX,
  Users,
  Loader2,
  Trash2
} from 'lucide-react';
import { useTeamChatbot } from '@/hooks/useTeamChatbot';
import { cn } from '@/lib/utils';

interface TeamChatbotCardProps {
  teamName: string;
  teamShort: string;
  teamType: 'home' | 'away';
  matchId: string;
  matchContext: {
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    events: any[];
    tacticalAnalysis?: string;
  };
}

export function TeamChatbotCard({ 
  teamName, 
  teamShort, 
  teamType,
  matchId,
  matchContext 
}: TeamChatbotCardProps) {
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const {
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
    speakWithBrowserTTS,
  } = useTeamChatbot(teamName, teamType, matchId);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    const message = inputValue;
    setInputValue('');
    await sendMessage(message, matchContext);
    
    // Scroll to bottom
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = async () => {
    if (isRecording) {
      await stopRecording(matchContext);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    } else {
      await startRecording();
    }
  };

  const colorClass = teamType === 'home' ? 'primary' : 'secondary';
  const bgClass = teamType === 'home' ? 'bg-primary' : 'bg-secondary';
  const bgLightClass = teamType === 'home' ? 'bg-primary/10' : 'bg-secondary/10';
  const textClass = teamType === 'home' ? 'text-primary' : 'text-secondary-foreground';

  return (
    <Card variant="glow" className="overflow-hidden flex flex-col h-[500px]">
      <div className={cn("h-2", bgClass)} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold",
              teamType === 'home' ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-secondary-foreground'
            )}>
              {teamShort.slice(0, 2)}
            </div>
            <div>
              <CardTitle className="text-base">Torcedor {teamName}</CardTitle>
              <CardDescription className="text-xs">Chatbot com voz</CardDescription>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" onClick={clearMessages}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Messages */}
        <ScrollArea className="flex-1 pr-3" ref={scrollRef}>
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Inicie uma conversa!</p>
                <p className="text-xs mt-1">Pergunte sobre a partida ou o time</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "flex gap-2",
                    msg.role === 'assistant' ? 'flex-row-reverse' : ''
                  )}
                >
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    msg.role === 'user' 
                      ? 'bg-muted' 
                      : teamType === 'home' ? 'bg-primary/20 text-primary' : 'bg-secondary/20'
                  )}>
                    {msg.role === 'user' ? <Users className="h-4 w-4" /> : teamShort.slice(0, 2)}
                  </div>
                  <div className={cn(
                    "rounded-lg p-3 max-w-[80%]",
                    msg.role === 'user' 
                      ? 'bg-muted' 
                      : bgLightClass
                  )}>
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                    {msg.role === 'assistant' && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="mt-2 h-6 text-xs"
                        onClick={() => {
                          if (isPlayingAudio) {
                            stopAudio();
                          } else if (msg.audioContent) {
                            playAudio(msg.audioContent);
                          } else {
                            speakWithBrowserTTS(msg.content);
                          }
                        }}
                      >
                        {isPlayingAudio ? (
                          <>
                            <VolumeX className="h-3 w-3 mr-1" />
                            Parar
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3 w-3 mr-1" />
                            Ouvir
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-2 flex-row-reverse">
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  teamType === 'home' ? 'bg-primary/20 text-primary' : 'bg-secondary/20'
                )}>
                  {teamShort.slice(0, 2)}
                </div>
                <div className={cn("rounded-lg p-3", bgLightClass)}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex gap-2">
          <Button
            variant={isRecording ? "destructive" : "outline"}
            size="icon"
            onClick={handleMicClick}
            disabled={isLoading}
            className={cn(isRecording && "animate-pulse")}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua mensagem..."
            disabled={isLoading || isRecording}
            className="flex-1"
          />
          <Button
            variant="arena"
            size="icon"
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
