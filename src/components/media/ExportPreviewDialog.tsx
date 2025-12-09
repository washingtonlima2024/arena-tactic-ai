import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  X, 
  Smartphone, 
  Tablet, 
  Monitor, 
  Play, 
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Square,
  RectangleVertical,
  RectangleHorizontal,
  Eye,
  ListVideo,
  Check,
  Repeat,
  Share2,
  ChevronLeft,
  Settings2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { TransitionVignette } from './TransitionVignette';
import { ClipVignette } from './ClipVignette';
import arenaPlayLogo from '@/assets/arena-play-icon.png';
import { toast } from 'sonner';

// Video formats
const VIDEO_FORMATS = [
  { id: '9:16', name: 'Stories/Reels', ratio: '9:16', width: 1080, height: 1920, icon: RectangleVertical },
  { id: '16:9', name: 'Widescreen', ratio: '16:9', width: 1920, height: 1080, icon: RectangleHorizontal },
  { id: '1:1', name: 'Quadrado', ratio: '1:1', width: 1080, height: 1080, icon: Square },
  { id: '4:5', name: 'Feed Vertical', ratio: '4:5', width: 1080, height: 1350, icon: RectangleVertical },
];

// Device types with responsive dimensions
const DEVICES = [
  { 
    id: 'phone', 
    name: 'Celular', 
    icon: Smartphone, 
    bestFor: ['9:16', '4:5'],
    dimensions: { base: { w: 280, h: 560 }, sm: { w: 320, h: 640 }, lg: { w: 360, h: 720 } },
    borderRadius: 40,
    padding: 12
  },
  { 
    id: 'tablet', 
    name: 'Tablet', 
    icon: Tablet, 
    bestFor: ['1:1', '4:5'],
    dimensions: { base: { w: 380, h: 520 }, sm: { w: 480, h: 640 }, lg: { w: 560, h: 750 } },
    borderRadius: 24,
    padding: 16
  },
  { 
    id: 'desktop', 
    name: 'Computador', 
    icon: Monitor, 
    bestFor: ['16:9', '1:1'],
    dimensions: { base: { w: 500, h: 340 }, sm: { w: 640, h: 420 }, lg: { w: 800, h: 520 } },
    borderRadius: 12,
    padding: 8
  },
];

interface Clip {
  id: string;
  title: string;
  type: string;
  minute: number;
  second?: number;
  description?: string;
  thumbnail?: string;
  clipUrl?: string | null;
  totalSeconds?: number;
}

interface ExportPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clips: Clip[];
  matchVideo?: {
    file_url: string;
    duration_seconds?: number | null;
  } | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

type PlaybackState = 
  | { type: 'idle' }
  | { type: 'opening' }
  | { type: 'clip'; index: number }
  | { type: 'transition'; nextIndex: number }
  | { type: 'closing' }
  | { type: 'complete' };

export function ExportPreviewDialog({
  isOpen,
  onClose,
  clips,
  matchVideo,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore
}: ExportPreviewDialogProps) {
  // Setup state
  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [selectedFormat, setSelectedFormat] = useState(VIDEO_FORMATS[0]);
  const [selectedDevice, setSelectedDevice] = useState(DEVICES[0]);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());
  const [includeVignettes, setIncludeVignettes] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Preview state
  const [playbackState, setPlaybackState] = useState<PlaybackState>({ type: 'idle' });
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [clipProgress, setClipProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get selected clips in order
  const selectedClips = clips.filter(c => selectedClipIds.has(c.id));
  const currentClipIndex = playbackState.type === 'clip' ? playbackState.index : -1;
  const currentClip = currentClipIndex >= 0 ? selectedClips[currentClipIndex] : null;

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep('config');
      setPlaybackState({ type: 'idle' });
      setSelectedClipIds(new Set());
      setClipProgress(0);
      setShowSettings(false);
    }
  }, [isOpen]);

  // Auto-select device based on format
  useEffect(() => {
    const bestDevice = DEVICES.find(d => d.bestFor.includes(selectedFormat.id)) || DEVICES[0];
    setSelectedDevice(bestDevice);
  }, [selectedFormat]);

  // Toggle clip selection
  const toggleClip = (clipId: string) => {
    setSelectedClipIds(prev => {
      const next = new Set(prev);
      if (next.has(clipId)) {
        next.delete(clipId);
      } else {
        next.add(clipId);
      }
      return next;
    });
  };

  // Select all clips
  const selectAll = () => {
    if (selectedClipIds.size === clips.length) {
      setSelectedClipIds(new Set());
    } else {
      setSelectedClipIds(new Set(clips.map(c => c.id)));
    }
  };

  // Start preview
  const startPreview = () => {
    if (selectedClips.length === 0) return;
    setStep('preview');
    setPlaybackState(includeVignettes ? { type: 'opening' } : { type: 'clip', index: 0 });
  };

  // Handle opening complete
  const handleOpeningComplete = useCallback(() => {
    if (selectedClips.length > 0) {
      setClipProgress(0);
      setPlaybackState({ type: 'clip', index: 0 });
    } else {
      setPlaybackState({ type: 'complete' });
    }
  }, [selectedClips.length]);

  // Handle clip end
  const handleClipEnd = useCallback(() => {
    if (playbackState.type !== 'clip') return;
    
    const nextIndex = playbackState.index + 1;
    
    if (nextIndex >= selectedClips.length) {
      if (includeVignettes) {
        setPlaybackState({ type: 'closing' });
      } else {
        setPlaybackState({ type: 'complete' });
      }
    } else {
      if (includeVignettes) {
        setPlaybackState({ type: 'transition', nextIndex });
      } else {
        setClipProgress(0);
        setPlaybackState({ type: 'clip', index: nextIndex });
      }
    }
  }, [playbackState, selectedClips.length, includeVignettes]);

  // Handle transition complete
  const handleTransitionComplete = useCallback(() => {
    if (playbackState.type === 'transition') {
      setClipProgress(0);
      setPlaybackState({ type: 'clip', index: playbackState.nextIndex });
    }
  }, [playbackState]);

  // Handle closing complete
  const handleClosingComplete = useCallback(() => {
    setPlaybackState({ type: 'complete' });
  }, []);

  // Navigate to specific clip
  const goToClip = (index: number) => {
    if (index >= 0 && index < selectedClips.length) {
      setClipProgress(0);
      setPlaybackState({ type: 'clip', index });
    }
  };

  // Video time update
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration) {
        setClipProgress((video.currentTime / video.duration) * 100);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, []);

  // Pause/play sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPaused) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [isPaused]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  // Share functionality
  const handleShare = async () => {
    const shareData = {
      title: `${homeTeam} vs ${awayTeam} - Melhores Momentos`,
      text: `Confira os melhores momentos: ${homeTeam} ${homeScore} x ${awayScore} ${awayTeam}`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toast.success('Conteúdo compartilhado!');
      } else {
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
        toast.success('Link copiado para a área de transferência!');
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        toast.error('Erro ao compartilhar');
      }
    }
  };

  // Get aspect ratio style for device screen
  const getScreenStyle = () => {
    const [w, h] = selectedFormat.ratio.split(':').map(Number);
    return { aspectRatio: `${w}/${h}` };
  };

  // Render config step
  if (step === 'config') {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <VisuallyHidden>
            <DialogTitle>Exportar Preview</DialogTitle>
          </VisuallyHidden>
          
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Exportar para Redes Sociais</h2>
                <p className="text-sm text-muted-foreground">
                  Configure o formato, dispositivo e clips para preview
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left: Format & Device Selection */}
              <div className="space-y-6">
                {/* Format Selection */}
                <div className="space-y-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <RectangleVertical className="h-4 w-4 text-primary" />
                    Formato do Vídeo
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {VIDEO_FORMATS.map(format => {
                      const IconComponent = format.icon;
                      return (
                        <Card
                          key={format.id}
                          className={cn(
                            "cursor-pointer transition-all hover:border-primary/50",
                            selectedFormat.id === format.id && "border-primary bg-primary/10"
                          )}
                          onClick={() => setSelectedFormat(format)}
                        >
                          <CardContent className="p-3 text-center">
                            <IconComponent className="h-6 w-6 mx-auto mb-1 text-primary" />
                            <p className="text-xs font-medium">{format.name}</p>
                            <p className="text-[10px] text-muted-foreground">{format.ratio}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Device Selection */}
                <div className="space-y-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    Dispositivo de Preview
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {DEVICES.map(device => {
                      const IconComponent = device.icon;
                      const isRecommended = device.bestFor.includes(selectedFormat.id);
                      return (
                        <Card
                          key={device.id}
                          className={cn(
                            "cursor-pointer transition-all hover:border-primary/50",
                            selectedDevice.id === device.id && "border-primary bg-primary/10"
                          )}
                          onClick={() => setSelectedDevice(device)}
                        >
                          <CardContent className="p-3 text-center">
                            <IconComponent className="h-6 w-6 mx-auto mb-1 text-primary" />
                            <p className="text-xs font-medium">{device.name}</p>
                            {isRecommended && (
                              <Badge variant="arena" className="text-[8px] mt-1">
                                Ideal
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Options */}
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Checkbox
                    id="vignettes"
                    checked={includeVignettes}
                    onCheckedChange={(checked) => setIncludeVignettes(!!checked)}
                  />
                  <label htmlFor="vignettes" className="text-sm cursor-pointer">
                    Incluir vinhetas animadas (abertura, transições, encerramento)
                  </label>
                </div>
              </div>

              {/* Right: Clip Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium flex items-center gap-2">
                    <ListVideo className="h-4 w-4 text-primary" />
                    Selecionar Clips ({selectedClipIds.size}/{clips.length})
                  </h3>
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    {selectedClipIds.size === clips.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                  </Button>
                </div>
                
                <ScrollArea className="h-[300px] border rounded-lg p-2">
                  <div className="space-y-2">
                    {clips.map(clip => (
                      <div
                        key={clip.id}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                          selectedClipIds.has(clip.id) 
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-muted"
                        )}
                        onClick={() => toggleClip(clip.id)}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          selectedClipIds.has(clip.id) 
                            ? "bg-primary border-primary" 
                            : "border-muted-foreground/30"
                        )}>
                          {selectedClipIds.has(clip.id) && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        
                        {clip.thumbnail ? (
                          <img 
                            src={clip.thumbnail} 
                            alt={clip.title}
                            className="w-16 h-10 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-10 bg-muted rounded flex items-center justify-center">
                            <Play className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{clip.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {clip.minute}' • {clip.type.replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {selectedClipIds.size > 0 
                  ? `${selectedClipIds.size} clips selecionados • Formato ${selectedFormat.ratio} • ${selectedDevice.name}`
                  : 'Selecione pelo menos um clip para continuar'
                }
              </div>
              <Button 
                variant="arena" 
                onClick={startPreview}
                disabled={selectedClipIds.size === 0}
              >
                <Eye className="mr-2 h-4 w-4" />
                Iniciar Preview
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Render preview step - responsive layout
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-[100vw] w-full h-[100vh] p-0 border-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950"
        hideCloseButton
      >
        <VisuallyHidden>
          <DialogTitle>Preview de Exportação</DialogTitle>
        </VisuallyHidden>
        
        <div ref={containerRef} className="flex flex-col h-full">
          {/* Header - responsive */}
          <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-white/10">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setStep('config')}
                className="text-white hover:bg-white/10 h-8 w-8 sm:h-10 sm:w-10"
              >
                <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <div>
                <h2 className="text-white font-medium text-sm sm:text-base">Preview</h2>
                <p className="text-white/60 text-xs sm:text-sm hidden sm:block">
                  {selectedFormat.name} ({selectedFormat.ratio}) • {selectedDevice.name}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Device selector in preview - responsive */}
              <div className="hidden md:flex items-center gap-1 mr-2 p-1 bg-white/10 rounded-lg">
                {DEVICES.map(device => {
                  const IconComponent = device.icon;
                  return (
                    <button
                      key={device.id}
                      onClick={() => setSelectedDevice(device)}
                      className={cn(
                        "p-2 rounded transition-all",
                        selectedDevice.id === device.id 
                          ? "bg-primary text-primary-foreground" 
                          : "text-white/60 hover:text-white hover:bg-white/10"
                      )}
                      title={device.name}
                    >
                      <IconComponent className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>

              {/* Mobile device selector button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-white hover:bg-white/10 h-8 w-8"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>

              <Badge variant="arena" className="text-xs">
                {currentClipIndex >= 0 ? `${currentClipIndex + 1}/${selectedClips.length}` : '0/0'}
              </Badge>
              
              <Button 
                variant="ghost" 
                size="icon"
                className="text-white hover:bg-white/10 h-8 w-8 sm:h-10 sm:w-10"
                onClick={handleShare}
                title="Compartilhar"
              >
                <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon"
                className="text-white hover:bg-white/10 h-8 w-8 sm:h-10 sm:w-10"
                onClick={onClose}
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>

          {/* Mobile settings panel */}
          {showSettings && (
            <div className="md:hidden px-4 py-3 bg-black/50 border-b border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Dispositivo:</span>
                <div className="flex items-center gap-1 p-1 bg-white/10 rounded-lg">
                  {DEVICES.map(device => {
                    const IconComponent = device.icon;
                    return (
                      <button
                        key={device.id}
                        onClick={() => {
                          setSelectedDevice(device);
                          setShowSettings(false);
                        }}
                        className={cn(
                          "p-2 rounded transition-all",
                          selectedDevice.id === device.id 
                            ? "bg-primary text-primary-foreground" 
                            : "text-white/60 hover:text-white hover:bg-white/10"
                        )}
                      >
                        <IconComponent className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Main content - responsive device mockup */}
          <div className="flex-1 flex items-center justify-center p-2 sm:p-4 md:p-8 overflow-hidden">
            {playbackState.type === 'complete' ? (
              /* Complete screen - responsive */
              <div className="text-center text-white space-y-4 sm:space-y-6 px-4">
                <div className="relative inline-block">
                  <div className="absolute inset-0 blur-2xl bg-primary/30 animate-pulse" />
                  <img src={arenaPlayLogo} alt="Arena Play" className="relative h-12 sm:h-16 md:h-20 mx-auto" />
                </div>
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold">Preview Concluído!</h2>
                <p className="text-white/60 text-sm sm:text-base">
                  {selectedClips.length} clips • {selectedFormat.ratio} • {selectedDevice.name}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setPlaybackState({ type: 'idle' });
                      startPreview();
                    }}
                    className="border-white/30 text-white hover:bg-white/10"
                    size="sm"
                  >
                    <Repeat className="mr-2 h-4 w-4" />
                    Repetir
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setStep('config')}
                    className="border-primary/50 text-primary hover:bg-primary/10"
                    size="sm"
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button 
                    variant="arena"
                    onClick={handleShare}
                    size="sm"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Compartilhar
                  </Button>
                </div>
              </div>
            ) : (
              /* Device mockup with content - responsive sizing */
              <div 
                className="relative transition-all duration-500 w-full max-w-fit"
              >
                {/* Device frame - responsive dimensions */}
                <div 
                  className={cn(
                    "relative bg-gray-900 shadow-2xl border-4 border-gray-800 mx-auto",
                    "transition-all duration-300"
                  )}
                  style={{
                    width: `min(${selectedDevice.dimensions.lg.w}px, calc(100vw - 32px))`,
                    maxHeight: `min(${selectedDevice.dimensions.lg.h}px, calc(100vh - 200px))`,
                    borderRadius: selectedDevice.borderRadius,
                    padding: selectedDevice.padding,
                  }}
                >
                  {/* Phone notch */}
                  {selectedDevice.id === 'phone' && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-5 sm:h-7 bg-black rounded-b-2xl z-30 flex items-center justify-center gap-2">
                      <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-gray-700" />
                      <div className="w-8 sm:w-12 h-2 sm:h-3 rounded-full bg-gray-800" />
                    </div>
                  )}
                  
                  {/* Tablet camera */}
                  {selectedDevice.id === 'tablet' && (
                    <div className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-gray-700 z-30" />
                  )}
                  
                  {/* Desktop webcam */}
                  {selectedDevice.id === 'desktop' && (
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-gray-700 z-30" />
                  )}

                  {/* Screen */}
                  <div 
                    className="relative bg-black overflow-hidden w-full h-full"
                    style={{
                      borderRadius: Math.max(0, selectedDevice.borderRadius - selectedDevice.padding - 4),
                      ...getScreenStyle(),
                    }}
                  >
                    {/* Opening Vignette */}
                    {playbackState.type === 'opening' && (
                      <div className="absolute inset-0 z-20 bg-gradient-to-br from-gray-900 via-primary/20 to-gray-900 flex items-center justify-center">
                        <div className="text-center text-white animate-in fade-in zoom-in duration-700 p-4">
                          <img src={arenaPlayLogo} alt="Arena Play" className="h-10 sm:h-16 mx-auto mb-2 sm:mb-4" />
                          <h3 className="text-base sm:text-xl font-bold">{homeTeam} vs {awayTeam}</h3>
                          <p className="text-xl sm:text-3xl font-display font-bold mt-1 sm:mt-2">{homeScore} - {awayScore}</p>
                          <p className="text-xs sm:text-sm text-white/60 mt-2 sm:mt-4">Melhores Momentos</p>
                          <div className="mt-3 sm:mt-6 animate-pulse">
                            <div className="w-8 sm:w-12 h-1 bg-primary rounded-full mx-auto" />
                          </div>
                        </div>
                        {/* Auto-advance after 3s */}
                        <div 
                          className="absolute inset-0" 
                          onAnimationEnd={handleOpeningComplete}
                          style={{ animation: 'fadeIn 3s forwards' }}
                        />
                      </div>
                    )}

                    {/* Transition Vignette */}
                    {playbackState.type === 'transition' && selectedClips[playbackState.nextIndex] && (
                      <div className="absolute inset-0 z-20">
                        <TransitionVignette
                          nextClipTitle={selectedClips[playbackState.nextIndex].title}
                          nextClipMinute={selectedClips[playbackState.nextIndex].minute}
                          nextClipType={selectedClips[playbackState.nextIndex].type}
                          onComplete={handleTransitionComplete}
                        />
                      </div>
                    )}

                    {/* Closing Vignette */}
                    {playbackState.type === 'closing' && (
                      <div className="absolute inset-0 z-20 bg-gradient-to-br from-gray-900 via-primary/20 to-gray-900 flex items-center justify-center">
                        <div className="text-center text-white animate-in fade-in zoom-in duration-500 p-4">
                          <img src={arenaPlayLogo} alt="Arena Play" className="h-8 sm:h-12 mx-auto mb-2 sm:mb-4 opacity-80" />
                          <p className="text-base sm:text-lg font-medium">FIM</p>
                          <p className="text-xs sm:text-sm text-white/60 mt-1 sm:mt-2">{selectedClips.length} clips</p>
                        </div>
                        {/* Auto-advance after 2s */}
                        <div 
                          className="absolute inset-0" 
                          onAnimationEnd={handleClosingComplete}
                          style={{ animation: 'fadeIn 2s forwards' }}
                        />
                      </div>
                    )}

                    {/* Video Player */}
                    {playbackState.type === 'clip' && currentClip && (
                      <div className="absolute inset-0">
                        {/* Clip vignette overlay */}
                        {includeVignettes && currentClip.thumbnail && clipProgress === 0 && (
                          <div className="absolute inset-0 z-10">
                            <ClipVignette
                              thumbnailUrl={currentClip.thumbnail}
                              eventType={currentClip.type}
                              minute={currentClip.minute}
                              title={currentClip.title}
                              homeTeam={homeTeam}
                              awayTeam={awayTeam}
                              homeScore={homeScore}
                              awayScore={awayScore}
                              onComplete={() => {
                                videoRef.current?.play().catch(() => {});
                              }}
                              duration={2000}
                            />
                          </div>
                        )}
                        
                        {/* Video or thumbnail */}
                        {(currentClip.clipUrl || matchVideo?.file_url) ? (
                          <video
                            ref={videoRef}
                            src={currentClip.clipUrl || matchVideo?.file_url}
                            className="w-full h-full object-cover"
                            autoPlay={!includeVignettes || !currentClip.thumbnail}
                            muted={isMuted}
                            playsInline
                            onEnded={handleClipEnd}
                          />
                        ) : currentClip.thumbnail ? (
                          <div className="relative w-full h-full">
                            <img 
                              src={currentClip.thumbnail} 
                              alt={currentClip.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                            <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 right-2 sm:right-4 text-white">
                              <Badge variant="arena" className="mb-1 sm:mb-2 text-xs">
                                {currentClip.type.replace(/_/g, ' ')}
                              </Badge>
                              <p className="text-lg sm:text-2xl font-bold">{currentClip.minute}'</p>
                              <p className="text-xs sm:text-sm opacity-80 truncate">{currentClip.title}</p>
                            </div>
                            {/* Auto-advance timer */}
                            <StaticClipTimer duration={5000} onComplete={handleClipEnd} />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-900">
                            <div className="text-center text-white p-4">
                              <Play className="h-8 sm:h-12 w-8 sm:w-12 mx-auto mb-2 text-primary" />
                              <p className="text-sm sm:text-lg font-medium truncate">{currentClip.title}</p>
                              <p className="text-xs sm:text-sm text-white/60">{currentClip.minute}'</p>
                            </div>
                            <StaticClipTimer duration={5000} onComplete={handleClipEnd} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Phone home indicator */}
                  {selectedDevice.id === 'phone' && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1/3 h-0.5 sm:h-1 bg-white/50 rounded-full z-40" />
                  )}
                  
                  {/* Phone side buttons */}
                  {selectedDevice.id === 'phone' && (
                    <>
                      <div className="absolute -left-1 top-20 sm:top-24 w-1 h-6 sm:h-8 bg-gray-700 rounded-l" />
                      <div className="absolute -left-1 top-28 sm:top-36 w-1 h-10 sm:h-12 bg-gray-700 rounded-l" />
                      <div className="absolute -right-1 top-24 sm:top-32 w-1 h-12 sm:h-16 bg-gray-700 rounded-r" />
                    </>
                  )}
                </div>

                {/* Desktop stand */}
                {selectedDevice.id === 'desktop' && (
                  <div className="flex flex-col items-center">
                    <div className="w-16 sm:w-24 h-4 sm:h-6 bg-gradient-to-b from-gray-800 to-gray-900" />
                    <div className="w-28 sm:w-40 h-2 sm:h-3 bg-gray-800 rounded-lg" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom controls - responsive */}
          {playbackState.type !== 'complete' && (
            <div className="border-t border-white/10 bg-black/50 backdrop-blur-lg px-3 sm:px-6 py-2 sm:py-4">
              {/* Clip timeline - scrollable */}
              <div className="flex gap-1.5 sm:gap-2 mb-2 sm:mb-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/20">
                {selectedClips.map((clip, index) => (
                  <button
                    key={clip.id}
                    onClick={() => goToClip(index)}
                    className={cn(
                      "flex-shrink-0 w-14 sm:w-20 h-8 sm:h-12 rounded overflow-hidden border-2 transition-all",
                      index === currentClipIndex 
                        ? "border-primary scale-105 sm:scale-110 shadow-[0_0_20px_hsl(var(--primary)/0.5)]" 
                        : index < currentClipIndex 
                        ? "border-primary/50 opacity-60" 
                        : "border-white/20 opacity-40 hover:opacity-80"
                    )}
                  >
                    {clip.thumbnail ? (
                      <img src={clip.thumbnail} alt={clip.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Play className="h-3 sm:h-4 w-3 sm:w-4 text-muted-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Playback controls - responsive */}
              <div className="flex items-center justify-center gap-2 sm:gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-8 w-8 sm:h-10 sm:w-10"
                  onClick={() => goToClip(Math.max(0, currentClipIndex - 1))}
                  disabled={currentClipIndex <= 0}
                >
                  <SkipBack className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 sm:h-12 sm:w-12 text-white hover:bg-white/20"
                  onClick={() => setIsPaused(!isPaused)}
                >
                  {isPaused ? <Play className="h-6 w-6 sm:h-8 sm:w-8 fill-white" /> : <Pause className="h-6 w-6 sm:h-8 sm:w-8" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-8 w-8 sm:h-10 sm:w-10"
                  onClick={() => goToClip(Math.min(selectedClips.length - 1, currentClipIndex + 1))}
                  disabled={currentClipIndex >= selectedClips.length - 1}
                >
                  <SkipForward className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>

                <div className="w-px h-6 sm:h-8 bg-white/20 mx-1 sm:mx-2 hidden sm:block" />

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-8 w-8 sm:h-10 sm:w-10"
                  onClick={() => setIsMuted(!isMuted)}
                >
                  {isMuted ? <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-8 w-8 sm:h-10 sm:w-10 hidden sm:flex"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Minimize className="h-4 w-4 sm:h-5 sm:w-5" /> : <Maximize className="h-4 w-4 sm:h-5 sm:w-5" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Timer for static clips (no video)
function StaticClipTimer({ duration, onComplete }: { duration: number; onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, duration);
    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  return null;
}
