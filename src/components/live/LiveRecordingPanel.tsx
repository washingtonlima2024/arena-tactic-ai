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
  AlertCircle
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface LiveRecordingPanelProps {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  hasVideoSource: boolean;
  hasMatchInfo: boolean;
  currentMatchId?: string | null;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onAddManualEvent: (type: string) => void;
}

export const LiveRecordingPanel = ({
  isRecording,
  isPaused,
  recordingTime,
  hasVideoSource,
  hasMatchInfo,
  currentMatchId,
  onStart,
  onStop,
  onPause,
  onResume,
  onFinish,
  onAddManualEvent,
}: LiveRecordingPanelProps) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const canStart = hasVideoSource && hasMatchInfo && !isRecording;
  const canAddEvents = isRecording && currentMatchId;

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

      {/* Quick Event Buttons */}
      {isRecording && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground text-center">
            Adicionar Evento Rápido
          </h4>
          
          {!canAddEvents && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Aguarde o match ID ser gerado antes de adicionar eventos
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button
              variant="outline"
              onClick={() => onAddManualEvent("goal_home")}
              disabled={!canAddEvents}
              className="h-12 border-green-500/50 hover:bg-green-500/10 disabled:opacity-50"
            >
              ⚽ Gol Casa
            </Button>
            <Button
              variant="outline"
              onClick={() => onAddManualEvent("goal_away")}
              disabled={!canAddEvents}
              className="h-12 border-green-500/50 hover:bg-green-500/10 disabled:opacity-50"
            >
              ⚽ Gol Fora
            </Button>
            <Button
              variant="outline"
              onClick={() => onAddManualEvent("yellow_card")}
              disabled={!canAddEvents}
              className="h-12 border-yellow-500/50 hover:bg-yellow-500/10 disabled:opacity-50"
            >
              🟨 Cartão Amarelo
            </Button>
            <Button
              variant="outline"
              onClick={() => onAddManualEvent("red_card")}
              disabled={!canAddEvents}
              className="h-12 border-red-500/50 hover:bg-red-500/10 disabled:opacity-50"
            >
              🟥 Cartão Vermelho
            </Button>
            <Button
              variant="outline"
              onClick={() => onAddManualEvent("shot")}
              disabled={!canAddEvents}
              className="h-12 disabled:opacity-50"
            >
              <Target className="h-4 w-4 mr-2" />
              Finalização
            </Button>
            <Button
              variant="outline"
              onClick={() => onAddManualEvent("foul")}
              disabled={!canAddEvents}
              className="h-12 disabled:opacity-50"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Falta
            </Button>
            <Button
              variant="outline"
              onClick={() => onAddManualEvent("substitution")}
              disabled={!canAddEvents}
              className="h-12 disabled:opacity-50"
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Substituição
            </Button>
            <Button
              variant="outline"
              onClick={() => onAddManualEvent("halftime")}
              disabled={!canAddEvents}
              className="h-12 disabled:opacity-50"
            >
              <Timer className="h-4 w-4 mr-2" />
              Intervalo
            </Button>
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