import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  Layers,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { parseSRT } from '@/lib/transcriptionParser';
import { apiClient, getApiBase } from '@/lib/apiClient';

type DeviceFormat = '9:16' | '16:9' | '1:1' | '4:5';
type DeviceType = 'phone' | 'tablet' | 'desktop';
type ClipMode = 'auto' | 'custom';

interface CustomText {
  id: string;
  content: string;
  position: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  opacity: number;
}

interface ClipPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  clipUrl: string | null;
  clipTitle: string;
  clipType: string;
  timestamp: string;
  matchId?: string;
  matchHalf?: string;
  posterUrl?: string;
  eventId?: string;
  eventSecond?: number;
  videoDuration?: number;
  fullVideoUrl?: string | null;      // URL do vídeo completo para modo personalizado
  fullVideoDuration?: number;        // Duração do vídeo completo
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

// Position helper
const getPositionClasses = (position: string) => {
  const positions: Record<string, string> = {
    'top-left': 'top-3 left-3',
    'top-center': 'top-3 left-1/2 -translate-x-1/2',
    'top-right': 'top-3 right-3',
    'center-left': 'top-1/2 left-3 -translate-y-1/2',
    'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    'center-right': 'top-1/2 right-3 -translate-y-1/2',
    'bottom-left': 'bottom-12 left-3',
    'bottom-center': 'bottom-12 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-12 right-3',
  };
  return positions[position] || positions['top-left'];
};

// Subtitle style helper
const getSubtitleStyleClasses = (style: string) => {
  const styles: Record<string, string> = {
    'classico': 'bg-black/80 text-white',
    'moderno': 'bg-gradient-to-r from-primary/90 to-primary/70 text-white',
    'neon': 'bg-transparent border-2 border-green-400 text-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]',
    'minimo': 'bg-transparent text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]',
  };
  return styles[style] || styles['classico'];
};

export function ClipPreviewModal({
  isOpen,
  onClose,
  clipUrl,
  clipTitle,
  clipType,
  timestamp,
  matchId,
  matchHalf,
  posterUrl,
  eventId,
  eventSecond = 0,
  videoDuration = 30,
  fullVideoUrl,
  fullVideoDuration,
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
  const [duration, setDuration] = useState(videoDuration);
  
  // Clip Mode
  const [clipMode, setClipMode] = useState<ClipMode>('auto');
  
  // Timeline Editor
  const [showTimelineEditor, setShowTimelineEditor] = useState(false);
  const [currentTrim, setCurrentTrim] = useState(initialTrim);
  
  // Regeneration state
  const [isRegenerating, setIsRegenerating] = useState(false);
  
  // Absolute timestamps for custom mode (in seconds)
  const [absoluteStart, setAbsoluteStart] = useState(Math.max(0, eventSecond - 15));
  const [absoluteEnd, setAbsoluteEnd] = useState(eventSecond + 15);
  
  // Determine which video to use based on mode
  // Auto: prefer clip, fallback to full video if clip doesn't exist
  // Custom: always use full video
  const activeVideoUrl = clipMode === 'custom' 
    ? (fullVideoUrl || clipUrl)         // Custom: prefer full video
    : (clipUrl || fullVideoUrl);        // Auto: prefer clip, but use full video if no clip
  const activeVideoDuration = clipMode === 'custom' 
    ? (fullVideoDuration || videoDuration)
    : clipUrl ? videoDuration : (fullVideoDuration || videoDuration);
  
  // Logo Overlay
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState('top-left');
  const [logoOpacity, setLogoOpacity] = useState(80);
  
  // Subtitles
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [subtitleStyle, setSubtitleStyle] = useState('classico');
  const [subtitleText, setSubtitleText] = useState('');
  const [subtitles, setSubtitles] = useState<Array<{start: number; end: number; text: string}>>([]);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);
  const [subtitlesLoaded, setSubtitlesLoaded] = useState(false);
  
  // Custom Texts
  const [customTexts, setCustomTexts] = useState<CustomText[]>([]);
  
  // Overlay opacity
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  
  // Accordion state
  const [openPanels, setOpenPanels] = useState(['formato', 'dispositivo']);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFormat('9:16');
      setSelectedDevice('phone');
      setIsMuted(true);
      setIsPlaying(true);
      setCurrentTrim(initialTrim);
      setCurrentTime(0);
      setDuration(videoDuration);
      setLogoFile(null);
      setLogoUrl(null);
      setCustomTexts([]);
      setSubtitleText('');
      setSubtitles([]);
      setShowSubtitles(false);
      setOverlayOpacity(0);
      // Reset absolute timestamps with protection for eventSecond exceeding video duration
      const maxDuration = fullVideoDuration || videoDuration;
      const effectiveEventSecond = eventSecond > maxDuration 
        ? Math.min(maxDuration / 2, 30)  // Fallback to safe position
        : eventSecond;
      setAbsoluteStart(Math.max(0, effectiveEventSecond - 15));
      setAbsoluteEnd(Math.min(maxDuration, effectiveEventSecond + 15));
      
      // ALWAYS start in Auto mode - never start in Custom mode by default
      setClipMode('auto');
      setShowTimelineEditor(false);
    }
  }, [isOpen, initialTrim, videoDuration, eventSecond, fullVideoDuration, clipUrl, fullVideoUrl]);

  // Handle clip mode change - position video at event time when entering custom mode
  useEffect(() => {
    if (clipMode === 'custom') {
      // Always show timeline editor in custom mode
      setShowTimelineEditor(true);
      // Position video at the event time when switching to custom mode
      if (videoRef.current && activeVideoUrl && eventSecond > 0) {
        videoRef.current.currentTime = eventSecond;
        setCurrentTime(eventSecond);
      }
    } else if (clipMode === 'auto') {
      setShowTimelineEditor(false);
    }
  }, [clipMode, eventSecond, activeVideoUrl]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration || videoDuration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleLoadedMetadata = () => {
      const actualDuration = video.duration || videoDuration;
      setDuration(actualDuration);
      
      // Calculate safe eventSecond that respects video duration
      const effectiveEventSecond = eventSecond > actualDuration 
        ? Math.min(actualDuration / 2, 30)  // Fallback to safe position
        : eventSecond;
      
      // Auto-seek to event time when:
      // 1. In custom mode, OR
      // 2. In auto mode but using fullVideoUrl (no clip exists)
      const shouldSeek = clipMode === 'custom' || (!clipUrl && fullVideoUrl);
      if (shouldSeek && effectiveEventSecond > 0) {
        video.currentTime = effectiveEventSecond;
        setCurrentTime(effectiveEventSecond);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Initialize duration if video already has metadata
    if (video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
      // Also seek if custom mode and video already loaded
      if (clipMode === 'custom' && eventSecond > 0 && video.currentTime < 1) {
        video.currentTime = eventSecond;
        setCurrentTime(eventSecond);
      }
    }

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [clipUrl, videoDuration, clipMode, eventSecond]);

  // Update video muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Sync subtitles with video time
  useEffect(() => {
    if (!showSubtitles || subtitles.length === 0) {
      setSubtitleText('');
      return;
    }
    
    const current = subtitles.find(
      sub => currentTime >= sub.start && currentTime <= sub.end
    );
    setSubtitleText(current?.text || '');
  }, [currentTime, showSubtitles, subtitles]);

  // Load real subtitles from match when enabled
  useEffect(() => {
    if (!showSubtitles || subtitlesLoaded || !matchId) return;
    
    const loadSubtitles = async () => {
      setIsLoadingSubtitles(true);
      try {
        // Get list of files for the match
        const filesData = await apiClient.listMatchFiles(matchId);
        
        // Find SRT files
        const srtFiles = filesData.files?.srt || [];
        
        if (srtFiles.length === 0) {
          // No SRT found, use example subtitles
          console.log('[ClipPreview] No SRT files found, using examples');
          setSubtitles([
            { start: 0, end: 5, text: 'Legenda não disponível...' },
          ]);
          setSubtitlesLoaded(true);
          return;
        }
        
        // Determine which SRT to use based on matchHalf
        let targetSrt = srtFiles[0]; // Default to first
        const halfPrefix = matchHalf === 'first_half' || matchHalf === 'first' ? 'first' : 'second';
        
        // Try to find specific half SRT
        const halfSrt = srtFiles.find((f: any) => 
          f.name?.toLowerCase().includes(halfPrefix) ||
          f.name?.toLowerCase().includes(`${halfPrefix}_half`)
        );
        
        if (halfSrt) {
          targetSrt = halfSrt;
        } else {
          // Try full match SRT
          const fullSrt = srtFiles.find((f: any) => 
            f.name?.toLowerCase().includes('full') ||
            f.name?.toLowerCase() === 'transcription.srt'
          );
          if (fullSrt) targetSrt = fullSrt;
        }
        
        console.log('[ClipPreview] Loading SRT:', targetSrt.name);
        
        // Fetch the SRT content
        const srtUrl = targetSrt.url || `${getApiBase()}/api/storage/${matchId}/srt/${targetSrt.name}`;
        const response = await fetch(srtUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch SRT: ${response.status}`);
        }
        
        const srtContent = await response.text();
        
        // Parse SRT content
        const parsed = parseSRT(srtContent);
        
        if (parsed.length > 0) {
          // Convert to simple format and adjust times relative to clip
          // The clip starts at (eventSecond - 15) in the original video
          const clipStartInVideo = Math.max(0, eventSecond - 15);
          
          const clipSubtitles = parsed
            .filter(line => {
              // Filter to only subtitles that overlap with clip time range
              const clipEnd = clipStartInVideo + videoDuration;
              return line.end >= clipStartInVideo && line.start <= clipEnd;
            })
            .map(line => ({
              // Adjust times relative to clip start
              start: Math.max(0, line.start - clipStartInVideo),
              end: Math.max(0, line.end - clipStartInVideo),
              text: line.text,
            }));
          
          console.log(`[ClipPreview] Parsed ${clipSubtitles.length} subtitles for clip`);
          setSubtitles(clipSubtitles);
          toast.success(`${clipSubtitles.length} legendas carregadas`);
        } else {
          console.log('[ClipPreview] No subtitles parsed from SRT');
          setSubtitles([{ start: 0, end: 5, text: 'Nenhuma legenda encontrada' }]);
        }
        
        setSubtitlesLoaded(true);
      } catch (error) {
        console.error('[ClipPreview] Error loading subtitles:', error);
        toast.error('Erro ao carregar legendas');
        // Fallback to example
        setSubtitles([
          { start: 0, end: 5, text: 'Erro ao carregar legendas' },
        ]);
        setSubtitlesLoaded(true);
      } finally {
        setIsLoadingSubtitles(false);
      }
    };
    
    loadSubtitles();
  }, [showSubtitles, subtitlesLoaded, matchId, matchHalf, eventSecond, videoDuration]);

  // Reset subtitles loaded flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSubtitlesLoaded(false);
      setSubtitles([]);
    }
  }, [isOpen]);

  // Format time helper
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Logo handlers
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const url = URL.createObjectURL(file);
      setLogoUrl(url);
      toast.success('Logo carregado!');
    }
  };

  const removeLogo = () => {
    if (logoUrl) {
      URL.revokeObjectURL(logoUrl);
    }
    setLogoFile(null);
    setLogoUrl(null);
  };

  // Custom text handlers
  const addCustomText = () => {
    const newText: CustomText = {
      id: crypto.randomUUID(),
      content: 'Novo texto',
      position: 'bottom-center',
      fontSize: 16,
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      opacity: 100,
    };
    setCustomTexts(prev => [...prev, newText]);
  };

  const updateCustomText = (id: string, updates: Partial<CustomText>) => {
    setCustomTexts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const removeCustomText = (id: string) => {
    setCustomTexts(prev => prev.filter(t => t.id !== id));
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
      toast.success('Download iniciado!');
    } catch (error) {
      console.error('Error downloading clip:', error);
      toast.error('Erro ao baixar o clip');
    }
  };

  const handleTrimChange = useCallback((trim: { startOffset: number; endOffset: number }) => {
    setCurrentTrim(trim);
  }, []);

  const handleTrimSave = useCallback((trim: { startOffset: number; endOffset: number }) => {
    if (eventId && onTrimSave) {
      onTrimSave(eventId, trim);
      toast.success('Ajustes salvos!');
    }
    setShowTimelineEditor(false);
  }, [eventId, onTrimSave]);

  const handleTimelineSeek = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // Handle save with mode and regenerate on server
  const handleApplyAndRegenerate = async () => {
    if (!eventId || !matchId) {
      toast.error('ID do evento ou partida não disponível');
      return;
    }
    
    // Build trim data based on mode
    const trimData = clipMode === 'custom' 
      ? {
          mode: 'absolute' as const,
          startSecond: absoluteStart,
          endSecond: absoluteEnd,
          duration: absoluteEnd - absoluteStart
        }
      : currentTrim 
        ? {
            mode: 'relative' as const,
            startOffset: currentTrim.startOffset,
            endOffset: currentTrim.endOffset,
          }
        : null;
    
    // Save metadata with mode and overlays config
    const config = {
      clipMode,
      customTrim: trimData,
      overlays: {
        logo: logoUrl ? {
          position: logoPosition,
          opacity: logoOpacity,
        } : null,
        subtitles: showSubtitles ? {
          enabled: true,
          style: subtitleStyle,
        } : null,
        texts: customTexts.length > 0 ? customTexts : null,
        overlay: overlayOpacity > 0 ? { opacity: overlayOpacity } : null,
      },
      format: selectedFormat,
    };
    
    console.log('Saving clip config:', config);
    
    // If custom mode with absolute timestamps, save them
    if (clipMode === 'custom' && trimData && onTrimSave) {
      // Convert to relative offsets for compatibility
      onTrimSave(eventId, {
        startOffset: absoluteStart - eventSecond,
        endOffset: absoluteEnd - eventSecond
      });
    } else if (clipMode === 'auto' && currentTrim && onTrimSave) {
      onTrimSave(eventId, currentTrim);
    }
    
    toast.success(
      clipMode === 'auto' 
        ? 'Configuração salva! O clip usará o corte automático de 30s.'
        : 'Configuração salva! O clip usará seus ajustes personalizados.'
    );
  };

  // Regenerate clip on server with custom trim
  const handleRegenerateClip = async () => {
    if (!eventId || !matchId) {
      toast.error('ID do evento ou partida não disponível');
      return;
    }

    setIsRegenerating(true);
    
    try {
      // Build trim data based on mode
      const trimData = clipMode === 'custom' 
        ? {
            mode: 'absolute',
            startSecond: absoluteStart,
            endSecond: absoluteEnd,
            duration: absoluteEnd - absoluteStart
          }
        : currentTrim 
          ? {
              mode: 'relative',
              startOffset: currentTrim.startOffset,
              endOffset: currentTrim.endOffset,
            }
          : null;
      
      console.log('[ClipPreview] Regenerating clip with trim:', trimData);
      
      // First, save the metadata to the event via onTrimSave
      if (onTrimSave) {
        if (clipMode === 'custom') {
          onTrimSave(eventId, {
            startOffset: absoluteStart - eventSecond,
            endOffset: absoluteEnd - eventSecond
          });
        } else if (currentTrim) {
          onTrimSave(eventId, currentTrim);
        }
      }

      // Call the server to regenerate clips for this match
      // The server will use the customTrim from event metadata
      const result = await apiClient.regenerateClips(matchId, {
        use_category_timings: true,
        force_subtitles: true
      });
      
      console.log('[ClipPreview] Regeneration result:', result);
      
      if (result.regenerated > 0) {
        toast.success(`Clip regenerado com sucesso!`, {
          description: `${result.regenerated} clip(s) processado(s). Duração: ${trimData ? `${(trimData.duration || (trimData.endOffset - trimData.startOffset)).toFixed(1)}s` : '30s'}`
        });
        // Close modal to refresh the list
        onClose();
      } else {
        toast.warning('Nenhum clip foi gerado. Verifique se o vídeo está disponível.');
      }
    } catch (error) {
      console.error('[ClipPreview] Error regenerating clip:', error);
      toast.error('Erro ao regenerar clip', {
        description: error instanceof Error ? error.message : 'Verifique a conexão com o servidor'
      });
    } finally {
      setIsRegenerating(false);
    }
  };

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
                <Badge variant={clipMode === 'auto' ? 'secondary' : 'default'} className="text-xs">
                  {clipMode === 'auto' ? '⚡ Auto 30s' : '✂️ Personalizado'}
                </Badge>
                {currentTrim && clipMode === 'custom' && (
                  <Badge variant="outline" className="text-xs">
                    {(currentTrim.endOffset - currentTrim.startOffset).toFixed(1)}s
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
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                          {logoUrl ? (
                            <div className="relative border border-border/50 rounded-lg p-2 bg-muted/30">
                              <img src={logoUrl} alt="Logo" className="max-h-16 mx-auto object-contain" />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-1 right-1 h-6 w-6"
                                onClick={removeLogo}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div 
                              className="border-2 border-dashed border-border/50 rounded-lg p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => logoInputRef.current?.click()}
                            >
                              <Upload className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                              <p className="text-[10px] text-muted-foreground">Arraste ou clique</p>
                            </div>
                          )}
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
                            <Label className="text-xs font-medium">Opacidade Logo</Label>
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

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs font-medium">Escurecimento</Label>
                            <Badge variant="outline" className="text-[10px] h-5">{overlayOpacity}%</Badge>
                          </div>
                          <Slider 
                            value={[overlayOpacity]} 
                            onValueChange={([v]) => setOverlayOpacity(v)} 
                            max={70} 
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
                            <div className={cn(
                              "rounded p-2 text-center border border-border/30",
                              getSubtitleStyleClasses(subtitleStyle)
                            )}>
                              <p className="text-xs">{subtitleText || '"Legenda de exemplo..."'}</p>
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
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full gap-2 h-8"
                          onClick={addCustomText}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar Texto
                        </Button>
                        
                        {customTexts.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground text-center py-3">
                            Nenhum texto adicionado
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {customTexts.map(text => (
                              <div key={text.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded border border-border/30">
                                <Input
                                  value={text.content}
                                  onChange={(e) => updateCustomText(text.id, { content: e.target.value })}
                                  className="flex-1 h-7 text-xs"
                                />
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7"
                                  onClick={() => removeCustomText(text.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
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
                      {/* Mode Selection */}
                      <RadioGroup 
                        value={clipMode} 
                        onValueChange={(v) => {
                          setClipMode(v as ClipMode);
                          if (v === 'custom') {
                            setShowTimelineEditor(true);
                          }
                        }}
                        className="space-y-2"
                      >
                        <div className={cn(
                          "flex items-center space-x-2 p-2.5 rounded-lg border transition-colors cursor-pointer",
                          clipMode === 'auto' 
                            ? "border-primary/50 bg-primary/10" 
                            : "border-border/30 hover:bg-muted/50"
                        )}>
                          <RadioGroupItem value="auto" id="auto" />
                          <Label htmlFor="auto" className="flex-1 cursor-pointer">
                            <span className="font-medium text-xs">⚡ Corte Automático</span>
                            <p className="text-[10px] text-muted-foreground">30s centralizado (-15s / +15s)</p>
                          </Label>
                        </div>
                        <div className={cn(
                          "flex items-center space-x-2 p-2.5 rounded-lg border transition-colors cursor-pointer",
                          clipMode === 'custom' 
                            ? "border-primary/50 bg-primary/10" 
                            : "border-border/30 hover:bg-muted/50"
                        )}>
                          <RadioGroupItem value="custom" id="custom" />
                          <Label htmlFor="custom" className="flex-1 cursor-pointer">
                            <span className="font-medium text-xs">✂️ Corte Personalizado</span>
                            <p className="text-[10px] text-muted-foreground">Ajustar início e fim manualmente</p>
                          </Label>
                        </div>
                      </RadioGroup>

                      {/* Current values display */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-muted/30 rounded-lg border border-border/30">
                          <p className="text-[10px] text-muted-foreground">Início</p>
                          <p className="text-sm font-mono font-medium">
                            {clipMode === 'custom' && currentTrim 
                              ? `${currentTrim.startOffset.toFixed(1)}s`
                              : '-15.0s'}
                          </p>
                        </div>
                        <div className="p-2 bg-primary/10 rounded-lg border border-primary/30">
                          <p className="text-[10px] text-primary">Evento</p>
                          <p className="text-sm font-mono font-medium">0.0s</p>
                        </div>
                        <div className="p-2 bg-muted/30 rounded-lg border border-border/30">
                          <p className="text-[10px] text-muted-foreground">Fim</p>
                          <p className="text-sm font-mono font-medium">
                            {clipMode === 'custom' && currentTrim 
                              ? `+${currentTrim.endOffset.toFixed(1)}s`
                              : '+15.0s'}
                          </p>
                        </div>
                      </div>
                      
                      {clipMode === 'custom' && (
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
                      )}
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
            
            {/* Sidebar Footer - Single action button */}
            <div className="border-t border-border/50 p-3 flex-shrink-0 bg-muted/20 space-y-2">
              <Button 
                className="w-full gap-2" 
                variant="arena"
                onClick={handleRegenerateClip}
                disabled={isRegenerating || !matchId}
              >
                {isRegenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Scissors className="h-4 w-4" />
                    Gerar Clip
                  </>
                )}
              </Button>
              
              {/* Download only appears if clip exists */}
              {clipUrl && (
                <Button 
                  className="w-full gap-2" 
                  variant="outline"
                  onClick={handleDownload}
                  disabled={isRegenerating}
                >
                  <Download className="h-4 w-4" />
                  Baixar
                </Button>
              )}
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
                {/* Video */}
                {activeVideoUrl ? (
                  <video
                    ref={videoRef}
                    src={activeVideoUrl}
                    poster={clipMode === 'auto' ? posterUrl : undefined}
                    className={cn(
                      "absolute inset-0 w-full h-full",
                      selectedFormat === '9:16' || selectedFormat === '4:5' 
                        ? "object-cover" 
                        : "object-contain"
                    )}
                    autoPlay={clipMode === 'auto'}
                    loop={clipMode === 'auto'}
                    muted={isMuted}
                    playsInline
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <p className="text-sm">
                      {clipMode === 'custom' ? 'Vídeo completo não disponível' : 'Clip não disponível'}
                    </p>
                  </div>
                )}
                
                {/* Darkening Overlay */}
                {overlayOpacity > 0 && (
                  <div 
                    className="absolute inset-0 bg-black pointer-events-none z-10"
                    style={{ opacity: overlayOpacity / 100 }}
                  />
                )}
                
                {/* Logo Overlay */}
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className={cn(
                      "absolute z-20 pointer-events-none max-w-[25%] max-h-[12%] object-contain",
                      getPositionClasses(logoPosition)
                    )}
                    style={{ opacity: logoOpacity / 100 }}
                  />
                )}
                
                {/* Custom Texts Overlay */}
                {customTexts.map(text => (
                  <div
                    key={text.id}
                    className={cn(
                      "absolute z-20 pointer-events-none px-2 py-1 rounded",
                      getPositionClasses(text.position)
                    )}
                    style={{
                      color: text.color,
                      backgroundColor: text.backgroundColor,
                      opacity: text.opacity / 100,
                      fontSize: text.fontSize,
                    }}
                  >
                    {text.content}
                  </div>
                ))}
                
                {/* Subtitles Overlay */}
                {showSubtitles && subtitleText && (
                  <div 
                    className={cn(
                      "absolute bottom-6 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded pointer-events-none max-w-[90%]",
                      getSubtitleStyleClasses(subtitleStyle)
                    )}
                  >
                    <p className="text-center text-sm font-medium">{subtitleText}</p>
                  </div>
                )}
                
                {/* Format indicator overlay */}
                <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none z-40">
                  <Badge 
                    variant="arena" 
                    className="text-xs backdrop-blur bg-primary/80"
                  >
                    {selectedFormat}
                  </Badge>
                </div>
              </DeviceMockup>
            </div>
            
            {/* Player Controls Bar */}
            {activeVideoUrl && (
              <div className="border-t border-border/50 bg-muted/30 p-3 flex-shrink-0 space-y-2">
                {/* Progress Bar */}
                <Slider
                  value={[currentTime]}
                  min={0}
                  max={duration > 0 ? duration : videoDuration}
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
            <Collapsible open={showTimelineEditor && clipMode === 'custom'} onOpenChange={setShowTimelineEditor}>
              <CollapsibleContent>
                <div className="border-t border-border/50 p-3 bg-muted/20 max-h-[160px] overflow-y-auto">
                  <VideoTimelineEditor
                    videoRef={videoRef}
                    eventSecond={eventSecond}
                    videoDuration={activeVideoDuration}
                    currentVideoTime={currentTime}
                    mode={clipMode === 'custom' ? 'absolute' : 'relative'}
                    initialTrim={currentTrim}
                    absoluteStart={absoluteStart}
                    absoluteEnd={absoluteEnd}
                    onAbsoluteChange={(start, end) => {
                      setAbsoluteStart(start);
                      setAbsoluteEnd(end);
                    }}
                    onTrimChange={handleTrimChange}
                    onSave={handleTrimSave}
                    onAbsoluteSave={(start, end) => {
                      setAbsoluteStart(start);
                      setAbsoluteEnd(end);
                      handleApplyAndRegenerate();
                    }}
                    onSeek={handleTimelineSeek}
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
