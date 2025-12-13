import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Mic, Radio, User, Music, Volume2, CheckCircle, AlertTriangle } from "lucide-react";

interface AudioChannel {
  channel: number;
  type: string;
  label: string;
  active: boolean;
  level: number;
}

interface AudioChannelConfigProps {
  channels: AudioChannel[];
  onChannelsChange: (channels: AudioChannel[]) => void;
}

const channelIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  narration: Mic,
  ambient: Radio,
  commentary: User,
  effects: Music,
};

const channelColors: Record<string, string> = {
  narration: "text-blue-400",
  ambient: "text-green-400",
  commentary: "text-purple-400",
  effects: "text-orange-400",
};

export function AudioChannelConfig({ channels, onChannelsChange }: AudioChannelConfigProps) {
  const handleToggle = (index: number) => {
    const updated = [...channels];
    updated[index] = { ...updated[index], active: !updated[index].active };
    onChannelsChange(updated);
  };

  const handleLevelChange = (index: number, value: number[]) => {
    const updated = [...channels];
    updated[index] = { ...updated[index], level: value[0] };
    onChannelsChange(updated);
  };

  const activeChannels = channels.filter(c => c.active).length;

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-primary" />
            Configuração de Áudio (4 Canais)
          </CardTitle>
          <Badge variant={activeChannels >= 2 ? "default" : "secondary"}>
            {activeChannels}/4 ativos
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {channels.map((channel, index) => {
            const Icon = channelIcons[channel.type] || Mic;
            const colorClass = channelColors[channel.type] || "text-muted-foreground";
            
            return (
              <div 
                key={channel.channel}
                className={`p-4 rounded-lg border transition-all ${
                  channel.active 
                    ? "border-primary/30 bg-primary/5" 
                    : "border-muted bg-muted/5 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full bg-background ${colorClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Canal {channel.channel.toString().padStart(2, '0')}</p>
                      <p className="text-xs text-muted-foreground">{channel.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {channel.active && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    <Switch
                      checked={channel.active}
                      onCheckedChange={() => handleToggle(index)}
                    />
                  </div>
                </div>
                
                {channel.active && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Nível de Áudio</span>
                      <span>{channel.level} dB</span>
                    </div>
                    <Slider
                      value={[channel.level]}
                      onValueChange={(value) => handleLevelChange(index, value)}
                      min={-60}
                      max={0}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>-60 dB</span>
                      <span>0 dB</span>
                    </div>
                    
                    {/* Audio Level Meter Simulation */}
                    <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                      <div 
                        className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all"
                        style={{ width: `${((channel.level + 60) / 60) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-muted">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Configuração Recomendada ESPN</p>
              <p>Canal 01: Narração (-6dB) | Canal 02: Ambiente (-12dB) | Canal 03: Comentário (-6dB) | Canal 04: Reserva</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
