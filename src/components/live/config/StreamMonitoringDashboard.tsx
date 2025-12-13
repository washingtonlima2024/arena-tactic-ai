import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  Gauge, 
  Clock, 
  Server,
  AlertTriangle,
  TrendingUp,
  TrendingDown
} from "lucide-react";

interface StreamMetrics {
  ingestRate: number; // kbps
  videoQuality: number; // 0-100
  audioQuality: number; // 0-100
  latency: number; // ms
  uptime: number; // seconds
  bufferHealth: number; // 0-100
}

interface Alert {
  id: string;
  type: "warning" | "error";
  message: string;
  timestamp: Date;
}

interface StreamMonitoringDashboardProps {
  metrics: StreamMetrics;
  alerts: Alert[];
  isLive: boolean;
}

export function StreamMonitoringDashboard({ 
  metrics, 
  alerts, 
  isLive 
}: StreamMonitoringDashboardProps) {
  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getQualityColor = (value: number) => {
    if (value >= 80) return "text-green-500";
    if (value >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getQualityBg = (value: number) => {
    if (value >= 80) return "bg-green-500";
    if (value >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Monitoramento em Tempo Real
          </CardTitle>
          {isLive ? (
            <Badge className="bg-red-500 animate-pulse">
              <span className="mr-1">●</span> AO VIVO
            </Badge>
          ) : (
            <Badge variant="outline">Offline</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Ingest Rate */}
          <div className="p-3 rounded-lg border bg-background">
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Taxa de Ingestão</span>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold">{(metrics.ingestRate / 1000).toFixed(1)}</span>
              <span className="text-sm text-muted-foreground mb-1">Mbps</span>
            </div>
            {metrics.ingestRate >= 5000 ? (
              <TrendingUp className="h-3 w-3 text-green-500 mt-1" />
            ) : (
              <TrendingDown className="h-3 w-3 text-yellow-500 mt-1" />
            )}
          </div>

          {/* Latency */}
          <div className="p-3 rounded-lg border bg-background">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Latência</span>
            </div>
            <div className="flex items-end gap-1">
              <span className={`text-2xl font-bold ${
                metrics.latency <= 100 ? "text-green-500" :
                metrics.latency <= 300 ? "text-yellow-500" :
                "text-red-500"
              }`}>
                {metrics.latency}
              </span>
              <span className="text-sm text-muted-foreground mb-1">ms</span>
            </div>
          </div>

          {/* Uptime */}
          <div className="p-3 rounded-lg border bg-background">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Uptime</span>
            </div>
            <span className="text-2xl font-bold font-mono">
              {formatUptime(metrics.uptime)}
            </span>
          </div>
        </div>

        {/* Quality Meters */}
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Qualidade de Vídeo</span>
              <span className={`font-medium ${getQualityColor(metrics.videoQuality)}`}>
                {metrics.videoQuality}%
              </span>
            </div>
            <Progress value={metrics.videoQuality} className={`h-2 ${getQualityBg(metrics.videoQuality)}`} />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Qualidade de Áudio</span>
              <span className={`font-medium ${getQualityColor(metrics.audioQuality)}`}>
                {metrics.audioQuality}%
              </span>
            </div>
            <Progress value={metrics.audioQuality} className={`h-2 ${getQualityBg(metrics.audioQuality)}`} />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Saúde do Buffer</span>
              <span className={`font-medium ${getQualityColor(metrics.bufferHealth)}`}>
                {metrics.bufferHealth}%
              </span>
            </div>
            <Progress value={metrics.bufferHealth} className={`h-2 ${getQualityBg(metrics.bufferHealth)}`} />
          </div>
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Alertas Recentes
            </p>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {alerts.map((alert) => (
                <div 
                  key={alert.id}
                  className={`p-2 rounded text-xs ${
                    alert.type === "error" 
                      ? "bg-red-500/10 border border-red-500/30 text-red-400"
                      : "bg-yellow-500/10 border border-yellow-500/30 text-yellow-400"
                  }`}
                >
                  {alert.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {isLive && alerts.length === 0 && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <p className="text-sm text-green-400 text-center">
              Transmissão estável, sem alertas
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
