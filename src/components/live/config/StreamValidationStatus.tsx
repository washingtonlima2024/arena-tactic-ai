import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Loader2,
  Monitor,
  Volume2,
  Clock,
  Wifi
} from "lucide-react";

interface ValidationItem {
  id: string;
  label: string;
  status: "pending" | "checking" | "ok" | "warning" | "error";
  message?: string;
}

interface StreamValidationStatusProps {
  validations: ValidationItem[];
  overallStatus: "pending" | "validating" | "active" | "warning" | "error";
  onValidate: () => void;
  isValidating: boolean;
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  video: Monitor,
  audio: Volume2,
  time: Clock,
  network: Wifi,
};

export function StreamValidationStatus({ 
  validations, 
  overallStatus,
  onValidate,
  isValidating
}: StreamValidationStatusProps) {
  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "ok") return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    if (status === "error") return <XCircle className="h-4 w-4 text-red-500" />;
    if (status === "checking") return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
  };

  const getOverallBadge = () => {
    switch (overallStatus) {
      case "active":
        return <Badge className="bg-green-500">Transmissão Ativa</Badge>;
      case "warning":
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">Aviso - Monitorar</Badge>;
      case "error":
        return <Badge variant="destructive">Erro Crítico</Badge>;
      case "validating":
        return <Badge variant="outline">Validando...</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  const completedCount = validations.filter(v => v.status === "ok").length;
  const progress = (completedCount / validations.length) * 100;

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            Status de Validação
          </CardTitle>
          {getOverallBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progresso da Validação</span>
            <span className="font-medium">{completedCount}/{validations.length}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="space-y-2">
          {validations.map((validation) => {
            const Icon = categoryIcons[validation.id] || CheckCircle;
            return (
              <div 
                key={validation.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  validation.status === "ok" ? "border-green-500/30 bg-green-500/5" :
                  validation.status === "warning" ? "border-yellow-500/30 bg-yellow-500/5" :
                  validation.status === "error" ? "border-red-500/30 bg-red-500/5" :
                  validation.status === "checking" ? "border-blue-500/30 bg-blue-500/5" :
                  "border-muted bg-muted/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{validation.label}</p>
                    {validation.message && (
                      <p className="text-xs text-muted-foreground">{validation.message}</p>
                    )}
                  </div>
                </div>
                <StatusIcon status={validation.status} />
              </div>
            );
          })}
        </div>

        {overallStatus === "active" && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-sm text-green-400 font-medium">
                Sistema validado e pronto para transmissão
              </p>
            </div>
          </div>
        )}

        {overallStatus === "error" && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">
              <strong>Ação Necessária:</strong> Corrija os erros acima antes de iniciar a transmissão.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
