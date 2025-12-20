import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Edit2, Clock, Play, ExternalLink, Share2, Copy, Download, Twitter } from "lucide-react";
import { LiveEvent } from "@/contexts/LiveBroadcastContext";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";

interface LiveEventsListProps {
  detectedEvents: LiveEvent[];
  approvedEvents: LiveEvent[];
  onApprove: (eventId: string) => void;
  onEdit: (eventId: string, updates: Partial<LiveEvent>) => void;
  onRemove: (eventId: string) => void;
}

const getEventIcon = (type: string) => {
  switch (type) {
    case "goal":
    case "goal_home":
    case "goal_away":
      return "⚽";
    case "yellow_card":
      return "🟨";
    case "red_card":
      return "🟥";
    case "shot":
      return "🎯";
    case "foul":
      return "⚠️";
    case "substitution":
      return "🔄";
    case "halftime":
      return "⏱️";
    default:
      return "📌";
  }
};

const getEventLabel = (type: string) => {
  switch (type) {
    case "goal":
      return "Gol";
    case "goal_home":
      return "Gol Casa";
    case "goal_away":
      return "Gol Fora";
    case "yellow_card":
      return "Cartão Amarelo";
    case "red_card":
      return "Cartão Vermelho";
    case "shot":
      return "Finalização";
    case "foul":
      return "Falta";
    case "substitution":
      return "Substituição";
    case "halftime":
      return "Intervalo";
    default:
      return type;
  }
};

const handleCopyLink = async (clipUrl: string) => {
  try {
    await navigator.clipboard.writeText(clipUrl);
    toast({
      title: "Link copiado",
      description: "Link do clip copiado para a área de transferência",
    });
  } catch (error) {
    toast({
      title: "Erro",
      description: "Não foi possível copiar o link",
      variant: "destructive",
    });
  }
};

const handleShareTwitter = (clipUrl: string, eventType: string) => {
  const text = encodeURIComponent(`🔥 ${getEventLabel(eventType)} incrível! Confira o lance:`);
  const url = encodeURIComponent(clipUrl);
  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
};

const handleDownload = async (clipUrl: string, eventType: string) => {
  try {
    const response = await fetch(clipUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clip-${eventType}-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast({
      title: "Download iniciado",
      description: "O clip está sendo baixado",
    });
  } catch (error) {
    toast({
      title: "Erro no download",
      description: "Não foi possível baixar o clip",
      variant: "destructive",
    });
  }
};

export const LiveEventsList = ({
  detectedEvents,
  approvedEvents,
  onApprove,
  onEdit,
  onRemove,
}: LiveEventsListProps) => {
  const allEvents = [
    ...detectedEvents.map((e) => ({ ...e, source: "detected" as const })),
    ...approvedEvents.map((e) => ({ ...e, source: "approved" as const })),
  ].sort((a, b) => b.minute * 60 + b.second - (a.minute * 60 + a.second));

  return (
    <div className="glass-card p-4 rounded-xl h-[400px] flex flex-col">
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-foreground">
        <Clock className="h-5 w-5 text-primary" />
        Eventos ({allEvents.length})
      </h3>

      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {allEvents.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum evento detectado ainda
            </p>
          ) : (
            allEvents.map((event) => (
              <div
                key={event.id}
                className={`p-3 rounded-lg border transition-colors ${
                  event.source === "approved"
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-yellow-500/10 border-yellow-500/30"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xl">{getEventIcon(event.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {getEventLabel(event.type)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {event.minute}'{event.second > 0 ? event.second + '"' : ""}
                      </span>
                      {/* Clip badge */}
                      {event.clipUrl && (
                        <Badge variant="secondary" className="text-xs gap-1 bg-primary/20 text-primary border-primary/30">
                          <Play className="h-2.5 w-2.5" />
                          Clip
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {event.description}
                    </p>
                    {event.confidence && (
                      <span className="text-xs text-muted-foreground">
                        Confiança: {Math.round(event.confidence * 100)}%
                      </span>
                    )}
                  </div>

                  {/* Share dropdown for clips */}
                  {event.clipUrl && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-primary hover:text-primary/80 hover:bg-primary/10"
                          title="Compartilhar clip"
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleShareTwitter(event.clipUrl!, event.type)}>
                          <Twitter className="h-4 w-4 mr-2" />
                          Compartilhar no X
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCopyLink(event.clipUrl!)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar Link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload(event.clipUrl!, event.type)}>
                          <Download className="h-4 w-4 mr-2" />
                          Baixar Clip
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {/* Play button */}
                  {event.clipUrl && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-primary hover:text-primary/80 hover:bg-primary/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(event.clipUrl, '_blank');
                      }}
                      title="Ver clip"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Actions */}
                  {event.source === "detected" && (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-green-500 hover:text-green-400"
                        onClick={() => onApprove(event.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500 hover:text-red-400"
                        onClick={() => onRemove(event.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {event.source === "approved" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => onRemove(event.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};