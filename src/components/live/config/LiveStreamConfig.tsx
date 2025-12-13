import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle, 
  ChevronRight, 
  ChevronLeft,
  Settings,
  Send,
  Search,
  Play,
  Loader2
} from "lucide-react";
import { VideoSpecsCard } from "./VideoSpecsCard";
import { AudioChannelConfig } from "./AudioChannelConfig";
import { NtpSyncPanel } from "./NtpSyncPanel";
import { StreamValidationStatus } from "./StreamValidationStatus";
import { StreamMonitoringDashboard } from "./StreamMonitoringDashboard";
import { toast } from "sonner";

interface StreamConfig {
  streamUrl: string;
  videoSpecs: {
    resolution: string;
    aspectRatio: string;
    scanType: string;
    codec: string;
    frameRate: number;
    bitrate: number;
  };
  audioChannels: Array<{
    channel: number;
    type: string;
    label: string;
    active: boolean;
    level: number;
  }>;
  ntpServer: string;
  ntpOffsetMs: number;
  ntpLastSync: Date | null;
}

const STEPS = [
  { id: 1, title: "Preparação", description: "Verificar specs técnicas" },
  { id: 2, title: "Submissão", description: "Enviar URL da transmissão" },
  { id: 3, title: "Validação", description: "Verificação automática" },
  { id: 4, title: "Ativação", description: "Iniciar ingestão" },
];

const DEFAULT_CONFIG: StreamConfig = {
  streamUrl: "",
  videoSpecs: {
    resolution: "720p",
    aspectRatio: "16:9",
    scanType: "progressive",
    codec: "H.264",
    frameRate: 30,
    bitrate: 5000,
  },
  audioChannels: [
    { channel: 1, type: "narration", label: "Narração Principal", active: true, level: -6 },
    { channel: 2, type: "ambient", label: "Áudio Ambiente", active: true, level: -12 },
    { channel: 3, type: "commentary", label: "Comentarista", active: true, level: -6 },
    { channel: 4, type: "effects", label: "Reserva/Efeitos", active: false, level: -18 },
  ],
  ntpServer: "pool.ntp.org",
  ntpOffsetMs: 0,
  ntpLastSync: null,
};

export function LiveStreamConfig() {
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState<StreamConfig>(DEFAULT_CONFIG);
  const [isValidating, setIsValidating] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isLive, setIsLive] = useState(false);

  type ValidationStatus = "pending" | "checking" | "ok" | "warning" | "error";
  
  const [validations, setValidations] = useState<Array<{
    id: string;
    label: string;
    status: ValidationStatus;
    message?: string;
  }>>([
    { id: "video", label: "Vídeo: Resolução, Frame Rate, Codec", status: "pending" },
    { id: "audio", label: "Áudio: Canais, Níveis, Sincronização", status: "pending" },
    { id: "time", label: "Tempo: Alinhamento NTP", status: "pending" },
    { id: "network", label: "Rede: Estabilidade e Latência", status: "pending" },
  ]);

  const [metrics, setMetrics] = useState({
    ingestRate: 5200,
    videoQuality: 95,
    audioQuality: 98,
    latency: 85,
    uptime: 0,
    bufferHealth: 92,
  });

  const [alerts, setAlerts] = useState<Array<{ id: string; type: "warning" | "error"; message: string; timestamp: Date }>>([]);

  const handleNext = () => {
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleValidate = async () => {
    setIsValidating(true);
    
    // Simulate validation process
    for (let i = 0; i < validations.length; i++) {
      setValidations(prev => prev.map((v, idx) => 
        idx === i ? { ...v, status: "checking" as const } : v
      ));
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setValidations(prev => prev.map((v, idx) => 
        idx === i ? { ...v, status: "ok" as const, message: "Validado com sucesso" } : v
      ));
    }
    
    setIsValidating(false);
    toast.success("Validação concluída com sucesso!");
    handleNext();
  };

  const handleActivate = async () => {
    setIsActivating(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsActivating(false);
    setIsLive(true);
    toast.success("Transmissão ativada com sucesso!");
  };

  const handleNtpSync = async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    setConfig(prev => ({
      ...prev,
      ntpOffsetMs: Math.floor(Math.random() * 30) - 15,
      ntpLastSync: new Date(),
    }));
    toast.success("Sincronização NTP concluída!");
  };

  const overallValidationStatus = validations.every(v => v.status === "ok") ? "active" : 
    validations.some(v => v.status === "error") ? "error" :
    validations.some(v => v.status === "checking") ? "validating" : "pending";

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <Card variant="glass">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
                    ${currentStep > step.id ? "bg-primary text-primary-foreground" :
                      currentStep === step.id ? "bg-primary/20 border-2 border-primary text-primary" :
                      "bg-muted text-muted-foreground"
                    }
                  `}>
                    {currentStep > step.id ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      step.id
                    )}
                  </div>
                  <p className="text-xs font-medium mt-2">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`w-16 md:w-24 h-0.5 mx-2 ${
                    currentStep > step.id ? "bg-primary" : "bg-muted"
                  }`} />
                )}
              </div>
            ))}
          </div>
          <Progress value={(currentStep / 4) * 100} className="h-1" />
        </CardContent>
      </Card>

      {/* Step Content */}
      {currentStep === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VideoSpecsCard
            specs={config.videoSpecs}
            onSpecsChange={(specs) => setConfig(prev => ({ ...prev, videoSpecs: specs }))}
          />
          <AudioChannelConfig
            channels={config.audioChannels}
            onChannelsChange={(channels) => setConfig(prev => ({ ...prev, audioChannels: channels }))}
          />
          <div className="lg:col-span-2">
            <NtpSyncPanel
              ntpServer={config.ntpServer}
              offsetMs={config.ntpOffsetMs}
              lastSync={config.ntpLastSync}
              onServerChange={(server) => setConfig(prev => ({ ...prev, ntpServer: server }))}
              onSync={handleNtpSync}
            />
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Submissão do Link de Transmissão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="streamUrl">URL da Transmissão</Label>
              <Input
                id="streamUrl"
                value={config.streamUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, streamUrl: e.target.value }))}
                placeholder="https://streaming.example.com/live/..."
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Formatos suportados: YouTube Live, Twitch, HLS (.m3u8), Embed URL
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-4 rounded-lg border bg-muted/30">
                <p className="text-sm font-medium mb-2">Especificações Configuradas</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Resolução: {config.videoSpecs.resolution}</li>
                  <li>• Codec: {config.videoSpecs.codec}</li>
                  <li>• Canais de áudio: {config.audioChannels.filter(c => c.active).length}/4</li>
                  <li>• NTP: {config.ntpLastSync ? "Sincronizado" : "Pendente"}</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg border bg-primary/10">
                <p className="text-sm font-medium mb-2">Próximo Passo</p>
                <p className="text-xs text-muted-foreground">
                  Após inserir o link, o sistema realizará validação automática de conformidade com as especificações ESPN.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StreamValidationStatus
            validations={validations}
            overallStatus={overallValidationStatus}
            onValidate={handleValidate}
            isValidating={isValidating}
          />
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Verificação de Conformidade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                O sistema está verificando automaticamente a conformidade da transmissão com as especificações técnicas definidas.
              </p>
              
              <Button 
                onClick={handleValidate} 
                disabled={isValidating}
                className="w-full"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validando...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Iniciar Validação
                  </>
                )}
              </Button>

              <div className="p-3 rounded-lg bg-muted/30 border">
                <p className="text-xs text-muted-foreground">
                  <strong>Verificações incluídas:</strong>
                </p>
                <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                  <li>• Vídeo: Resolução, Frame Rate, Codec</li>
                  <li>• Áudio: Canais ativos, níveis, sincronização</li>
                  <li>• Tempo: Alinhamento com servidor NTP</li>
                  <li>• Rede: Estabilidade de conexão e latência</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {currentStep === 4 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card variant="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5 text-primary" />
                Ativação da Transmissão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <p className="font-medium text-green-400">Sistema Validado</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Todas as verificações foram concluídas com sucesso. A transmissão está pronta para ser ativada.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Resumo da Configuração</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-muted-foreground">URL:</span>
                    <p className="font-mono truncate">{config.streamUrl || "Não configurado"}</p>
                  </div>
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-muted-foreground">Resolução:</span>
                    <p>{config.videoSpecs.resolution}</p>
                  </div>
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-muted-foreground">Áudio:</span>
                    <p>{config.audioChannels.filter(c => c.active).length} canais</p>
                  </div>
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-muted-foreground">NTP Offset:</span>
                    <p>{config.ntpOffsetMs}ms</p>
                  </div>
                </div>
              </div>

              <Button 
                onClick={handleActivate}
                disabled={isActivating || isLive}
                className="w-full"
                variant={isLive ? "outline" : "default"}
              >
                {isActivating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Ativando...
                  </>
                ) : isLive ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Transmissão Ativa
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Ativar Transmissão
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <StreamMonitoringDashboard
            metrics={metrics}
            alerts={alerts}
            isLive={isLive}
          />
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentStep === 1}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Anterior
        </Button>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline">Passo {currentStep} de 4</Badge>
        </div>

        <Button
          onClick={handleNext}
          disabled={currentStep === 4}
        >
          Próximo
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
