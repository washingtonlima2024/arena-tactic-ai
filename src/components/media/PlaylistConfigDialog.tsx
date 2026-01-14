import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Film, 
  Clock, 
  Sparkles, 
  AlertTriangle, 
  Check,
  Smartphone,
  Monitor,
  Square,
  RectangleHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlaylistClip {
  id: string;
  title: string;
  type: string;
  duration?: number;
  thumbnailUrl?: string;
}

export interface PlaylistConfig {
  name: string;
  targetDuration: number;
  format: '9:16' | '16:9' | '1:1' | '4:5';
  includeOpening: boolean;
  includeTransitions: boolean;
  includeClosing: boolean;
  openingDuration: number;
  transitionDuration: number;
  closingDuration: number;
}

interface PlaylistConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clips: PlaylistClip[];
  teamName: string;
  onCompile: (config: PlaylistConfig) => void;
}

const FORMAT_OPTIONS = [
  { value: '9:16', label: 'Stories/Reels', icon: Smartphone, description: 'Instagram, TikTok' },
  { value: '16:9', label: 'YouTube', icon: Monitor, description: 'Widescreen' },
  { value: '1:1', label: 'Feed', icon: Square, description: 'Instagram, Facebook' },
  { value: '4:5', label: 'Portrait', icon: RectangleHorizontal, description: 'Instagram Feed' },
] as const;

export function PlaylistConfigDialog({
  open,
  onOpenChange,
  clips,
  teamName,
  onCompile,
}: PlaylistConfigDialogProps) {
  const [config, setConfig] = useState<PlaylistConfig>({
    name: `${teamName} - Highlights ${new Date().toLocaleDateString('pt-BR')}`,
    targetDuration: 60,
    format: '9:16',
    includeOpening: true,
    includeTransitions: true,
    includeClosing: true,
    openingDuration: 4000,
    transitionDuration: 1500,
    closingDuration: 3000,
  });

  // Calculate time distribution
  const calculation = useMemo(() => {
    const openingSeconds = config.includeOpening ? config.openingDuration / 1000 : 0;
    const closingSeconds = config.includeClosing ? config.closingDuration / 1000 : 0;
    const transitionSeconds = config.includeTransitions 
      ? (clips.length > 1 ? (clips.length - 1) * (config.transitionDuration / 1000) : 0) 
      : 0;
    
    const vignetteTotal = openingSeconds + closingSeconds + transitionSeconds;
    const availableForClips = config.targetDuration - vignetteTotal;
    const avgClipDuration = clips.length > 0 ? availableForClips / clips.length : 0;
    
    return {
      openingSeconds,
      closingSeconds,
      transitionSeconds,
      vignetteTotal,
      availableForClips,
      avgClipDuration,
      isViable: avgClipDuration >= 3, // Minimum 3 seconds per clip
      clipsCount: clips.length,
    };
  }, [config, clips.length]);

  const handleConfirm = () => {
    onCompile(config);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            Configurar Playlist
          </DialogTitle>
          <DialogDescription>
            Configure a duração, formato e vinhetas da playlist com {clips.length} clips
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Nome da Playlist */}
          <div className="space-y-2">
            <Label htmlFor="playlist-name">Nome da Playlist</Label>
            <Input
              id="playlist-name"
              value={config.name}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: Flamengo - Melhores Momentos"
            />
          </div>

          {/* Duração Total */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Duração Total
              </Label>
              <Badge variant="outline" className="text-lg font-mono">
                {config.targetDuration}s
              </Badge>
            </div>
            <Slider
              value={[config.targetDuration]}
              onValueChange={([value]) => setConfig(prev => ({ ...prev, targetDuration: value }))}
              min={30}
              max={300}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>30s</span>
              <span>1min</span>
              <span>2min</span>
              <span>3min</span>
              <span>5min</span>
            </div>
          </div>

          {/* Formato do Vídeo */}
          <div className="space-y-3">
            <Label>Formato do Vídeo</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = config.format === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, format: option.value as PlaylistConfig['format'] }))}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-all",
                      isSelected 
                        ? "border-primary bg-primary/10" 
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isSelected ? "text-primary" : "text-muted-foreground")} />
                    <div className="text-left">
                      <div className={cn("font-medium text-sm", isSelected && "text-primary")}>
                        {option.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vinhetas AI */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Vinhetas (geradas por AI)
            </Label>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="font-medium text-sm">Abertura</div>
                  <div className="text-xs text-muted-foreground">
                    Introdução com dados da partida ({config.openingDuration / 1000}s)
                  </div>
                </div>
                <Switch
                  checked={config.includeOpening}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeOpening: checked }))}
                />
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="font-medium text-sm">Transições</div>
                  <div className="text-xs text-muted-foreground">
                    Efeitos entre clips ({config.transitionDuration / 1000}s cada)
                  </div>
                </div>
                <Switch
                  checked={config.includeTransitions}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeTransitions: checked }))}
                />
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="font-medium text-sm">Encerramento</div>
                  <div className="text-xs text-muted-foreground">
                    Créditos e logo ArenaPlay ({config.closingDuration / 1000}s)
                  </div>
                </div>
                <Switch
                  checked={config.includeClosing}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeClosing: checked }))}
                />
              </div>
            </div>
          </div>

          {/* Cálculo de Tempo */}
          <Card className={cn(
            "border",
            calculation.isViable ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"
          )}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                {calculation.isViable ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                )}
                <span className="font-medium text-sm">
                  {calculation.isViable ? 'Configuração válida' : 'Ajuste necessário'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vinhetas:</span>
                  <span className="font-mono">{calculation.vignetteTotal.toFixed(1)}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Clips ({calculation.clipsCount}x):</span>
                  <span className="font-mono">{calculation.availableForClips.toFixed(1)}s</span>
                </div>
                <div className="flex justify-between col-span-2 pt-2 border-t">
                  <span className="text-muted-foreground">Média por clip:</span>
                  <span className={cn(
                    "font-mono font-bold",
                    calculation.avgClipDuration >= 5 ? "text-green-500" :
                    calculation.avgClipDuration >= 3 ? "text-yellow-500" : "text-red-500"
                  )}>
                    {calculation.avgClipDuration.toFixed(1)}s
                  </span>
                </div>
              </div>
              
              {!calculation.isViable && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  Aumente a duração total ou reduza o número de clips para ter pelo menos 3s por clip.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!calculation.isViable}
            className="gap-2"
          >
            <Film className="h-4 w-4" />
            Compilar Playlist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
