import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Clock, RefreshCw, CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NtpSyncPanelProps {
  ntpServer: string;
  offsetMs: number;
  lastSync: Date | null;
  onServerChange: (server: string) => void;
  onSync: () => Promise<void>;
}

export function NtpSyncPanel({ 
  ntpServer, 
  offsetMs, 
  lastSync, 
  onServerChange,
  onSync 
}: NtpSyncPanelProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onSync();
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatus = () => {
    if (!lastSync) return "pending";
    if (Math.abs(offsetMs) <= 50) return "synced";
    if (Math.abs(offsetMs) <= 200) return "warning";
    return "error";
  };

  const status = getStatus();

  const StatusIcon = () => {
    if (status === "synced") return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (status === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    if (status === "error") return <XCircle className="h-5 w-5 text-red-500" />;
    return <Clock className="h-5 w-5 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (status === "synced") return "Sincronizado";
    if (status === "warning") return "Atenção";
    if (status === "error") return "Dessincronizado";
    return "Pendente";
  };

  const getStatusVariant = () => {
    if (status === "synced") return "default" as const;
    if (status === "warning") return "secondary" as const;
    if (status === "error") return "destructive" as const;
    return "outline" as const;
  };

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Sincronização NTP
          </CardTitle>
          <Badge variant={getStatusVariant()}>
            {getStatusText()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-muted">
          <StatusIcon />
          <div className="flex-1">
            <p className="text-sm font-medium">Status de Sincronização</p>
            <p className="text-xs text-muted-foreground">
              {status === "synced" && "Transmissão alinhada com referência temporal"}
              {status === "warning" && "Offset detectado, verificar lip-sync"}
              {status === "error" && "Sincronização crítica, corrigir antes de transmitir"}
              {status === "pending" && "Aguardando sincronização inicial"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg border bg-background">
            <p className="text-xs text-muted-foreground mb-1">Servidor NTP</p>
            <Input
              value={ntpServer}
              onChange={(e) => onServerChange(e.target.value)}
              placeholder="pool.ntp.org"
              className="h-8 text-sm"
            />
          </div>
          <div className="p-3 rounded-lg border bg-background">
            <p className="text-xs text-muted-foreground mb-1">Offset</p>
            <p className={`font-mono text-lg font-bold ${
              Math.abs(offsetMs) <= 50 ? "text-green-500" :
              Math.abs(offsetMs) <= 200 ? "text-yellow-500" :
              "text-red-500"
            }`}>
              {offsetMs > 0 ? "+" : ""}{offsetMs} ms
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
          <div>
            <p className="text-xs text-muted-foreground">Última Sincronização</p>
            <p className="text-sm font-medium">
              {lastSync 
                ? format(lastSync, "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
                : "Nunca sincronizado"
              }
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {isSyncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
        </div>

        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <p className="text-xs text-blue-400">
            <strong>Importante:</strong> A sincronização NTP é fundamental para eliminar problemas de lip-sync 
            entre áudio e vídeo. Mantenha o offset abaixo de 50ms para transmissões profissionais.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
