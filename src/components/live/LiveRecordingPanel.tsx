import { Button } from "@/components/ui/button";
import { 
  Play, 
  Square, 
  Pause, 
  CircleDot, 
  Flag, 
  AlertTriangle,
  ArrowRightLeft,
  Timer,
  Target,
  AlertCircle,
  StopCircle
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface LiveRecordingPanelProps {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  hasVideoSource: boolean;
  hasMatchInfo: boolean;
  currentMatchId?: string | null;
  isClipRecording: boolean;
  clipEventType: string | null;
  clipStartTime: number | null;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onAddManualEvent: (type: string) => void;
  onStartClip: (type: string) => void;
  onFinishClip: () => void;
}

export const LiveRecordingPanel = ({
  isRecording,
  isPaused,
  recordingTime,
  hasVideoSource,
  hasMatchInfo,
  currentMatchId,
  isClipRecording,
  clipEventType,
  clipStartTime,
  onStart,
  onStop,
  onPause,
  onResume,
  onFinish,
  onAddManualEvent,
  onStartClip,
  onFinishClip,
}: LiveRecordingPanelProps) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const canStart = hasVideoSource && hasMatchInfo && !isRecording;
  const canAddEvents = isRecording && currentMatchId;
  
  // Calculate clip duration if recording
  const clipDuration = isClipRecording && clipStartTime !== null 
    ? recordingTime - clipStartTime 
    : 0;

  // Event button component with 2-click logic
  const EventButton = ({ 
    eventType, 
    label, 
    emoji, 
    icon: Icon,
    borderColor = "border-muted"
  }: { 
    eventType: string; 
    label: string; 
    emoji?: string; 
    icon?: React.ComponentType<{ className?: string }>;
    borderColor?: string;
  }) => {
    const isRecordingThis = isClipRecording && clipEventType === eventType;
    const isDisabled = !canAddEvents || (isClipRecording && clipEventType !== eventType);
    
    return (
      <Button
        variant="outline"
        onClick={() => {
          if (isRecordingThis) {
            onFinishClip();
          } else if (!isClipRecording) {
            onStartClip(eventType);
          }
        }}
        disabled={isDisabled}
        className={cn(
          "h-14 transition-all duration-200",
          borderColor,
          isRecordingThis && "animate-pulse bg-red-500/20 border-red-500 text-red-400",
          isDisabled && "opacity-50"
        )}
      >
        {isRecordingThis ? (
          <div className="flex items-center gap-2">
            <StopCircle className="h-4 w-4 text-red-500 animate-pulse" />
            <span>Finalizar ({formatTime(clipDuration)})</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {emoji && <span>{emoji}</span>}
            {Icon && <Icon className="h-4 w-4" />}
            <span>{label}</span>
          </div>
        )}
      </Button>
    );
  };

  return (
    <div className="glass-card p-6 rounded-xl space-y-6">
      {/* Timer Display */}
      <div className="text-center">
        <div className="text-5xl font-mono font-bold text-foreground">
          {formatTime(recordingTime)}
        </div>
        <p className="text-muted-foreground mt-1">
          {isRecording ? (isPaused ? "Pausado" : "Gravando...") : "Pronto para iniciar"}
        </p>
        {isRecording && currentMatchId && (
          <p className="text-xs text-green-500 mt-1">
            ✓ Match ID: {currentMatchId.slice(0, 8)}...
          </p>
        )}
        {isClipRecording && (
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-sm animate-pulse">
              <CircleDot className="h-3 w-3" />
              Gravando clip: {clipEventType} ({formatTime(clipDuration)})
            </span>
          </div>
        )}
      </div>

      {/* Main Controls */}
      <div className="flex justify-center gap-4">
        {!isRecording ? (
          <Button
            size="lg"
            onClick={onStart}
            disabled={!canStart}
            className="h-16 px-8 text-lg bg-red-600 hover:bg-red-700"
          >
            <CircleDot className="h-6 w-6 mr-2 animate-pulse" />
            Iniciar Transmissão
          </Button>
        ) : (
          <>
            {isPaused ? (
              <Button size="lg" onClick={onResume} className="h-14 px-6">
                <Play className="h-5 w-5 mr-2" />
                Continuar
              </Button>
            ) : (
              <Button size="lg" variant="outline" onClick={onPause} className="h-14 px-6">
                <Pause className="h-5 w-5 mr-2" />
                Pausar
              </Button>
            )}
            <Button size="lg" variant="destructive" onClick={onStop} className="h-14 px-6">
              <Square className="h-5 w-5 mr-2" />
              Parar
            </Button>
            <Button 
              size="lg" 
              variant="secondary" 
              onClick={onFinish} 
              className="h-14 px-6"
            >
              <Flag className="h-5 w-5 mr-2" />
              Finalizar Partida
            </Button>
          </>
        )}
      </div>

      {/* Quick Event Buttons - 2-Click System */}
      {isRecording && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground text-center">
            Marcar Evento (2 cliques: início → fim)
          </h4>
          
          {!canAddEvents && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Aguarde o match ID ser gerado antes de adicionar eventos
              </AlertDescription>
            </Alert>
          )}
          
          {isClipRecording && (
            <Alert className="mb-3 border-red-500/50 bg-red-500/10">
              <CircleDot className="h-4 w-4 text-red-500 animate-pulse" />
              <AlertDescription className="text-red-400">
                Clique no mesmo botão para finalizar o clip ou em outro para cancelar e começar novo
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <EventButton 
              eventType="goal_home" 
              label="Gol Casa" 
              emoji="⚽" 
              borderColor="border-green-500/50 hover:bg-green-500/10"
            />
            <EventButton 
              eventType="goal_away" 
              label="Gol Fora" 
              emoji="⚽" 
              borderColor="border-green-500/50 hover:bg-green-500/10"
            />
            <EventButton 
              eventType="yellow_card" 
              label="Amarelo" 
              emoji="🟨" 
              borderColor="border-yellow-500/50 hover:bg-yellow-500/10"
            />
            <EventButton 
              eventType="red_card" 
              label="Vermelho" 
              emoji="🟥" 
              borderColor="border-red-500/50 hover:bg-red-500/10"
            />
            <EventButton 
              eventType="shot" 
              label="Finalização" 
              icon={Target}
            />
            <EventButton 
              eventType="foul" 
              label="Falta" 
              icon={AlertTriangle}
            />
            <EventButton 
              eventType="substitution" 
              label="Substituição" 
              icon={ArrowRightLeft}
            />
            <EventButton 
              eventType="halftime" 
              label="Intervalo" 
              icon={Timer}
            />
          </div>
        </div>
      )}

      {/* Validation Messages */}
      {!hasVideoSource && (
        <p className="text-center text-sm text-yellow-500">
          ⚠️ Configure uma fonte de vídeo (stream ou câmera)
        </p>
      )}
      {!hasMatchInfo && hasVideoSource && (
        <p className="text-center text-sm text-yellow-500">
          ⚠️ Preencha os times da partida
        </p>
      )}
    </div>
  );
};
