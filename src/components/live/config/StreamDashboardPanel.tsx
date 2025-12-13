import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Radio, 
  WifiOff, 
  Users, 
  MonitorPlay,
  Cpu,
  HardDrive,
  Activity,
  Clock,
  User,
  Wifi,
  TrendingUp
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface StreamStatus {
  online: number;
  offline: number;
  viewers: number;
  resellers: number;
}

interface MediaService {
  id: string;
  name: string;
  connections: number;
  bitrate: string;
  status: "online" | "offline";
}

interface RecentLogin {
  id: string;
  user: string;
  role: string;
  ip: string;
  timestamp: Date;
}

interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  bandwidth: number;
}

interface ConnectionPoint {
  time: string;
  connections: number;
  dataRate: number;
}

interface StreamDashboardPanelProps {
  streamStatus?: StreamStatus;
  mediaServices?: MediaService[];
  recentLogins?: RecentLogin[];
  systemMetrics?: SystemMetrics;
  connectionHistory?: ConnectionPoint[];
  isLive?: boolean;
}

// Circular Progress Component
function CircularProgress({ 
  value, 
  label, 
  color = "primary" 
}: { 
  value: number; 
  label: string;
  color?: "primary" | "success" | "warning" | "destructive";
}) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  const colorClasses = {
    primary: "stroke-primary",
    success: "stroke-green-500",
    warning: "stroke-yellow-500",
    destructive: "stroke-red-500",
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 transform -rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className="text-muted/30"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`${colorClasses[color]} transition-all duration-500`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold">{value}%</span>
        </div>
      </div>
      <span className="text-sm text-muted-foreground mt-2">{label}</span>
    </div>
  );
}

// Simple Area Chart Component
function ConnectionChart({ data }: { data: ConnectionPoint[] }) {
  const maxConnections = Math.max(...data.map(d => d.connections), 1);
  const maxDataRate = Math.max(...data.map(d => d.dataRate), 1);

  return (
    <div className="h-48 relative">
      <div className="absolute top-0 right-0 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-500/50" />
          <span className="text-muted-foreground">Conexões</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-primary/50" />
          <span className="text-muted-foreground">Data Rate (Mbps)</span>
        </div>
      </div>
      
      <svg className="w-full h-full mt-4" viewBox="0 0 400 150" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((y) => (
          <line
            key={y}
            x1="0"
            y1={150 - y * 130}
            x2="400"
            y2={150 - y * 130}
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeDasharray="4"
          />
        ))}
        
        {/* Connections Area */}
        <defs>
          <linearGradient id="connectionsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="dataRateGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        
        <path
          d={`
            M 0 150
            ${data.map((d, i) => {
              const x = (i / (data.length - 1)) * 400;
              const y = 150 - (d.connections / maxConnections) * 120;
              return `L ${x} ${y}`;
            }).join(' ')}
            L 400 150
            Z
          `}
          fill="url(#connectionsGradient)"
        />
        
        <path
          d={`
            M 0 150
            ${data.map((d, i) => {
              const x = (i / (data.length - 1)) * 400;
              const y = 150 - (d.dataRate / maxDataRate) * 120;
              return `L ${x} ${y}`;
            }).join(' ')}
            L 400 150
            Z
          `}
          fill="url(#dataRateGradient)"
        />
        
        {/* Connections Line */}
        <path
          d={`
            M ${data.map((d, i) => {
              const x = (i / (data.length - 1)) * 400;
              const y = 150 - (d.connections / maxConnections) * 120;
              return `${i === 0 ? '' : 'L '}${x} ${y}`;
            }).join(' ')}
          `}
          fill="none"
          stroke="rgb(59, 130, 246)"
          strokeWidth="2"
        />
      </svg>
      
      {/* X-axis labels */}
      <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1">
        {data.filter((_, i) => i % 2 === 0).map((d, i) => (
          <span key={i}>{d.time}</span>
        ))}
      </div>
    </div>
  );
}

export function StreamDashboardPanel({
  streamStatus = { online: 1, offline: 0, viewers: 12, resellers: 1 },
  mediaServices = [
    { id: "1", name: "Arena Play Stream", connections: 12, bitrate: "5.2 Mbps", status: "online" }
  ],
  recentLogins = [
    { id: "1", user: "Administrador", role: "admin", ip: "192.168.1.1", timestamp: new Date() }
  ],
  systemMetrics = { cpu: 24, memory: 45, disk: 62, bandwidth: 78 },
  connectionHistory = [
    { time: "15:00", connections: 5, dataRate: 2.1 },
    { time: "15:30", connections: 8, dataRate: 3.2 },
    { time: "16:00", connections: 12, dataRate: 4.5 },
    { time: "16:30", connections: 10, dataRate: 4.1 },
    { time: "17:00", connections: 15, dataRate: 5.2 },
    { time: "17:30", connections: 18, dataRate: 6.0 },
    { time: "18:00", connections: 12, dataRate: 5.2 },
  ],
  isLive = false
}: StreamDashboardPanelProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Painel de Acompanhamento</h2>
            <p className="text-sm text-muted-foreground">
              Monitoramento em tempo real • {format(currentTime, "HH:mm:ss", { locale: ptBR })}
            </p>
          </div>
        </div>
        {isLive && (
          <Badge className="bg-red-500 animate-pulse">
            <span className="mr-1">●</span> AO VIVO
          </Badge>
        )}
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-500/20">
              <Radio className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{streamStatus.online}</p>
              <p className="text-sm text-muted-foreground">Online</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-500/20">
              <WifiOff className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{streamStatus.offline}</p>
              <p className="text-sm text-muted-foreground">Offline</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/20">
              <Users className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{streamStatus.viewers}</p>
              <p className="text-sm text-muted-foreground">Espectadores</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/20">
              <MonitorPlay className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{streamStatus.resellers}</p>
              <p className="text-sm text-muted-foreground">Canais</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Media Services */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wifi className="h-4 w-4 text-primary" />
              Serviços de Mídia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mediaServices.map((service) => (
              <div 
                key={service.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${
                    service.status === "online" ? "bg-green-500" : "bg-red-500"
                  }`} />
                  <div>
                    <p className="text-sm font-medium">{service.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {service.connections} conexões @ {service.bitrate}
                    </p>
                  </div>
                </div>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Logins */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Acessos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentLogins.map((login) => (
              <div 
                key={login.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/30"
              >
                <div className="p-2 rounded-full bg-primary/20">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {login.user} <span className="text-muted-foreground">({login.role})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(login.timestamp, "HH:mm", { locale: ptBR })} • {login.ip}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* CPU */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              CPU
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-2">
            <CircularProgress 
              value={systemMetrics.cpu} 
              label="Uso" 
              color={systemMetrics.cpu > 80 ? "destructive" : systemMetrics.cpu > 60 ? "warning" : "success"}
            />
          </CardContent>
        </Card>

        {/* Memory */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              Memória
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-2">
            <CircularProgress 
              value={systemMetrics.memory} 
              label="Uso" 
              color={systemMetrics.memory > 80 ? "destructive" : systemMetrics.memory > 60 ? "warning" : "primary"}
            />
          </CardContent>
        </Card>
      </div>

      {/* Connection Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card variant="glass" className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Conexões
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {connectionHistory[connectionHistory.length - 1]?.connections || 0} conexões @ {connectionHistory[connectionHistory.length - 1]?.dataRate || 0} Mbps
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ConnectionChart data={connectionHistory} />
          </CardContent>
        </Card>

        {/* Disk & Bandwidth */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              Recursos do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-4">
            <CircularProgress 
              value={systemMetrics.disk} 
              label="Disco" 
              color={systemMetrics.disk > 90 ? "destructive" : systemMetrics.disk > 75 ? "warning" : "primary"}
            />
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Banda</span>
                <span className="font-medium">{systemMetrics.bandwidth}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${
                    systemMetrics.bandwidth > 90 ? "bg-red-500" : 
                    systemMetrics.bandwidth > 70 ? "bg-yellow-500" : 
                    "bg-primary"
                  }`}
                  style={{ width: `${systemMetrics.bandwidth}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
