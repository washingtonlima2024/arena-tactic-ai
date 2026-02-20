import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Settings2,
  Download,
  Loader2,
  Film,
  FileVideo,
  Layers,
  Server,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { TransitionVignette } from './TransitionVignette';
import { ClipVignette } from './ClipVignette';
import { SocialSharePanel } from './SocialSharePanel';
import { CompilationProgress } from './CompilationProgress';
import { BatchExportPanel } from './BatchExportPanel';
import arenaPlayLogo from '@/assets/arena-play-icon.png';
import { toast } from 'sonner';
import { CLIP_BUFFER_BEFORE_MS, CLIP_BUFFER_AFTER_MS } from '@/hooks/useClipGeneration';
import { useVideoCompilation } from '@/hooks/useVideoCompilation';
import { useVignetteGenerator } from '@/hooks/useVignetteGenerator';
import { normalizeStorageUrl, apiClient, getApiBase, isLocalServerAvailable } from '@/lib/apiClient';
import { parseTranscription } from '@/lib/transcriptionParser';

// Video formats
const VIDEO_FORMATS = [
  { id: '9:16', name: 'Stories/Reels', ratio: '9:16', width: 1080, height: 1920, icon: RectangleVertical },
  { id: '16:9', name: 'Widescreen', ratio: '16:9', width: 1920, height: 1080, icon: RectangleHorizontal },
  { id: '1:1', name: 'Quadrado', ratio: '1:1', width: 1080, height: 1080, icon: Square },
  { id: '4:5', name: 'Feed Vertical', ratio: '4:5', width: 1080, height: 1350, icon: RectangleVertical },
];

// Device types
const DEVICES = [
  { 
    id: 'phone', 
    name: 'Celular', 
    icon: Smartphone, 
    bestFor: ['9:16', '4:5'],
    borderRadius: 40,
    padding: 8
  },
  { 
    id: 'tablet', 
    name: 'Tablet', 
    icon: Tablet, 
    bestFor: ['1:1', '4:5'],
    borderRadius: 24,
    padding: 10
  },
  { 
    id: 'desktop', 
    name: 'Computador', 
    icon: Monitor, 
    bestFor: ['16:9', '1:1'],
    borderRadius: 12,
    padding: 6
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
  videoSecond?: number; // second in original video file (for SRT offset)
}

interface ExportPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clips: Clip[];
  matchId?: string;
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
  matchId,
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
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // Preview state
  const [playbackState, setPlaybackState] = useState<PlaybackState>({ type: 'idle' });
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Clip vignette state - separate from video progress
  const [showClipVignette, setShowClipVignette] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  // Preview CC state
  const [previewSrtLines, setPreviewSrtLines] = useState<{ start: number; end: number; text: string }[]>([]);
  const [currentCC, setCurrentCC] = useState('');

  // Backend render state
  const [isBackendRendering, setIsBackendRendering] = useState(false);
  const [backendRenderStage, setBackendRenderStage] = useState<
    'idle' | 'generating-vignettes' | 'uploading' | 'processing' | 'subtitles' | 'concat' | 'complete' | 'error' | 'fallback'
  >('idle');
  const [backendRenderProgress, setBackendRenderProgress] = useState(0);
  const [backendRenderMessage, setBackendRenderMessage] = useState('');
  const [backendRenderLog, setBackendRenderLog] = useState<string[]>([]);
  const backendPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Video compilation hook (kept for single-clip no-vignette fast path + fallback)
  const { 
    isCompiling, 
    progress: compilationProgress, 
    downloadSingleClip, 
    downloadCompilation, 
    cancel: cancelCompilation,
    reset: resetCompilation 
  } = useVideoCompilation();

  // Vignette generator (used to produce PNGs for backend render)
  const vignetteGenerator = useVignetteGenerator();

  const isAnyRendering = isCompiling || isBackendRendering;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);


  // Get selected clips in order
  const selectedClips = clips.filter(c => selectedClipIds.has(c.id));
  const currentClipIndex = playbackState.type === 'clip' ? playbackState.index : -1;
  const currentClip = currentClipIndex >= 0 ? selectedClips[currentClipIndex] : null;

  // Calculate clip timestamps
  const getClipTimestamps = useCallback((clip: Clip) => {
    const eventSeconds = (clip.totalSeconds ?? (clip.minute * 60 + (clip.second ?? 0)));
    const bufferBeforeSeconds = CLIP_BUFFER_BEFORE_MS / 1000;
    const bufferAfterSeconds = CLIP_BUFFER_AFTER_MS / 1000;
    
    const startTime = Math.max(0, eventSeconds - bufferBeforeSeconds);
    const endTime = eventSeconds + bufferAfterSeconds;
    
    return { startTime, endTime, duration: endTime - startTime };
  }, []);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep('config');
      setPlaybackState({ type: 'idle' });
      setSelectedClipIds(new Set());
      setShowSettings(false);
      setShowClipVignette(false);
      setVideoReady(false);
      setPreviewSrtLines([]);
      setCurrentCC('');
    }
  }, [isOpen]);

  // Auto-select device based on format
  useEffect(() => {
    const bestDevice = DEVICES.find(d => d.bestFor.includes(selectedFormat.id)) || DEVICES[0];
    setSelectedDevice(bestDevice);
  }, [selectedFormat]);

  // When clip changes, show vignette and reset video state
  useEffect(() => {
    if (playbackState.type === 'clip' && includeVignettes && currentClip?.thumbnail) {
      setShowClipVignette(true);
      setVideoReady(false);
    } else if (playbackState.type === 'clip') {
      setShowClipVignette(false);
      setVideoReady(true);
    }
    // Clear CC on clip change
    setCurrentCC('');
  }, [playbackState, includeVignettes, currentClip?.thumbnail]);

  // CC sync with video during preview
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewSrtLines.length || !currentClip) return;

    // Calculate clip start offset in the source video
    const bufferBefore = CLIP_BUFFER_BEFORE_MS / 1000;
    const eventSec = currentClip.videoSecond ?? currentClip.totalSeconds ?? (currentClip.minute * 60 + (currentClip.second ?? 0));
    const clipStartInVideo = Math.max(0, eventSec - bufferBefore);

    const onTime = () => {
      // video.currentTime is relative to clip start (0 = clip start) when using clipUrl
      // when using matchVideo it is absolute time in the source file
      const absoluteTime = currentClip.clipUrl
        ? clipStartInVideo + video.currentTime
        : video.currentTime;
      const sub = previewSrtLines.find(s => absoluteTime >= s.start && absoluteTime <= s.end);
      setCurrentCC(sub?.text ?? '');
    };

    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, [previewSrtLines, currentClip, playbackState]);

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

  // Load SRT for preview CC overlay
  const loadSRTForPreview = useCallback(async () => {
    if (!includeSubtitles || !matchId) return;
    try {
      const filesData = await apiClient.listMatchFiles(matchId);
      // Check both srt and texts folders for transcription files
      const srtFiles = [
        ...(filesData?.folders?.srt || []),
        ...(filesData?.folders?.texts || []).filter((f: any) => 
          f.name?.toLowerCase().endsWith('.srt') || f.name?.toLowerCase().endsWith('.vtt')
        ),
      ];
      console.log(`[Preview] Found ${srtFiles.length} transcription files:`, srtFiles.map((f: any) => f.name));
      if (srtFiles.length > 0) {
        const targetSrt =
          srtFiles.find((f: any) => f.name?.toLowerCase().includes('full') || f.name?.toLowerCase() === 'transcription.srt') ||
          srtFiles[0];
        const srtUrl = targetSrt.url || `${getApiBase()}/api/storage/${matchId}/srt/${targetSrt.name}`;
        console.log(`[Preview] Fetching transcription from: ${srtUrl}`);
        const response = await fetch(srtUrl);
        if (response.ok) {
          const srtContent = await response.text();
          console.log(`[Preview] Content length: ${srtContent.length}, preview: ${srtContent.slice(0, 300)}`);
          const parsed = parseTranscription(srtContent);
          const lines = parsed.lines.filter(l => l.hasTimestamp && l.text);
          setPreviewSrtLines(lines);
          console.log(`[Preview] Loaded ${lines.length} CC lines (format: ${parsed.format}) for overlay`);
        } else {
          console.warn(`[Preview] HTTP ${response.status} fetching transcription`);
        }
      } else {
        console.warn('[Preview] No transcription files found in match storage');
      }
    } catch (err) {
      console.warn('[Preview] Could not load SRT for CC overlay:', err);
    }
  }, [includeSubtitles, matchId]);

  // Start preview
  const startPreview = () => {
    if (selectedClips.length === 0) return;
    setStep('preview');
    // Load SRT in background for CC overlay
    loadSRTForPreview();
    setPlaybackState(includeVignettes ? { type: 'opening' } : { type: 'clip', index: 0 });
  };

  // Handle opening complete
  const handleOpeningComplete = useCallback(() => {
    if (selectedClips.length > 0) {
      setPlaybackState({ type: 'clip', index: 0 });
    } else {
      setPlaybackState({ type: 'complete' });
    }
  }, [selectedClips.length]);

  // Handle clip vignette complete
  const handleClipVignetteComplete = useCallback(() => {
    setShowClipVignette(false);
    setVideoReady(true);
  }, []);

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
        setPlaybackState({ type: 'clip', index: nextIndex });
      }
    }
  }, [playbackState, selectedClips.length, includeVignettes]);

  // Handle transition complete
  const handleTransitionComplete = useCallback(() => {
    if (playbackState.type === 'transition') {
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
      setShowClipVignette(false);
      setVideoReady(false);
      setPlaybackState({ type: 'clip', index });
    }
  };

  // Video loaded - seek to correct timestamp
  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video || !currentClip) return;
    
    // If using full match video, seek to event timestamp
    if (matchVideo?.file_url && !currentClip.clipUrl) {
      const { startTime } = getClipTimestamps(currentClip);
      video.currentTime = startTime;
    }
    
    if (videoReady && !isPaused) {
      video.play().catch(() => {});
    }
  }, [currentClip, matchVideo, getClipTimestamps, videoReady, isPaused]);

  // Monitor video time for segment end
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentClip || playbackState.type !== 'clip') return;

    const handleTimeUpdate = () => {
      // If using full match video with timestamp-based playback
      if (matchVideo?.file_url && !currentClip.clipUrl) {
        const { endTime } = getClipTimestamps(currentClip);
        if (video.currentTime >= endTime) {
          video.pause();
          handleClipEnd();
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [currentClip, matchVideo, playbackState, getClipTimestamps, handleClipEnd]);

  // Pause/play sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;

    if (isPaused) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [isPaused, videoReady]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };



  // Shared: load SRT lines (used by preview CC and Batch Export)
  const loadSrtLines = useCallback(async (): Promise<{ start: number; end: number; text: string }[]> => {
    if (!matchId) return [];
    try {
      const filesData = await apiClient.listMatchFiles(matchId);
      const srtFiles = [
        ...(filesData?.folders?.srt || []),
        ...(filesData?.folders?.texts || []).filter((f: any) =>
          f.name?.toLowerCase().endsWith('.srt') || f.name?.toLowerCase().endsWith('.vtt')
        ),
      ];
      if (srtFiles.length === 0) return [];
      const targetSrt =
        srtFiles.find((f: any) => f.name?.toLowerCase().includes('full') || f.name?.toLowerCase() === 'transcription.srt') ||
        srtFiles[0];
      const srtUrl = targetSrt.url || `${getApiBase()}/api/storage/${matchId}/srt/${targetSrt.name}`;
      const response = await fetch(srtUrl);
      if (!response.ok) return [];
      const srtContent = await response.text();
      const parsed = parseTranscription(srtContent);
      return parsed.lines.filter((l: any) => l.hasTimestamp && l.text);
    } catch {
      return [];
    }
  }, [matchId]);

  // Shared: build CompilationConfig['clips'] from Clip[] + srtLines
  const buildClipConfig = useCallback((clipsIn: Clip[], srtLines: { start: number; end: number; text: string }[]) => {
    return clipsIn
      .filter(c => c.clipUrl)
      .map(c => {
        const bufferBefore = CLIP_BUFFER_BEFORE_MS / 1000;
        const eventSec = c.videoSecond ?? c.totalSeconds ?? (c.minute * 60 + (c.second ?? 0));
        const clipStartInVideo = Math.max(0, eventSec - bufferBefore);
        const clipEndInVideo = eventSec + CLIP_BUFFER_AFTER_MS / 1000;
        const subtitleLines = srtLines.length > 0
          ? srtLines
              .filter(line => line.end >= clipStartInVideo && line.start <= clipEndInVideo)
              .map(line => ({
                start: Math.max(0, line.start - clipStartInVideo),
                end: Math.max(0, line.end - clipStartInVideo),
                text: line.text,
              }))
          : undefined;
        return {
          id: c.id,
          clipUrl: normalizeStorageUrl(c.clipUrl!) || c.clipUrl!,
          eventType: c.type,
          minute: c.minute,
          description: c.description,
          thumbnailUrl: c.thumbnail,
          subtitleLines,
        };
      });
  }, []);

  // Cancel backend render polling
  const cancelBackendRender = useCallback(() => {
    if (backendPollRef.current) clearInterval(backendPollRef.current);
    setIsBackendRendering(false);
    setBackendRenderStage('idle');
    setBackendRenderProgress(0);
    setBackendRenderMessage('');
  }, []);

  // Helper: blob → base64 string
  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  // Handle download — tries backend FFmpeg first, falls back to MediaRecorder
  const handleDownload = useCallback(async () => {
    if (selectedClips.length === 0) { toast.error('Nenhum clip selecionado'); return; }
    const clipsWithUrls = selectedClips.filter(c => c.clipUrl);

    // Single clip without vignette → fast direct download
    if (selectedClips.length === 1 && !includeVignettes && selectedClips[0].clipUrl) {
      const clip = selectedClips[0];
      await downloadSingleClip(normalizeStorageUrl(clip.clipUrl) || clip.clipUrl!, `${clip.minute}min-${clip.type.replace(/_/g, '-')}.mp4`);
      return;
    }
    if (clipsWithUrls.length === 0) { toast.error('Nenhum clip extraído. Extraia os clips primeiro na aba "Cortes & Capas".'); return; }

    const serverAvailable = await isLocalServerAvailable();

    if (!serverAvailable) {
      toast.warning('Servidor offline — usando exportação via navegador (WebM).');
      setBackendRenderStage('fallback');
      const srtLines = await loadSrtLines();
      await downloadCompilation({ clips: buildClipConfig(clipsWithUrls, srtLines), includeVignettes, includeSubtitles, format: selectedFormat.id as '9:16'|'16:9'|'1:1'|'4:5', matchInfo: { homeTeam, awayTeam, homeScore, awayScore } });
      setBackendRenderStage('idle');
      return;
    }

    setIsBackendRendering(true);
    setBackendRenderLog([]);
    try {
      setBackendRenderStage('generating-vignettes');
      setBackendRenderProgress(5);
      setBackendRenderMessage('Gerando vinhetas (canvas)...');

      const vigConfig = { width: selectedFormat.width, height: selectedFormat.height, format: selectedFormat.id as '9:16'|'16:9'|'1:1'|'4:5' };
      let vignetteFrames: { opening?: string; clips?: string[]; transitions?: string[]; closing?: string } = {};

      if (includeVignettes) {
        const openingB64 = await blobToBase64(await vignetteGenerator.generateOpeningVignette({ homeTeam, awayTeam, homeScore, awayScore }, vigConfig));
        const clipB64s: string[] = [];
        const transB64s: string[] = [];
        for (let i = 0; i < clipsWithUrls.length; i++) {
          const c = clipsWithUrls[i];
          clipB64s.push(await blobToBase64(await vignetteGenerator.generateClipVignette({ eventType: c.type, minute: c.minute, title: c.description ?? `${c.minute}'`, thumbnailUrl: c.thumbnail }, vigConfig)));
          if (i < clipsWithUrls.length - 1) {
            const next = clipsWithUrls[i + 1];
            transB64s.push(await blobToBase64(await vignetteGenerator.generateTransitionVignette({ nextMinute: next.minute, nextEventType: next.type }, vigConfig)));
          }
          setBackendRenderProgress(5 + Math.round(((i + 1) / clipsWithUrls.length) * 10));
        }
        const closingB64 = await blobToBase64(await vignetteGenerator.generateClosingVignette({ clipCount: clipsWithUrls.length }, vigConfig));
        vignetteFrames = { opening: openingB64, clips: clipB64s, transitions: transB64s, closing: closingB64 };
      }

      setBackendRenderStage('uploading');
      setBackendRenderProgress(18);
      setBackendRenderMessage('Carregando legendas e enviando ao servidor...');
      const allSrtLines = await loadSrtLines();
      const clipSpecs = buildClipConfig(clipsWithUrls, allSrtLines);

      setBackendRenderProgress(22);
      setBackendRenderMessage('Enviando especificação ao servidor FFmpeg...');
      const { jobId } = await apiClient.startRenderJob({ matchId: matchId ?? '', format: selectedFormat.id as '9:16'|'16:9'|'1:1'|'4:5', preset: 'high', includeVignettes, includeSubtitles, matchInfo: { homeTeam, awayTeam, homeScore, awayScore }, clips: clipSpecs, vignetteFrames });
      setBackendRenderProgress(25);
      setBackendRenderMessage('Aguardando processamento FFmpeg...');
      setBackendRenderLog([`Job ${jobId.slice(-8)} iniciado`]);

      await new Promise<void>((resolve, reject) => {
        backendPollRef.current = setInterval(async () => {
          try {
            const s = await apiClient.getRenderStatus(jobId);
            setBackendRenderLog(s.log ?? []);
            setBackendRenderProgress(Math.max(25, Math.min(98, 25 + (s.progress ?? 0) * 0.73)));
            if (s.status === 'processing') {
              const last = s.log?.[s.log.length - 1] ?? '';
              setBackendRenderStage(last.includes('concat') || last.includes('Concat') ? 'concat' : last.includes('ASS') || last.includes('legend') ? 'subtitles' : 'processing');
              setBackendRenderMessage(last || 'Processando com FFmpeg...');
            } else if (s.status === 'complete') {
              clearInterval(backendPollRef.current!);
              setBackendRenderStage('complete'); setBackendRenderProgress(100); setBackendRenderMessage('MP4 gerado com sucesso!');
              const a = document.createElement('a'); a.href = apiClient.downloadRenderUrl(jobId); a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
              toast.success('MP4 exportado! Download iniciado.');
              setTimeout(() => { setIsBackendRendering(false); setBackendRenderStage('idle'); setBackendRenderProgress(0); }, 2000);
              resolve();
            } else if (s.status === 'error') { clearInterval(backendPollRef.current!); reject(new Error(s.error || 'Erro no render backend')); }
          } catch (e) { clearInterval(backendPollRef.current!); reject(e); }
        }, 1500);
      });
    } catch (err: any) {
      console.error('[Render] Backend falhou:', err);
      toast.error(`Render falhou: ${err.message}. Tentando via navegador...`);
      setBackendRenderStage('fallback'); setIsBackendRendering(false);
      const srtLines = await loadSrtLines().catch(() => []);
      await downloadCompilation({ clips: buildClipConfig(clipsWithUrls, srtLines), includeVignettes, includeSubtitles, format: selectedFormat.id as '9:16'|'16:9'|'1:1'|'4:5', matchInfo: { homeTeam, awayTeam, homeScore, awayScore } });
      setBackendRenderStage('idle');
    }
  }, [selectedClips, includeVignettes, includeSubtitles, selectedFormat, homeTeam, awayTeam, homeScore, awayScore, matchId, downloadSingleClip, downloadCompilation, vignetteGenerator, loadSrtLines, buildClipConfig]);

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

  // Get responsive device mockup dimensions based on format and orientation
  const getDeviceDimensions = () => {
    const [w, h] = selectedFormat.ratio.split(':').map(Number);
    const formatAspectRatio = w / h;
    
    // Device physical sizes (realistic proportions)
    // These represent the outer frame dimensions
    const deviceSizes = {
      phone: {
        portrait: { frameW: 220, frameH: 450 },
        landscape: { frameW: 450, frameH: 220 },
      },
      tablet: {
        portrait: { frameW: 380, frameH: 520 },
        landscape: { frameW: 520, frameH: 380 },
      },
      desktop: {
        portrait: { frameW: 500, frameH: 400 },
        landscape: { frameW: 700, frameH: 450 },
      },
    };
    
    const deviceConfig = deviceSizes[selectedDevice.id as keyof typeof deviceSizes];
    const orientedSize = deviceConfig[orientation];
    
    // The screen area inside the device frame (accounting for bezels/padding)
    const bezelSize = selectedDevice.padding * 2 + 8;
    const screenMaxW = orientedSize.frameW - bezelSize;
    const screenMaxH = orientedSize.frameH - bezelSize;
    
    // Calculate screen dimensions maintaining video aspect ratio
    let screenW: number;
    let screenH: number;
    
    if (formatAspectRatio > screenMaxW / screenMaxH) {
      // Video is wider than screen area
      screenW = screenMaxW;
      screenH = screenW / formatAspectRatio;
    } else {
      // Video is taller than screen area
      screenH = screenMaxH;
      screenW = screenH * formatAspectRatio;
    }
    
    return { 
      frameWidth: orientedSize.frameW, 
      frameHeight: orientedSize.frameH,
      screenWidth: screenW,
      screenHeight: screenH,
      aspectRatio: `${w}/${h}`,
      isLandscape: orientation === 'landscape'
    };
  };

  const deviceDimensions = getDeviceDimensions();

  // Render config step
  if (step === 'config') {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <VisuallyHidden>
            <DialogTitle>Exportar Preview</DialogTitle>
          </VisuallyHidden>
          
          <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b shrink-0">
              <div>
                <h2 className="text-xl font-bold">Exportar para Redes Sociais</h2>
                <p className="text-sm text-muted-foreground">
                  Preview individual ou exportação em lote com múltiplos formatos
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="preview" className="flex-1 flex flex-col min-h-0">
              <div className="px-6 pt-3 shrink-0 border-b">
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="preview" className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Preview Export
                  </TabsTrigger>
                  <TabsTrigger value="batch" className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Batch Export
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ── TAB: Preview Export ── */}
              <TabsContent value="preview" className="flex-1 flex flex-col min-h-0 mt-0">
                <div className="flex-1 overflow-y-auto px-6 py-4">
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
                        
                        {/* Orientation toggle */}
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-xs text-muted-foreground">Orientação:</span>
                          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
                            <Button
                              variant={orientation === 'portrait' ? 'default' : 'ghost'}
                              size="sm"
                              className="h-7 px-2 gap-1"
                              onClick={() => setOrientation('portrait')}
                            >
                              <RectangleVertical className="h-3.5 w-3.5" />
                              <span className="text-xs">Vertical</span>
                            </Button>
                            <Button
                              variant={orientation === 'landscape' ? 'default' : 'ghost'}
                              size="sm"
                              className="h-7 px-2 gap-1"
                              onClick={() => setOrientation('landscape')}
                            >
                              <RectangleHorizontal className="h-3.5 w-3.5" />
                              <span className="text-xs">Horizontal</span>
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Options */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                          <Checkbox
                            id="vignettes"
                            checked={includeVignettes}
                            onCheckedChange={(checked) => setIncludeVignettes(!!checked)}
                          />
                          <label htmlFor="vignettes" className="text-sm cursor-pointer">
                            Incluir vinhetas (abertura, transições, encerramento)
                          </label>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                          <Checkbox
                            id="subtitles"
                            checked={includeSubtitles}
                            onCheckedChange={(checked) => setIncludeSubtitles(!!checked)}
                          />
                          <label htmlFor="subtitles" className="text-sm cursor-pointer">
                            Incluir legendas nos clips
                          </label>
                        </div>
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
                </div>

                {/* Footer preview tab */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-4 border-t shrink-0">
                  <div className="text-sm text-muted-foreground">
                    {selectedClipIds.size > 0 
                      ? `${selectedClipIds.size} clips selecionados • Formato ${selectedFormat.ratio} • ${selectedDevice.name}`
                      : 'Selecione pelo menos um clip para continuar'
                    }
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button 
                      variant="arena-outline"
                      onClick={startPreview}
                      disabled={selectedClipIds.size === 0}
                      className="flex-1 sm:flex-none"
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Ver Preview
                    </Button>
                    <Button 
                      variant="arena" 
                      onClick={async () => {
                        if (selectedClipIds.size === 0) return;
                        await handleDownload();
                      }}
                      disabled={selectedClipIds.size === 0 || isCompiling}
                      className="flex-1 sm:flex-none"
                    >
                      {isCompiling ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      Exportar Agora
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ── TAB: Batch Export ── */}
              <TabsContent value="batch" className="flex-1 overflow-y-auto mt-0">
                <div className="px-6 py-4">
                  {/* Clip selector (shared with preview tab) */}
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium flex items-center gap-2">
                        <ListVideo className="h-4 w-4 text-primary" />
                        Clips para o Lote ({selectedClipIds.size}/{clips.length})
                      </h3>
                      <Button variant="ghost" size="sm" onClick={selectAll}>
                        {selectedClipIds.size === clips.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                      </Button>
                    </div>
                    <ScrollArea className="h-[160px] border rounded-lg p-2">
                      <div className="space-y-1.5">
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
                              "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
                              selectedClipIds.has(clip.id) ? "bg-primary border-primary" : "border-muted-foreground/30"
                            )}>
                              {selectedClipIds.has(clip.id) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                            </div>
                            {clip.thumbnail
                              ? <img src={clip.thumbnail} alt={clip.title} className="w-12 h-8 object-cover rounded flex-shrink-0" />
                              : <div className="w-12 h-8 bg-muted rounded flex items-center justify-center flex-shrink-0"><Play className="h-3 w-3 text-muted-foreground" /></div>
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{clip.title}</p>
                              <p className="text-[11px] text-muted-foreground">{clip.minute}' • {clip.type.replace(/_/g, ' ')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>

                    {/* Shared options */}
                    <div className="flex gap-3">
                      <div
                        className={cn("flex-1 flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg cursor-pointer", includeVignettes && "bg-primary/10 border border-primary/20")}
                        onClick={() => setIncludeVignettes(!includeVignettes)}
                      >
                        <Checkbox checked={includeVignettes} onCheckedChange={(c) => setIncludeVignettes(!!c)} />
                        <span className="text-xs">Vinhetas</span>
                      </div>
                      <div
                        className={cn("flex-1 flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg cursor-pointer", includeSubtitles && "bg-primary/10 border border-primary/20")}
                        onClick={() => setIncludeSubtitles(!includeSubtitles)}
                      >
                        <Checkbox checked={includeSubtitles} onCheckedChange={(c) => setIncludeSubtitles(!!c)} />
                        <span className="text-xs">Legendas</span>
                      </div>
                    </div>
                  </div>

                  {/* Batch panel */}
                  <BatchExportPanel
                    clips={clips}
                    selectedClipIds={selectedClipIds}
                    includeVignettes={includeVignettes}
                    includeSubtitles={includeSubtitles}
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    homeScore={homeScore}
                    awayScore={awayScore}
                    buildClipConfig={buildClipConfig}
                    loadSrtLines={loadSrtLines}
                  />
                </div>
              </TabsContent>
            </Tabs>
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
          <div className="flex-shrink-0 flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-white/10">
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
              {/* Orientation toggle in preview */}
              <div className="hidden md:flex items-center gap-1 mr-2 p-1 bg-white/10 rounded-lg">
                <button
                  onClick={() => setOrientation('portrait')}
                  className={cn(
                    "p-2 rounded transition-all",
                    orientation === 'portrait' 
                      ? "bg-primary text-primary-foreground" 
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                  title="Vertical"
                >
                  <RectangleVertical className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setOrientation('landscape')}
                  className={cn(
                    "p-2 rounded transition-all",
                    orientation === 'landscape' 
                      ? "bg-primary text-primary-foreground" 
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                  title="Horizontal"
                >
                  <RectangleHorizontal className="h-4 w-4" />
                </button>
              </div>

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
            <div className="flex-shrink-0 md:hidden px-4 py-3 bg-black/50 border-b border-white/10">
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
          <div className="flex-1 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden min-h-0">
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
              /* Device mockup with content - responsive based on format */
              <div className="relative transition-all duration-500 flex flex-col items-center justify-center max-h-full">
                {/* Device frame */}
                <div 
                  className={cn(
                    "relative bg-gray-900 shadow-2xl border-4 border-gray-800",
                    "transition-all duration-300 flex-shrink-0"
                  )}
                  style={{
                    width: `min(${deviceDimensions.frameWidth}px, calc(100vw - 32px))`,
                    height: `min(${deviceDimensions.frameHeight}px, calc(100vh - 200px))`,
                    borderRadius: selectedDevice.borderRadius,
                    padding: selectedDevice.padding,
                  }}
                >
                  {/* Phone notch - position changes based on orientation */}
                  {selectedDevice.id === 'phone' && !deviceDimensions.isLandscape && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-5 sm:h-6 bg-black rounded-b-2xl z-30 flex items-center justify-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                      <div className="w-8 h-2 rounded-full bg-gray-800" />
                    </div>
                  )}
                  {selectedDevice.id === 'phone' && deviceDimensions.isLandscape && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1/3 w-5 sm:w-6 bg-black rounded-r-2xl z-30 flex flex-col items-center justify-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                      <div className="h-8 w-2 rounded-full bg-gray-800" />
                    </div>
                  )}
                  
                  {/* Tablet camera */}
                  {selectedDevice.id === 'tablet' && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-gray-700 z-30" />
                  )}
                  
                  {/* Desktop webcam */}
                  {selectedDevice.id === 'desktop' && (
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-gray-700 z-30" />
                  )}

                  {/* Screen - uses format aspect ratio */}
                  <div 
                    className="relative bg-black overflow-hidden w-full h-full"
                    style={{
                      borderRadius: Math.max(0, selectedDevice.borderRadius - selectedDevice.padding - 4),
                    }}
                  >
                    {/* Opening Vignette */}
                    {playbackState.type === 'opening' && (
                      <OpeningVignette 
                        homeTeam={homeTeam}
                        awayTeam={awayTeam}
                        homeScore={homeScore}
                        awayScore={awayScore}
                        onComplete={handleOpeningComplete}
                      />
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
                      <ClosingVignette 
                        clipCount={selectedClips.length}
                        onComplete={handleClosingComplete}
                      />
                    )}

                    {/* Video Player */}
                    {playbackState.type === 'clip' && currentClip && (
                      <div className="absolute inset-0">
                        {/* Clip vignette overlay - separate state */}
                        {showClipVignette && currentClip.thumbnail && (
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
                              onComplete={handleClipVignetteComplete}
                              duration={2000}
                            />
                          </div>
                        )}
                        
                        {/* Video content */}
                        {!showClipVignette && (
                          <>
                            <VideoContent
                              clip={currentClip}
                              matchVideo={matchVideo}
                              videoRef={videoRef}
                              isMuted={isMuted}
                              onLoaded={handleVideoLoaded}
                              onEnded={handleClipEnd}
                            />

                            {/* CC overlay — synced via timeupdate */}
                            {includeSubtitles && currentCC && (
                              <div className="absolute bottom-[14%] left-2 right-2 z-20 flex justify-center pointer-events-none">
                                <span
                                  className="text-white font-medium text-center leading-snug"
                                  style={{
                                    background: 'rgba(0,0,0,0.75)',
                                    borderRadius: 4,
                                    padding: '2px 8px',
                                    fontSize: 'clamp(9px, 2.5cqw, 14px)',
                                    maxWidth: '95%',
                                    display: 'inline-block',
                                    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                                  }}
                                >
                                  {currentCC}
                                </span>
                              </div>
                            )}
                            
                            {/* Logo banner overlay */}
                            <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-2 sm:px-4 py-2 sm:py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                  <img src={arenaPlayLogo} alt="Arena Play" className="h-4 sm:h-6 md:h-8" />
                                  <span className="text-[8px] sm:text-[10px] text-white/60 font-medium tracking-wider uppercase">Melhores Momentos</span>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] sm:text-xs text-white/80 font-semibold">{homeTeam} {homeScore} x {awayScore} {awayTeam}</p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Phone home indicator */}
                  {selectedDevice.id === 'phone' && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1/3 h-0.5 bg-white/50 rounded-full z-40" />
                  )}
                  
                  {/* Phone side buttons */}
                  {selectedDevice.id === 'phone' && (
                    <>
                      <div className="absolute -left-1 top-20 w-1 h-6 bg-gray-700 rounded-l" />
                      <div className="absolute -left-1 top-28 w-1 h-10 bg-gray-700 rounded-l" />
                      <div className="absolute -right-1 top-24 w-1 h-12 bg-gray-700 rounded-r" />
                    </>
                  )}
                </div>

                {/* Desktop stand */}
                {selectedDevice.id === 'desktop' && (
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-16 sm:w-20 h-4 bg-gradient-to-b from-gray-800 to-gray-900" />
                    <div className="w-24 sm:w-32 h-2 bg-gray-800 rounded-lg" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom controls - responsive */}
          {playbackState.type !== 'complete' && (
            <div className="flex-shrink-0 border-t border-white/10 bg-black/50 backdrop-blur-lg px-3 sm:px-6 py-2 sm:py-3">
              {/* Clip timeline - scrollable */}
              <div className="flex gap-1.5 sm:gap-2 mb-2 sm:mb-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/20">
                {selectedClips.map((clip, index) => (
                  <button
                    key={clip.id}
                    onClick={() => goToClip(index)}
                    className={cn(
                      "flex-shrink-0 w-12 sm:w-16 h-7 sm:h-10 rounded overflow-hidden border-2 transition-all",
                      index === currentClipIndex 
                        ? "border-primary scale-105 shadow-[0_0_20px_hsl(var(--primary)/0.5)]" 
                        : index < currentClipIndex 
                        ? "border-primary/50 opacity-60" 
                        : "border-white/20 opacity-40 hover:opacity-80"
                    )}
                  >
                    {clip.thumbnail ? (
                      <img src={clip.thumbnail} alt={clip.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Play className="h-3 w-3 text-muted-foreground" />
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
                  {isPaused ? <Play className="h-5 w-5 sm:h-6 sm:w-6 fill-white" /> : <Pause className="h-5 w-5 sm:h-6 sm:w-6" />}
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

                <div className="w-px h-6 bg-white/20 mx-1 hidden sm:block" />

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

                <div className="w-px h-6 bg-white/20 mx-1 hidden sm:block" />

                <Button
                  variant="default"
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 h-8 sm:h-10 px-3 sm:px-4"
                  onClick={handleDownload}
                  disabled={isCompiling}
                >
                  {isCompiling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">
                    {selectedClips.length === 1
                      ? (includeVignettes ? 'Gerar Vídeo' : 'Download (.mp4)')
                      : 'Gerar Playlist'}
                  </span>
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  className="bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] hover:opacity-90 text-white gap-1.5 h-8 sm:h-10 px-3 sm:px-4"
                  onClick={() => setShowSharePanel(true)}
                >
                  <Share2 className="h-4 w-4" />
                  <span>Exportar para Redes Sociais</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Backend render progress overlay */}
        {isBackendRendering && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl text-center space-y-5">
              <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-2">
                <Server className="h-4 w-4 text-primary shrink-0" />
                <p className="text-xs text-primary font-medium text-left">Render via servidor FFmpeg — pode fechar esta aba</p>
              </div>
              <div className="flex flex-col items-center gap-3">
                {backendRenderStage === 'generating-vignettes' && <Film className="h-10 w-10 text-primary animate-pulse" />}
                {backendRenderStage === 'uploading' && <Download className="h-10 w-10 text-primary animate-bounce" />}
                {(backendRenderStage === 'processing' || backendRenderStage === 'concat') && <Loader2 className="h-10 w-10 text-primary animate-spin" />}
                {backendRenderStage === 'subtitles' && <FileVideo className="h-10 w-10 text-primary animate-pulse" />}
                {backendRenderStage === 'complete' && <Check className="h-10 w-10 text-green-400" />}
                {!['generating-vignettes','uploading','processing','concat','subtitles','complete'].includes(backendRenderStage) && <Loader2 className="h-10 w-10 text-primary animate-spin" />}
                <div>
                  <p className="text-3xl font-bold text-foreground">{backendRenderProgress.toFixed(0)}%</p>
                  <p className="text-sm font-medium text-foreground mt-1">{backendRenderMessage}</p>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${backendRenderProgress}%` }} />
              </div>
              <div className="text-left space-y-1.5">
                {[
                  { key: 'generating-vignettes', label: 'Gerando vinhetas (canvas)', done: ['uploading','processing','subtitles','concat','complete'].includes(backendRenderStage) },
                  { key: 'uploading',             label: 'Enviando ao servidor',       done: ['processing','subtitles','concat','complete'].includes(backendRenderStage) },
                  { key: 'processing',            label: 'Processando clips (FFmpeg)',  done: ['subtitles','concat','complete'].includes(backendRenderStage) },
                  { key: 'subtitles',             label: 'Burn-in legendas ASS',        done: ['concat','complete'].includes(backendRenderStage) },
                  { key: 'concat',                label: 'Concatenando → MP4 final',    done: backendRenderStage === 'complete' },
                ].map(item => {
                  const isActive = backendRenderStage === item.key;
                  return (
                    <div key={item.key} className={cn("flex items-center gap-2 text-xs rounded px-2 py-1", item.done && "text-green-400", isActive && "text-primary font-medium bg-primary/10", !isActive && !item.done && "text-muted-foreground")}>
                      <span className="text-base">{item.done ? '✅' : isActive ? '⏳' : '○'}</span>
                      {item.label}
                    </div>
                  );
                })}
              </div>
              {/* Live log (last 3 lines) */}
              {backendRenderLog.length > 0 && (
                <div className="text-left bg-muted/50 rounded-lg p-2 max-h-20 overflow-hidden">
                  {backendRenderLog.slice(-3).map((line, i) => (
                    <p key={i} className="text-xs text-muted-foreground font-mono truncate">{line}</p>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={cancelBackendRender} className="w-full">Cancelar</Button>
            </div>
          </div>
        )}

        {/* MediaRecorder fallback progress overlay */}
        {isCompiling && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl text-center space-y-5">
              <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                <p className="text-xs text-yellow-300 font-medium text-left">Modo fallback (WebM) — mantenha esta aba em foco</p>
              </div>
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                <div>
                  <p className="text-3xl font-bold text-foreground">{compilationProgress.progress.toFixed(0)}%</p>
                  <p className="text-sm font-medium text-foreground mt-1">{compilationProgress.message}</p>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${compilationProgress.progress}%` }} />
              </div>
              <Button variant="outline" size="sm" onClick={() => { cancelCompilation(); resetCompilation(); }} className="w-full">Cancelar</Button>
            </div>
          </div>
        )}

        {/* Social Share Panel */}
        <SocialSharePanel
          isOpen={showSharePanel}
          onClose={() => setShowSharePanel(false)}
          clipCount={selectedClips.length}
          matchTitle={`${homeTeam} x ${awayTeam}`}
        />
      </DialogContent>
    </Dialog>
  );
}

// Opening vignette component
function OpeningVignette({ 
  homeTeam, 
  awayTeam, 
  homeScore, 
  awayScore,
  onComplete 
}: { 
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  onComplete: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(300);

  useEffect(() => {
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const scale = Math.max(0.35, Math.min(1.4, containerWidth / 400));
  const logoH = `${Math.round(48 * scale)}px`;
  const titleSize = `${Math.round(16 * scale)}px`;
  const scoreSize = `${Math.round(28 * scale)}px`;
  const subSize = `${Math.round(11 * scale)}px`;
  const mb1 = `${Math.round(12 * scale)}px`;
  const mb2 = `${Math.round(6 * scale)}px`;

  return (
    <div ref={containerRef} className="absolute inset-0 z-20 bg-gradient-to-br from-gray-950 via-primary/20 to-gray-950 flex items-center justify-center overflow-hidden">
      {/* Animated lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[20,40,60,80].map(top => (
          <div key={top} className="absolute h-px left-0 right-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent" style={{ top: `${top}%`, animation: `ovLineSlide 1.5s ease-out ${top * 0.01}s forwards`, opacity: 0 }} />
        ))}
      </div>
      {/* Glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, hsl(var(--primary)/0.15) 0%, transparent 65%)', animation: 'ovGlow 1.5s ease-in-out infinite' }} />

      <div className="text-center text-white animate-in fade-in zoom-in duration-700 relative z-10" style={{ padding: `${Math.round(16 * scale)}px` }}>
        <img src={arenaPlayLogo} alt="Arena Play" style={{ height: logoH, marginBottom: mb1 }} className="mx-auto drop-shadow-[0_0_20px_hsl(var(--primary)/0.5)]" />
        <h3 className="font-bold text-white" style={{ fontSize: titleSize, marginBottom: mb2 }}>{homeTeam} <span className="text-primary/70">vs</span> {awayTeam}</h3>
        <p className="font-black text-primary drop-shadow-[0_0_15px_hsl(var(--primary)/0.6)]" style={{ fontSize: scoreSize, marginBottom: mb2 }}>{homeScore} – {awayScore}</p>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: subSize, marginBottom: mb1 }}>Melhores Momentos</p>
        <div className="animate-pulse mx-auto bg-primary rounded-full" style={{ width: `${Math.round(32 * scale)}px`, height: `${Math.round(3 * scale)}px` }} />
      </div>
      <style>{`
        @keyframes ovLineSlide { 0%{transform:translateX(-100%);opacity:0} 50%{opacity:1} 100%{transform:translateX(100%);opacity:0} }
        @keyframes ovGlow { 0%,100%{opacity:0.5} 50%{opacity:1} }
      `}</style>
    </div>
  );
}

// Closing vignette component
function ClosingVignette({ 
  clipCount, 
  onComplete 
}: { 
  clipCount: number;
  onComplete: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(300);

  useEffect(() => {
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const scale = Math.max(0.35, Math.min(1.4, containerWidth / 400));

  return (
    <div ref={containerRef} className="absolute inset-0 z-20 bg-gradient-to-br from-gray-950 via-primary/20 to-gray-950 flex items-center justify-center">
      <div className="text-center text-white animate-in fade-in zoom-in duration-500 relative z-10">
        <img src={arenaPlayLogo} alt="Arena Play" style={{ height: `${Math.round(36 * scale)}px`, marginBottom: `${Math.round(10 * scale)}px` }} className="mx-auto opacity-80" />
        <p className="font-bold text-white/90" style={{ fontSize: `${Math.round(20 * scale)}px`, marginBottom: `${Math.round(4 * scale)}px` }}>FIM</p>
        <p className="text-white/50 uppercase tracking-widest" style={{ fontSize: `${Math.round(10 * scale)}px` }}>{clipCount} clips</p>
      </div>
    </div>
  );
}

// Video content component
function VideoContent({
  clip,
  matchVideo,
  videoRef,
  isMuted,
  onLoaded,
  onEnded
}: {
  clip: Clip;
  matchVideo?: { file_url: string; duration_seconds?: number | null } | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  isMuted: boolean;
  onLoaded: () => void;
  onEnded: () => void;
}) {
  const videoUrl = clip.clipUrl || matchVideo?.file_url;

  if (videoUrl) {
    return (
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-cover"
        autoPlay
        muted={isMuted}
        playsInline
        onLoadedMetadata={onLoaded}
        onEnded={onEnded}
      />
    );
  }

  if (clip.thumbnail) {
    return (
      <div className="relative w-full h-full">
        <img 
          src={clip.thumbnail} 
          alt={clip.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2 text-white">
          <Badge variant="arena" className="mb-1 text-[10px]">
            {clip.type.replace(/_/g, ' ')}
          </Badge>
          <p className="text-lg font-bold">{clip.minute}'</p>
          <p className="text-xs opacity-80 truncate">{clip.title}</p>
        </div>
        <StaticClipTimer duration={5000} onComplete={onEnded} />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900">
      <div className="text-center text-white p-4">
        <Play className="h-8 w-8 mx-auto mb-2 text-primary" />
        <p className="text-sm font-medium truncate">{clip.title}</p>
        <p className="text-xs text-white/60">{clip.minute}'</p>
      </div>
      <StaticClipTimer duration={5000} onComplete={onEnded} />
    </div>
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
