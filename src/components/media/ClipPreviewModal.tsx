import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { DeviceMockup } from './DeviceMockup';
import { VideoTimelineEditor } from './VideoTimelineEditor';
import { 
  X, 
  Smartphone, 
  Tablet, 
  Monitor,
  RectangleVertical,
  Square,
  RectangleHorizontal,
  Download,
  Volume2,
  VolumeX,
  Scissors,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Maximize2,
  Target,
  Image,
  Type,
  PenTool,
  Upload,
  Plus,
  Palette,
  Settings2,
  ChevronDown,
  Layers
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

type DeviceFormat = '9:16' | '16:9' | '1:1' | '4:5';
type DeviceType = 'phone' | 'tablet' | 'desktop';

interface ClipPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  clipUrl: string | null;
  clipTitle: string;
  clipType: string;
  timestamp: string;
  matchHalf?: string;
  posterUrl?: string;
  eventId?: string;
  eventSecond?: number;
  videoDuration?: number;
  initialTrim?: { startOffset: number; endOffset: number };
  onTrimSave?: (eventId: string, trim: { startOffset: number; endOffset: number }) => void;
}

const formatConfigs = [
  { id: '9:16' as DeviceFormat, label: 'Stories/Reels', icon: RectangleVertical, platforms: ['Instagram Stories', 'TikTok', 'YouTube Shorts'] },
  { id: '16:9' as DeviceFormat, label: 'YouTube/TV', icon: RectangleHorizontal, platforms: ['YouTube', 'Twitter/X', 'LinkedIn'] },
  { id: '1:1' as DeviceFormat, label: 'Feed Quadrado', icon: Square, platforms: ['Instagram Feed', 'Facebook'] },
  { id: '4:5' as DeviceFormat, label: 'Feed Vertical', icon: RectangleVertical, platforms: ['Instagram Feed', 'Facebook'] },
];

const deviceConfigs = [
  { id: 'phone' as DeviceType, label: 'Celular', icon: Smartphone },
  { id: 'tablet' as DeviceType, label: 'Tablet', icon: Tablet },
  { id: 'desktop' as DeviceType, label: 'Desktop', icon: Monitor },
];

const logoPositions = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right', 
  'bottom-left', 'bottom-center', 'bottom-right'
];

export function ClipPreviewModal({
  isOpen,
  onClose,
  clipUrl,
  clipTitle,
  clipType,
  timestamp,
  matchHalf,
  posterUrl,
  eventId,
  eventSecond = 0,
  videoDuration = 30,
  initialTrim,
  onTrimSave,
}: ClipPreviewModalProps) {
  // Format & Device
  const [selectedFormat, setSelectedFormat] = useState<DeviceFormat>('9:16');
  const [selectedDevice, setSelectedDevice] = useState<DeviceType>('phone');
  
  // Player controls
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Timeline Editor
  const [showTimelineEditor, setShowTimelineEditor] = useState(false);
  const [currentTrim, setCurrentTrim] = useState(initialTrim);
  
  // Styles & Overlays
  const [logoPosition, setLogoPosition] = useState('top-left');
  const [logoOpacity, setLogoOpacity] = useState(80);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [subtitleStyle, setSubtitleStyle] = useState('classico');
  
  // Accordion state
  const [openPanels, setOpenPanels] = useState(['formato', 'dispositivo']);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFormat('9:16');
      setSelectedDevice('phone');
      setIsMuted(true);
      setIsPlaying(true);
      setShowTimelineEditor(false);
      setCurrentTrim(initialTrim);
      setCurrentTime(0);
    }
  }, [isOpen, initialTrim]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration || videoDuration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleLoadedMetadata = () => setDuration(video.duration || videoDuration);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [clipUrl, videoDuration]);

  // Update video muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Format time helper
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Player control handlers
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  const handleSeek = (delta: number) => {
    if (videoRef.current) {
      const newTime = Math.max(0, Math.min(
        videoRef.current.currentTime + delta,
        videoRef.current.duration || duration
      ));
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleProgressChange = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const goToStart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  };

  const goToEvent = () => {
    if (videoRef.current) {
      const targetTime = Math.min(15, duration); // Event is typically at 15s in a 30s clip
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  const handleFullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  const handleDownload = async () => {
    if (!clipUrl) return;
    
    try {
      const response = await fetch(clipUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clipTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedFormat.replace(':', 'x')}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading clip:', error);
    }
  };

  const handleTrimChange = useCallback((trim: { startOffset: number; endOffset: number }) => {
    setCurrentTrim(trim);
  }, []);

  const handleTrimSave = useCallback((trim: { startOffset: number; endOffset: number }) => {
    if (eventId && onTrimSave) {
      onTrimSave(eventId, trim);
    }
    setShowTimelineEditor(false);
  }, [eventId, onTrimSave]);

  // Get device size based on format
  const getDeviceSize = (): 'sm' | 'md' | 'lg' => {
    if (selectedDevice === 'desktop') return 'md';
    return 'lg';
  };

  const currentFormatConfig = formatConfigs.find(f => f.id === selectedFormat);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'arrowleft':
          handleSeek(-3);
          break;
        case 'arrowright':
          handleSeek(3);
          break;
        case 'r':
          goToEvent();
          break;
        case 'f':
          handleFullscreen();
          break;
        case 'escape':
          onClose();
          break;
        case 'm':
          setIsMuted(m => !m);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent 
        className="w-[95vw] max-w-7xl h-[90vh] p-0 gap-0 bg-background/98 backdrop-blur-xl border-border/50 flex flex-col overflow-hidden"
        hideCloseButton
      >
        <VisuallyHidden.Root>
          <DialogTitle>{clipTitle} - Preview</DialogTitle>
        </VisuallyHidden.Root>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 flex-shrink-0 bg-muted/20">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="font-semibold text-base">{clipTitle}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="arena" className="text-xs">{clipType}</Badge>
                <Badge variant="outline" className="font-mono text-xs">{timestamp}</Badge>
                {matchHalf && (
                  <Badge variant="outline" className="text-xs">
                    {matchHalf === 'first_half' || matchHalf === 'first' ? '1º Tempo' : '2º Tempo'}
                  </Badge>
                )}
                {currentTrim && (
                  <Badge variant="secondary" className="text-xs">
                    Ajustado: {(currentTrim.endOffset - currentTrim.startOffset).toFixed(1)}s
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 border-r border-border/50 flex flex-col h-full bg-muted/10">
            <ScrollArea className="flex-1">
              <Accordion 
                type="multiple" 
                value={openPanels}
                onValueChange={setOpenPanels}
                className="px-2 py-2"
              >
                {/* Formato */}
                <AccordionItem value="formato" className="border-border/30">
                  <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <RectangleVertical className="h-4 w-4 text-primary" />
                      <span className="font-medium">Formato</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="grid grid-cols-2 gap-2">
                      {formatConfigs.map((format) => (
                        <Button
                          key={format.id}
                          variant={selectedFormat === format.id ? 'arena' : 'outline'}
                          size="sm"
                          className="flex flex-col h-auto py-2.5 gap-1"
                          onClick={() => setSelectedFormat(format.id)}
                        >
                          <format.icon className="h-4 w-4" />
                          <span className="text-xs">{format.id}</span>
                        </Button>
                      ))}
                    </div>
                    {currentFormatConfig && (
                      <div className="mt-3 p-2.5 rounded-lg bg-muted/50 border border-border/30">
                        <p className="text-xs font-medium">{currentFormatConfig.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {currentFormatConfig.platforms.join(', ')}
                        </p>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Dispositivo */}
                <AccordionItem value="dispositivo" className="border-border/30">
                  <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Smartphone className="h-4 w-4 text-primary" />
                      <span className="font-medium">Dispositivo</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="space-y-1.5">
                      {deviceConfigs.map((device) => (
                        <Button
                          key={device.id}
                          variant={selectedDevice === device.id ? 'secondary' : 'ghost'}
                          size="sm"
                          className="w-full justify-start gap-2"
                          onClick={() => setSelectedDevice(device.id)}
                        >
                          <device.icon className="h-4 w-4" />
                          <span>{device.label}</span>
                        </Button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Estilos & Overlays */}
                <AccordionItem value="estilos" className="border-border/30">
                  <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Palette className="h-4 w-4 text-primary" />
                      <span className="font-medium">Estilos & Overlays</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <Tabs defaultValue="overlays" className="w-full">
                      <TabsList className="w-full grid grid-cols-3 h-8">
                        <TabsTrigger value="overlays" className="text-[10px] gap-1 px-1">
                          <Layers className="h-3 w-3" />
                          Overlays
                        </TabsTrigger>
                        <TabsTrigger value="legendas" className="text-[10px] gap-1 px-1">
                          <Type className="h-3 w-3" />
                          Legendas
                        </TabsTrigger>
                        <TabsTrigger value="textos" className="text-[10px] gap-1 px-1">
                          <PenTool className="h-3 w-3" />
                          Textos
                        </TabsTrigger>
                      </TabsList>
                      
                      {/* Tab: Overlays */}
                      <TabsContent value="overlays" className="space-y-3 mt-3">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Logo / Patrocinador</Label>
                          <div className="border-2 border-dashed border-border/50 rounded-lg p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors">
                            <Upload className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                            <p className="text-[10px] text-muted-foreground">Arraste ou clique</p>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Posição</Label>
                          <div className="grid grid-cols-3 gap-1">
                            {logoPositions.map(pos => (
                              <Button 
                                key={pos} 
                                variant={logoPosition === pos ? 'secondary' : 'ghost'} 
                                size="sm" 
                                className="h-7 text-[10px] px-1"
                                onClick={() => setLogoPosition(pos)}
                              >
                                {pos.split('-').map(p => p[0].toUpperCase()).join('')}
                              </Button>
                            ))}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs font-medium">Opacidade</Label>
                            <Badge variant="outline" className="text-[10px] h-5">{logoOpacity}%</Badge>
                          </div>
                          <Slider 
                            value={[logoOpacity]} 
                            onValueChange={([v]) => setLogoOpacity(v)} 
                            max={100} 
                            step={5}
                            className="w-full"
                          />
                        </div>
                      </TabsContent>
                      
                      {/* Tab: Legendas */}
                      <TabsContent value="legendas" className="space-y-3 mt-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium">Exibir Legendas (SRT)</Label>
                          <Switch 
                            checked={showSubtitles} 
                            onCheckedChange={setShowSubtitles}
                            className="scale-75"
                          />
                        </div>
                        
                        {showSubtitles && (
                          <>
                            <div className="bg-muted/50 rounded p-2 text-center border border-border/30">
                              <p className="text-xs italic text-muted-foreground">"Legenda de exemplo..."</p>
                            </div>
                            
                            <div className="space-y-2">
                              <Label className="text-xs font-medium">Estilo</Label>
                              <div className="grid grid-cols-2 gap-1.5">
                                {['Clássico', 'Moderno', 'Neon', 'Mínimo'].map(style => (
                                  <Button 
                                    key={style}
                                    variant={subtitleStyle === style.toLowerCase() ? 'secondary' : 'outline'} 
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => setSubtitleStyle(style.toLowerCase())}
                                  >
                                    {style}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </TabsContent>
                      
                      {/* Tab: Textos */}
                      <TabsContent value="textos" className="space-y-3 mt-3">
                        <Button variant="outline" size="sm" className="w-full gap-2 h-8">
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar Texto
                        </Button>
                        <p className="text-[10px] text-muted-foreground text-center py-3">
                          Nenhum texto adicionado
                        </p>
                      </TabsContent>
                    </Tabs>
                  </AccordionContent>
                </AccordionItem>

                {/* Ajuste de Corte */}
                <AccordionItem value="corte" className="border-border/30">
                  <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Scissors className="h-4 w-4 text-primary" />
                      <span className="font-medium">Ajuste de Corte</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-muted/30 rounded-lg border border-border/30">
                          <p className="text-[10px] text-muted-foreground">Início</p>
                          <p className="text-sm font-mono font-medium">{currentTrim?.startOffset?.toFixed(1) || '-15.0'}s</p>
                        </div>
                        <div className="p-2 bg-primary/10 rounded-lg border border-primary/30">
                          <p className="text-[10px] text-primary">Evento</p>
                          <p className="text-sm font-mono font-medium">0.0s</p>
                        </div>
                        <div className="p-2 bg-muted/30 rounded-lg border border-border/30">
                          <p className="text-[10px] text-muted-foreground">Fim</p>
                          <p className="text-sm font-mono font-medium">+{currentTrim?.endOffset?.toFixed(1) || '15.0'}s</p>
                        </div>
                      </div>
                      
                      <Button
                        variant={showTimelineEditor ? 'secondary' : 'outline'}
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => setShowTimelineEditor(!showTimelineEditor)}
                      >
                        <Settings2 className="h-4 w-4" />
                        {showTimelineEditor ? 'Fechar Editor' : 'Abrir Timeline Editor'}
                        <ChevronDown className={cn(
                          "h-3 w-3 ml-auto transition-transform",
                          showTimelineEditor && "rotate-180"
                        )} />
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Exportação */}
                <AccordionItem value="exportacao" className="border-border/30">
                  <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Download className="h-4 w-4 text-primary" />
                      <span className="font-medium">Exportação</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Qualidade</Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {['720p', '1080p', '4K'].map(q => (
                            <Button key={q} variant="outline" size="sm" className="text-xs h-7">
                              {q}
                            </Button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Formato</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {['MP4', 'MOV'].map(f => (
                            <Button key={f} variant="outline" size="sm" className="text-xs h-7">
                              {f}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </ScrollArea>
            
            {/* Sidebar Footer */}
            <div className="border-t border-border/50 p-3 flex-shrink-0 bg-muted/20">
              <Button 
                className="w-full gap-2" 
                variant="arena"
                onClick={handleDownload}
                disabled={!clipUrl}
              >
                <Download className="h-4 w-4" />
                Exportar Clip
              </Button>
            </div>
          </div>

          {/* Preview Area */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Video Preview */}
            <div className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden bg-gradient-to-br from-muted/20 to-muted/5">
              <DeviceMockup 
                format={selectedFormat} 
                size={getDeviceSize()}
                allowRotation={selectedFormat === '9:16' || selectedFormat === '4:5'}
              >
                <div className="relative w-full h-full bg-black">
                  {clipUrl ? (
                    <video
                      ref={videoRef}
                      src={clipUrl}
                      poster={posterUrl}
                      className={cn(
                        "absolute inset-0 w-full h-full",
                        selectedFormat === '9:16' || selectedFormat === '4:5' 
                          ? "object-cover" 
                          : "object-contain"
                      )}
                      autoPlay
                      loop
                      muted={isMuted}
                      playsInline
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      <p className="text-sm">Clip não disponível</p>
                    </div>
                  )}
                  
                  {/* Format indicator overlay */}
                  <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none">
                    <Badge 
                      variant="arena" 
                      className="text-xs backdrop-blur bg-primary/80"
                    >
                      {selectedFormat}
                    </Badge>
                  </div>
                </div>
              </DeviceMockup>
            </div>
            
            {/* Player Controls Bar */}
            {clipUrl && (
              <div className="border-t border-border/50 bg-muted/30 p-3 flex-shrink-0 space-y-2">
                {/* Progress Bar */}
                <Slider
                  value={[currentTime]}
                  min={0}
                  max={duration || 30}
                  step={0.1}
                  onValueChange={handleProgressChange}
                  className="w-full"
                />
                
                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {/* Go to Start */}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={goToStart}
                      title="Ir para início"
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    
                    {/* -3s */}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 gap-1 px-2"
                      onClick={() => handleSeek(-3)}
                      title="Voltar 3s (←)"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span className="text-xs">3s</span>
                    </Button>
                    
                    {/* Play/Pause */}
                    <Button 
                      variant="secondary" 
                      size="icon" 
                      className="h-9 w-9"
                      onClick={togglePlayPause}
                      title="Play/Pause (Espaço)"
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4 ml-0.5" />
                      )}
                    </Button>
                    
                    {/* +3s */}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 gap-1 px-2"
                      onClick={() => handleSeek(3)}
                      title="Avançar 3s (→)"
                    >
                      <span className="text-xs">3s</span>
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                    
                    {/* Go to Event */}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={goToEvent}
                      title="Ir para evento (R)"
                    >
                      <Target className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Time Display */}
                  <span className="font-mono text-sm text-muted-foreground tabular-nums">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                  
                  {/* Auxiliary Controls */}
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setIsMuted(!isMuted)}
                      title="Mudo (M)"
                    >
                      {isMuted ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={handleFullscreen}
                      title="Tela cheia (F)"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Timeline Editor (collapsible) */}
            <Collapsible open={showTimelineEditor} onOpenChange={setShowTimelineEditor}>
              <CollapsibleContent>
                <div className="border-t border-border/50 p-3 bg-muted/20 max-h-[160px] overflow-y-auto">
                  <VideoTimelineEditor
                    videoRef={videoRef}
                    eventSecond={eventSecond}
                    videoDuration={videoDuration}
                    initialTrim={currentTrim}
                    onTrimChange={handleTrimChange}
                    onSave={handleTrimSave}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}