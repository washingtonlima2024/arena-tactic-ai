import { AppLayout } from "@/components/layout/AppLayout";
import { LiveStreamConfig } from "@/components/live/config/LiveStreamConfig";
import { Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function LiveConfig() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/live")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Settings className="h-6 w-6 text-primary" />
                Configuração de Transmissão
              </h1>
              <p className="text-muted-foreground">
                Configure as especificações técnicas para transmissão ao vivo ESPN/Kakttus
              </p>
            </div>
          </div>
        </div>

        {/* Main Config Component */}
        <LiveStreamConfig />

        {/* Troubleshooting Section */}
        <div className="p-4 rounded-lg bg-muted/30 border">
          <h3 className="font-medium mb-2">Precisa de Ajuda?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-medium text-yellow-500">Vídeo Dessincronizado</p>
              <p className="text-muted-foreground text-xs">Verifique a configuração NTP e reforce a sincronização</p>
            </div>
            <div>
              <p className="font-medium text-yellow-500">Áudio Incompleto</p>
              <p className="text-muted-foreground text-xs">Valide o mapeamento dos 4 canais de áudio</p>
            </div>
            <div>
              <p className="font-medium text-yellow-500">Interrupção de Sinal</p>
              <p className="text-muted-foreground text-xs">Cheque conectividade e configurações de firewall</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Suporte técnico: <a href="mailto:suporte@kakttus.com" className="text-primary hover:underline">suporte@kakttus.com</a>
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
