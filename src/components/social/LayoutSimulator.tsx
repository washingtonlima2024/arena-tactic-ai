import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DeviceMockup } from '@/components/media/DeviceMockup';
import {
  Monitor,
  Smartphone,
  Type,
  Image,
  Hash,
  Trophy,
  Palette,
  Eye,
  Download,
  Layers,
  Move,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MatchData {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homeColor: string;
  awayColor: string;
  homeLogo?: string;
  awayLogo?: string;
}

interface LayoutElement {
  id: string;
  type: 'logo' | 'score' | 'text' | 'hashtag' | 'watermark';
  enabled: boolean;
  position: 'top' | 'center' | 'bottom';
  content: string;
  style: {
    color: string;
    fontSize: number;
    backgroundColor?: string;
    opacity: number;
  };
}

interface LayoutSimulatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaUrl: string;
  mediaType: 'video' | 'image';
  matchData?: MatchData;
  onExport?: (config: LayoutConfig) => void;
}

interface LayoutConfig {
  format: '9:16' | '16:9' | '1:1' | '4:5';
  elements: LayoutElement[];
  backgroundColor?: string;
  overlayOpacity: number;
}

const DEFAULT_ELEMENTS: LayoutElement[] = [
  {
    id: 'score',
    type: 'score',
    enabled: true,
    position: 'top',
    content: '',
    style: { color: '#ffffff', fontSize: 24, backgroundColor: '#000000', opacity: 0.8 }
  },
  {
    id: 'hashtag',
    type: 'hashtag',
    enabled: true,
    position: 'bottom',
    content: '#ArenaPlay #Futebol',
    style: { color: '#ffffff', fontSize: 14, opacity: 1 }
  },
  {
    id: 'watermark',
    type: 'watermark',
    enabled: true,
    position: 'bottom',
    content: 'ArenaPlay',
    style: { color: '#ffffff', fontSize: 12, opacity: 0.6 }
  },
];

const FORMAT_OPTIONS = [
  { value: '9:16', label: 'Stories', icon: Smartphone },
  { value: '16:9', label: 'YouTube', icon: Monitor },
  { value: '1:1', label: 'Feed', icon: Layers },
  { value: '4:5', label: 'Portrait', icon: Smartphone },
] as const;

export function LayoutSimulator({
  open,
  onOpenChange,
  mediaUrl,
  mediaType,
  matchData,
  onExport,
}: LayoutSimulatorProps) {
  const [format, setFormat] = useState<LayoutConfig['format']>('9:16');
  const [elements, setElements] = useState<LayoutElement[]>(DEFAULT_ELEMENTS);
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>('score');

  const updateElement = (id: string, updates: Partial<LayoutElement>) => {
    setElements(prev => prev.map(el => 
      el.id === id ? { ...el, ...updates } : el
    ));
  };

  const updateElementStyle = (id: string, styleUpdates: Partial<LayoutElement['style']>) => {
    setElements(prev => prev.map(el => 
      el.id === id ? { ...el, style: { ...el.style, ...styleUpdates } } : el
    ));
  };

  const selectedElement = elements.find(el => el.id === selectedElementId);

  const handleExport = () => {
    onExport?.({
      format,
      elements,
      overlayOpacity,
    });
    onOpenChange(false);
  };

  const renderOverlayElement = (element: LayoutElement) => {
    if (!element.enabled) return null;

    const positionClasses = {
      top: 'top-2 left-1/2 -translate-x-1/2',
      center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
      bottom: 'bottom-2 left-1/2 -translate-x-1/2',
    };

    if (element.type === 'score' && matchData) {
      return (
        <div
          key={element.id}
          className={cn(
            "absolute z-20 px-3 py-1.5 rounded-lg flex items-center gap-2",
            positionClasses[element.position]
          )}
          style={{
            backgroundColor: element.style.backgroundColor,
            opacity: element.style.opacity,
          }}
        >
          <span 
            className="font-bold"
            style={{ color: matchData.homeColor, fontSize: element.style.fontSize }}
          >
            {matchData.homeTeam?.slice(0, 3).toUpperCase()}
          </span>
          <span 
            className="font-bold"
            style={{ color: element.style.color, fontSize: element.style.fontSize }}
          >
            {matchData.homeScore} - {matchData.awayScore}
          </span>
          <span 
            className="font-bold"
            style={{ color: matchData.awayColor, fontSize: element.style.fontSize }}
          >
            {matchData.awayTeam?.slice(0, 3).toUpperCase()}
          </span>
        </div>
      );
    }

    if (element.type === 'hashtag') {
      return (
        <div
          key={element.id}
          className={cn(
            "absolute z-20 px-2 py-1",
            positionClasses[element.position]
          )}
          style={{
            color: element.style.color,
            fontSize: element.style.fontSize,
            opacity: element.style.opacity,
          }}
        >
          {element.content}
        </div>
      );
    }

    if (element.type === 'watermark') {
      return (
        <div
          key={element.id}
          className={cn(
            "absolute z-20 bottom-1 right-2"
          )}
          style={{
            color: element.style.color,
            fontSize: element.style.fontSize,
            opacity: element.style.opacity,
          }}
        >
          {element.content}
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Simulador de Layout
          </DialogTitle>
          <DialogDescription>
            Configure o layout visual do seu post para redes sociais
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          {/* Preview */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <Button
                    key={option.value}
                    variant={format === option.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormat(option.value as LayoutConfig['format'])}
                    className="gap-1"
                  >
                    <Icon className="h-3 w-3" />
                    {option.label}
                  </Button>
                );
              })}
            </div>

            <DeviceMockup format={format} size="md">
              <div className="relative w-full h-full">
                {/* Media Background */}
                {mediaType === 'image' ? (
                  <img
                    src={mediaUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={mediaUrl}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    autoPlay
                    playsInline
                  />
                )}

                {/* Overlay */}
                {overlayOpacity > 0 && (
                  <div 
                    className="absolute inset-0 bg-black z-10"
                    style={{ opacity: overlayOpacity / 100 }}
                  />
                )}

                {/* Elements */}
                {elements.map(renderOverlayElement)}
              </div>
            </DeviceMockup>
          </div>

          {/* Controls */}
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {/* Elements List */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Elementos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {elements.map((element) => (
                    <div
                      key={element.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors",
                        selectedElementId === element.id 
                          ? "border-primary bg-primary/5" 
                          : "hover:bg-muted/50"
                      )}
                      onClick={() => setSelectedElementId(element.id)}
                    >
                      <div className="flex items-center gap-2">
                        {element.type === 'score' && <Trophy className="h-4 w-4" />}
                        {element.type === 'hashtag' && <Hash className="h-4 w-4" />}
                        {element.type === 'watermark' && <Image className="h-4 w-4" />}
                        <span className="text-sm font-medium capitalize">
                          {element.type === 'score' ? 'Placar' : 
                           element.type === 'hashtag' ? 'Hashtags' : 
                           'Marca d\'água'}
                        </span>
                      </div>
                      <Switch
                        checked={element.enabled}
                        onCheckedChange={(checked) => updateElement(element.id, { enabled: checked })}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Element Editor */}
              {selectedElement && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Editar: {selectedElement.type === 'score' ? 'Placar' : 
                               selectedElement.type === 'hashtag' ? 'Hashtags' : 
                               'Marca d\'água'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Position */}
                    <div className="space-y-2">
                      <Label className="text-xs">Posição</Label>
                      <div className="flex gap-2">
                        {(['top', 'center', 'bottom'] as const).map((pos) => (
                          <Button
                            key={pos}
                            variant={selectedElement.position === pos ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateElement(selectedElement.id, { position: pos })}
                            className="flex-1 text-xs"
                          >
                            {pos === 'top' ? 'Topo' : pos === 'center' ? 'Centro' : 'Rodapé'}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Content for hashtag */}
                    {selectedElement.type === 'hashtag' && (
                      <div className="space-y-2">
                        <Label className="text-xs">Conteúdo</Label>
                        <Input
                          value={selectedElement.content}
                          onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                          placeholder="#ArenaPlay #Futebol"
                        />
                      </div>
                    )}

                    {/* Font Size */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Tamanho da Fonte</Label>
                        <Badge variant="outline">{selectedElement.style.fontSize}px</Badge>
                      </div>
                      <Slider
                        value={[selectedElement.style.fontSize]}
                        onValueChange={([value]) => updateElementStyle(selectedElement.id, { fontSize: value })}
                        min={10}
                        max={48}
                        step={1}
                      />
                    </div>

                    {/* Opacity */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Opacidade</Label>
                        <Badge variant="outline">{Math.round(selectedElement.style.opacity * 100)}%</Badge>
                      </div>
                      <Slider
                        value={[selectedElement.style.opacity * 100]}
                        onValueChange={([value]) => updateElementStyle(selectedElement.id, { opacity: value / 100 })}
                        min={10}
                        max={100}
                        step={5}
                      />
                    </div>

                    {/* Color */}
                    <div className="space-y-2">
                      <Label className="text-xs">Cor do Texto</Label>
                      <div className="flex gap-2">
                        {['#ffffff', '#000000', '#10b981', '#f97316', '#3b82f6'].map((color) => (
                          <button
                            key={color}
                            className={cn(
                              "w-8 h-8 rounded-full border-2 transition-transform",
                              selectedElement.style.color === color 
                                ? "border-primary scale-110" 
                                : "border-transparent"
                            )}
                            style={{ backgroundColor: color }}
                            onClick={() => updateElementStyle(selectedElement.id, { color })}
                          />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Global Overlay */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Overlay Global
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Escurecimento</Label>
                      <Badge variant="outline">{overlayOpacity}%</Badge>
                    </div>
                    <Slider
                      value={[overlayOpacity]}
                      onValueChange={([value]) => setOverlayOpacity(value)}
                      min={0}
                      max={60}
                      step={5}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Aplicar Layout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
