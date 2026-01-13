import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Upload as UploadIcon, 
  FileVideo, 
  CheckCircle2,
  Zap,
  Brain,
  BarChart3,
  FileText,
  Link as LinkIcon,
  Plus,
  Clock,
  FolderOpen,
  ArrowLeft,
  ListPlus,
  FilePlus,
  HardDrive,
  Server,
  Cloud,
  Loader2,
  Terminal
} from 'lucide-react';
import { useTeams } from '@/hooks/useTeams';
import { useCreateMatch } from '@/hooks/useMatches';
import { useStartAnalysis, useAnalysisJob } from '@/hooks/useAnalysisJob';
import { useWhisperTranscription } from '@/hooks/useWhisperTranscription';
import { useTranscriptionQueue } from '@/hooks/useTranscriptionQueue';
import { useAsyncProcessing, VideoInput } from '@/hooks/useAsyncProcessing';
import { AnalysisProgress } from '@/components/analysis/AnalysisProgress';
import { ProcessingProgress, ProcessingStage } from '@/components/upload/ProcessingProgress';
import { TranscriptionQueue } from '@/components/upload/TranscriptionQueue';
import { AsyncProcessingProgress } from '@/components/upload/AsyncProcessingProgress';
import { toast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/apiClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import arenaPlayWordmark from '@/assets/arena-play-wordmark.png';
import { MatchSetupCard, MatchSetupData } from '@/components/upload/MatchSetupCard';
import { VideoSegmentCard, VideoSegment, VideoType } from '@/components/upload/VideoSegmentCard';
import { CoverageTimeline } from '@/components/upload/CoverageTimeline';
import { AnalysisSummary } from '@/components/upload/AnalysisSummary';
import { MatchTimesConfig, defaultMatchTimes, MatchTimes } from '@/components/upload/MatchTimesConfig';
import { HalfDropzone, getDefaultVideoType, getDefaultMinutes } from '@/components/upload/HalfDropzone';
import { LocalFileBrowser } from '@/components/upload/LocalFileBrowser';
import { TransferCommandsDialog } from '@/components/upload/TransferCommandsDialog';
import { splitVideoInBrowser, calculateOptimalParts, shouldSplitInBrowser, downloadVideoWithProgress } from '@/lib/videoSplitter';
import { cn } from '@/lib/utils';

// Helper to extract embed URL from various formats
const extractEmbedUrl = (input: string): string => {
  if (input.includes('/embed/')) {
    const match = input.match(/src="([^"]+)"/);
    if (match) return match[1];
    if (input.startsWith('http')) return input;
  }
  const iframeMatch = input.match(/src="([^"]+)"/);
  if (iframeMatch) return iframeMatch[1];
  return input;
};

// Suggest video type based on filename
const suggestVideoType = (filename: string): VideoType => {
  const lower = filename.toLowerCase();
  if (lower.includes('primeiro') || lower.includes('1tempo') || lower.includes('first')) return 'first_half';
  if (lower.includes('segundo') || lower.includes('2tempo') || lower.includes('second')) return 'second_half';
  if (lower.includes('completo') || lower.includes('full')) return 'full';
  return 'full';
};

type WizardStep = 'choice' | 'existing' | 'match' | 'videos' | 'summary';

export default function VideoUpload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  // Check for existing match ID (when reimporting)
  const existingMatchId = searchParams.get('match');
  
  // Fetch existing match data if reimporting
  const { data: existingMatch } = useQuery({
    queryKey: ['match-for-reimport', existingMatchId],
    queryFn: async () => {
      if (!existingMatchId) return null;
      try {
        const data = await apiClient.getMatch(existingMatchId);
        return data;
      } catch {
        return null;
      }
    },
    enabled: !!existingMatchId
  });
  
  // Wizard state - driven by URL for reimport, otherwise by user actions
  const [currentStep, setCurrentStep] = useState<WizardStep>(() => {
    // Initial state based on URL - only once on mount
    return existingMatchId ? 'videos' : 'choice';
  });
  
  // Selected match for adding videos - also from URL initially
  const [selectedExistingMatch, setSelectedExistingMatch] = useState<string | null>(() => {
    return existingMatchId || null;
  });
  
  // Flag to indicate user wants to go back (overrides URL sync)
  const [userWantsChoice, setUserWantsChoice] = useState(false);
  
  // Fetch all matches for existing match selection
  const { data: allMatches = [], isLoading: isLoadingMatches } = useQuery({
    queryKey: ['all-matches-for-selection'],
    queryFn: async () => {
      try {
        const data = await apiClient.getMatches();
        return data || [];
      } catch {
        return [];
      }
    }
  });
  
  // Match setup data
  const [matchData, setMatchData] = useState<MatchSetupData>({
    homeTeamId: '',
    awayTeamId: '',
    competition: '',
    matchDate: '',
    matchTime: '',
    venue: '',
  });

  // Match times configuration
  const [matchTimes, setMatchTimes] = useState<MatchTimes>(defaultMatchTimes);

  // Video segments
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const segmentsRef = useRef<VideoSegment[]>([]);
  
  // Sync ref with state to avoid stale closure in handleStartAnalysis
  useEffect(() => {
    segmentsRef.current = segments;
    console.log('[Sync] segmentsRef atualizado:', segments.length, 'segmentos');
  }, [segments]);
  
  // Sync state with URL param - but respect user's explicit "go back" action
  useEffect(() => {
    // If user clicked "Voltar", they want to go to choice - respect that
    if (userWantsChoice) {
      return; // Don't sync from URL, user is in control
    }
    
    // Only navigate TO videos when URL has match ID
    if (existingMatchId) {
      setSelectedExistingMatch(existingMatchId);
      setCurrentStep('videos');
    }
  }, [existingMatchId, userWantsChoice]);
  
  const [isDragging, setIsDragging] = useState(false);
  const [showLocalBrowser, setShowLocalBrowser] = useState(false);
  const [localBrowserHalf, setLocalBrowserHalf] = useState<'first' | 'second' | null>(null);
  const [showTransferCommands, setShowTransferCommands] = useState(false);
  
  // Auto-detect environment: use 'local' on localhost, 'file' on preview/production
  const isLocalHost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const [uploadMode, setUploadMode] = useState<'file' | 'local' | 'link'>(isLocalHost ? 'local' : 'file');
  
  // SRT files per half
  const [firstHalfSrt, setFirstHalfSrt] = useState<File | null>(null);
  const [secondHalfSrt, setSecondHalfSrt] = useState<File | null>(null);
  
  // Analysis jobs for each half
  const [analysisJobs, setAnalysisJobs] = useState<{ first?: string; second?: string }>({});
  
  // Link input state
  const [newLinkInput, setNewLinkInput] = useState('');
  const [newLinkType, setNewLinkType] = useState<VideoType>('full');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newStartMinute, setNewStartMinute] = useState('');
  const [newEndMinute, setNewEndMinute] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [isValidatingLink, setIsValidatingLink] = useState(false);
  const [linkValidationTime, setLinkValidationTime] = useState(0);

  // Analysis state
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null);
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  
  const { data: teams = [] } = useTeams();
  const createMatch = useCreateMatch();
  const { startAnalysis, isLoading: isStartingAnalysis } = useStartAnalysis();
  const analysisJob = useAnalysisJob(currentJobId);
  const { transcribeVideo, transcriptionProgress: whisperProgress, isTranscribing: isWhisperTranscribing } = useWhisperTranscription();
  const transcriptionQueue = useTranscriptionQueue();
  
  // Async processing hook for local server
  const asyncProcessing = useAsyncProcessing();
  
  // Check if local server is available
  const { data: isLocalServerOnline } = useQuery({
    queryKey: ['local-server-status'],
    queryFn: async () => {
      try {
        const status = await apiClient.health();
        return status?.status === 'ok' || status?.ffmpeg === true;
      } catch {
        return false;
      }
    },
    refetchInterval: 10000, // Check every 10 seconds
    staleTime: 5000,
  });

  // Check AI provider status
  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: async () => {
      try {
        const status = await apiClient.checkAiStatus();
        return status;
      } catch {
        return null;
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 10000,
  });

  // Fetch existing videos when reimporting a match
  const activeMatchId = selectedExistingMatch || existingMatchId;
  const { data: existingVideos, refetch: refetchVideos } = useQuery({
    queryKey: ['existing-videos', activeMatchId],
    queryFn: async () => {
      if (!activeMatchId) return [];
      try {
        // Only fetch videos, no auto-sync (user can sync manually)
        const videos = await apiClient.getVideos(activeMatchId);
        return videos || [];
      } catch {
        return [];
      }
    },
    enabled: !!activeMatchId
  });

  // Ref to track if we've already loaded existing videos (prevents multiple loads)
  const hasLoadedExistingVideos = useRef(false);
  
  // Track previous match ID to only reset when it actually changes
  const prevMatchIdRef = useRef<string | null>(null);
  
  // Reset the flag when match actually changes (not just re-renders)
  useEffect(() => {
    if (activeMatchId !== prevMatchIdRef.current) {
      console.log('[Upload] Match ID mudou de', prevMatchIdRef.current, 'para', activeMatchId);
      
      // Limpar segmentos ao mudar de partida (mas não na primeira carga)
      if (prevMatchIdRef.current !== null) {
        setSegments([]);
      }
      
      prevMatchIdRef.current = activeMatchId;
      hasLoadedExistingVideos.current = false;
    }
  }, [activeMatchId]);

  // Auto-load existing videos as segments when page loads with a match ID
  useEffect(() => {
    // Only load ONCE
    if (existingVideos && 
        existingVideos.length > 0 && 
        !hasLoadedExistingVideos.current) {
      
      console.log('[Upload] Carregando vídeos existentes:', existingVideos.length);
      hasLoadedExistingVideos.current = true;
      
      // Mesclar com segmentos existentes, removendo duplicatas
      setSegments(prev => {
        // IDs dos segmentos que já existem
        const existingIds = new Set(prev.map(s => s.id));
        const existingUrls = new Set(prev.map(s => s.url).filter(Boolean));
        
        // Filtrar apenas vídeos novos do banco
        const newFromDb: VideoSegment[] = existingVideos
          .filter((video: any) => !existingIds.has(video.id) && !existingUrls.has(video.file_url))
          .map((video: any): VideoSegment => ({
            id: video.id,  // Use database ID to avoid duplicates
            name: video.file_name || 'Vídeo',
            url: video.file_url,
            size: 0,
            videoType: (video.video_type || 'full') as VideoType,
            title: video.file_name?.replace(/\.[^/.]+$/, '') || 'Vídeo',
            durationSeconds: video.duration_seconds,
            startMinute: video.start_minute ?? 0,
            endMinute: video.end_minute ?? 90,
            progress: 100,
            status: 'complete' as const,
            isLink: false,
            half: video.video_type === 'second_half' ? 'second' as const : 
                  video.video_type === 'first_half' ? 'first' as const : undefined,
          }));
        
        if (newFromDb.length > 0) {
          toast({
            title: `${newFromDb.length} vídeo(s) carregado(s)`,
            description: "Clique em 'Iniciar Análise' para processar.",
          });
        }
        
        console.log('[Upload] Adicionando', newFromDb.length, 'vídeos (existentes:', prev.length, ')');
        return [...prev, ...newFromDb];
      });
    }
  }, [existingVideos]);

  // Detect video duration using HTML5 video element
  const detectVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        const duration = Math.floor(video.duration);
        resolve(duration);
      };
      
      video.onerror = () => {
        resolve(0);
      };
      
      video.src = URL.createObjectURL(file);
    });
  };

  // Large file threshold (500MB for HTTP uploads)
  const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024;
  // Upload timeout (5 minutes for large files)
  const UPLOAD_TIMEOUT = 300000;

  const uploadFile = async (file: File, half?: 'first' | 'second') => {
    const segmentId = crypto.randomUUID();
    const suggestedType = half ? getDefaultVideoType(half) : suggestVideoType(file.name);
    const defaultMins = half ? getDefaultMinutes(half) : {
      full: { start: 0, end: 90 },
      first_half: { start: 0, end: 45 },
      second_half: { start: 45, end: 90 },
      clip: { start: 0, end: 10 },
    }[suggestedType];

    // Format file size for display
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const isLargeFile = file.size > LARGE_FILE_THRESHOLD;

    // Warn about very large files (only for HTTP upload, not local)
    if (isLargeFile && uploadMode !== 'local') {
      toast({
        title: "⚠️ Arquivo muito grande",
        description: `${file.name} (${fileSizeMB} MB) pode demorar. Para arquivos maiores, use o modo local.`,
        variant: "destructive",
      });
    }

    const newSegment: VideoSegment = {
      id: segmentId,
      name: file.name,
      size: file.size,
      videoType: suggestedType,
      title: file.name.replace(/\.[^/.]+$/, ''),
      durationSeconds: null,
      startMinute: defaultMins.start,
      endMinute: defaultMins.end,
      progress: 0,
      status: 'uploading',
      isLink: false,
      half,
      uploadStartTime: Date.now(),
    };

    // Verificar duplicatas antes de adicionar
    setSegments(prev => {
      const isDuplicate = prev.some(s => s.name === newSegment.name);
      if (isDuplicate) {
        console.log('[Upload] Segmento duplicado ignorado:', newSegment.name);
        return prev;
      }
      return [...prev, newSegment];
    });

    // Show immediate feedback
    toast({
      title: "Upload iniciado",
      description: `${file.name} (${fileSizeMB} MB)`,
    });

    try {
      const sanitizedName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${Date.now()}-${sanitizedName}`;
      
      // Start duration detection in parallel (don't wait)
      detectVideoDuration(file).then(duration => {
        setSegments(prev => 
          prev.map(s => 
            s.id === segmentId ? { ...s, durationSeconds: duration || null } : s
          )
        );
      });

      // Timeout tracking - update progress indicator every second
      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const elapsedSeconds = Math.floor(elapsed / 1000);
        
        setSegments(prev => 
          prev.map(s => {
            if (s.id === segmentId && s.status === 'uploading') {
              // Mark as timeout if exceeded
              if (elapsed > UPLOAD_TIMEOUT) {
                return { ...s, status: 'timeout', elapsedSeconds };
              }
              return { ...s, elapsedSeconds };
            }
            return s;
          })
        );
      }, 1000);

      // Validar que temos uma partida selecionada ANTES de fazer upload
      // Fallback: ler diretamente da URL caso o estado ainda não esteja sincronizado
      const urlMatchId = new URLSearchParams(window.location.search).get('match');
      const matchId = selectedExistingMatch || existingMatchId || urlMatchId;
      
      console.log('[uploadFile] Match IDs:', { selectedExistingMatch, existingMatchId, urlMatchId, matchId });
      
      if (!matchId) {
        throw new Error('Selecione uma partida primeiro antes de fazer upload.');
      }
      const result = await apiClient.uploadFile(matchId, 'videos', file, fileName);

      clearInterval(progressInterval);

      setSegments(prev => 
        prev.map(s => 
          s.id === segmentId 
            ? { ...s, progress: 100, status: 'complete', url: result.url, elapsedSeconds: undefined }
            : s
        )
      );

      toast({
        title: "✓ Upload concluído",
        description: `${file.name}`
      });

    } catch (error: any) {
      setSegments(prev => 
        prev.map(s => 
          s.id === segmentId ? { ...s, status: 'error' } : s
        )
      );
      
      // Check for timeout/large file errors
      const isTimeout = error.message?.includes('<!DOCTYPE') || 
                        error.message?.includes('timeout') ||
                        error.message?.includes('524');
      
      toast({
        title: isTimeout ? "⏱️ Timeout no upload" : "Erro no upload",
        description: isTimeout 
          ? `O arquivo ${file.name} (${fileSizeMB} MB) excedeu o tempo limite. Use link externo.`
          : error.message,
        variant: "destructive"
      });
    }
  };

  // Convert failed upload to external link
  const convertToExternalLink = (segmentId: string) => {
    setSegments(prev => prev.filter(s => s.id !== segmentId));
    setUploadMode('link');
    toast({
      title: "Alternativa: Link Externo",
      description: "Cole um link do YouTube, Google Drive ou Dropbox na aba 'Link Externo'",
    });
  };

  // Handle files dropped on half dropzones - process ALL files
  const handleHalfDrop = (files: File[], half: 'first' | 'second') => {
    const videoFiles = files.filter(file => file.type.startsWith('video/'));
    console.log(`Processing ${videoFiles.length} video files for ${half} half`);
    
    if (videoFiles.length === 0) {
      toast({
        title: "Formato inválido",
        description: "Por favor, envie apenas arquivos de vídeo.",
        variant: "destructive"
      });
      return;
    }
    
    // Upload all files sequentially
    videoFiles.forEach((file, index) => {
      console.log(`Uploading file ${index + 1}/${videoFiles.length}: ${file.name}`);
      uploadFile(file, half);
    });
    
    toast({
      title: `${videoFiles.length} arquivo(s) sendo enviado(s)`,
      description: `Vídeos do ${half === 'first' ? '1º' : '2º'} tempo`,
    });
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type.startsWith('video/')
    );

    if (droppedFiles.length === 0) {
      toast({
        title: "Formato inválido",
        description: "Por favor, envie apenas arquivos de vídeo.",
        variant: "destructive"
      });
      return;
    }

    droppedFiles.forEach(file => uploadFile(file));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => uploadFile(file));
    }
  };

  // Validate video link format
  const isValidVideoUrl = (url: string): { valid: boolean; platform: string } => {
    const patterns = [
      { regex: /youtube\.com|youtu\.be/i, platform: 'YouTube' },
      { regex: /vimeo\.com/i, platform: 'Vimeo' },
      { regex: /drive\.google\.com/i, platform: 'Google Drive' },
      { regex: /dropbox\.com/i, platform: 'Dropbox' },
      { regex: /twitch\.tv/i, platform: 'Twitch' },
      { regex: /\.mp4|\.webm|\.mov|\.avi/i, platform: 'Vídeo Direto' },
      { regex: /^https?:\/\//i, platform: 'Link Externo' },
    ];
    
    for (const { regex, platform } of patterns) {
      if (regex.test(url)) {
        return { valid: true, platform };
      }
    }
    return { valid: false, platform: 'Desconhecido' };
  };

  const addVideoLink = async () => {
    if (!newLinkInput.trim()) {
      toast({
        title: "Link obrigatório",
        description: "Insira um link ou código de embed do vídeo.",
        variant: "destructive"
      });
      return;
    }

    const embedUrl = extractEmbedUrl(newLinkInput);
    
    // Validate URL format
    const validation = isValidVideoUrl(embedUrl);
    if (!validation.valid) {
      toast({
        title: "Link inválido",
        description: "O formato do link não é reconhecido. Use YouTube, Vimeo, Google Drive, Dropbox ou link direto para vídeo.",
        variant: "destructive"
      });
      return;
    }

    setIsValidatingLink(true);
    setLinkValidationTime(0);
    
    // Start validation timer
    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      setLinkValidationTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      // Simulate link validation (in a real scenario, you might ping the URL or check metadata)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      clearInterval(timerInterval);
      setIsValidatingLink(false);
      setLinkValidationTime(0);

      const defaultConfig = {
        full: { start: 0, end: 90 },
        first_half: { start: 0, end: 45 },
        second_half: { start: 45, end: 90 },
        clip: { start: 0, end: 10 },
      };
      
      const typeLabels = {
        full: 'Partida Completa',
        first_half: '1º Tempo',
        second_half: '2º Tempo',
        clip: 'Trecho'
      };

      const startMinute = newStartMinute ? parseInt(newStartMinute) : defaultConfig[newLinkType].start;
      const endMinute = newEndMinute ? parseInt(newEndMinute) : defaultConfig[newLinkType].end;
      const durationSeconds = newDuration ? parseInt(newDuration) : null;

      const newSegment: VideoSegment = {
        id: crypto.randomUUID(),
        name: `${validation.platform}: ${embedUrl.slice(0, 40)}...`,
        url: embedUrl,
        videoType: newLinkType,
        title: newLinkTitle || typeLabels[newLinkType],
        durationSeconds,
        startMinute,
        endMinute,
        progress: 100,
        status: 'ready',
        isLink: true,
        half: newLinkType === 'first_half' ? 'first' : newLinkType === 'second_half' ? 'second' : undefined,
      };

      // Verificar duplicatas antes de adicionar
      setSegments(prev => {
        const isDuplicate = prev.some(s => s.url === newSegment.url);
        if (isDuplicate) {
          console.log('[Upload] Link duplicado ignorado:', newSegment.url);
          toast({
            title: "Link já adicionado",
            description: "Este link já está na lista.",
            variant: "destructive"
          });
          return prev;
        }
        return [...prev, newSegment];
      });
      setNewLinkInput('');
      setNewLinkTitle('');
      setNewStartMinute('');
      setNewEndMinute('');
      setNewDuration('');
      
      toast({
        title: `✓ ${validation.platform} adicionado`,
        description: `${newSegment.title} (${startMinute}'-${endMinute}')`
      });
    } catch (error) {
      clearInterval(timerInterval);
      setIsValidatingLink(false);
      setLinkValidationTime(0);
      
      toast({
        title: "Erro ao validar link",
        description: "Não foi possível validar o link. Tente novamente.",
        variant: "destructive"
      });
    }
  };

  // Helper function to get valid match ID from multiple sources
  const getValidMatchId = (): string | null => {
    // Prioridade: createdMatchId > selectedExistingMatch > existingMatchId > URL param
    const urlMatchId = new URLSearchParams(window.location.search).get('match');
    const matchId = createdMatchId || selectedExistingMatch || existingMatchId || urlMatchId;
    
    console.log('[getValidMatchId]', { createdMatchId, selectedExistingMatch, existingMatchId, urlMatchId, result: matchId });
    
    return matchId;
  };

  // Create match immediately when continuing from match setup
  const handleMatchSetupContinue = async () => {
    if (matchData.homeTeamId === matchData.awayTeamId) {
      toast({ 
        title: "Erro de validação", 
        description: "Times não podem ser iguais", 
        variant: "destructive" 
      });
      return;
    }

    if (!matchData.homeTeamId || !matchData.awayTeamId) {
      toast({ 
        title: "Times não selecionados", 
        description: "Selecione ambos os times para continuar", 
        variant: "destructive" 
      });
      return;
    }

    setIsCreatingMatch(true);
    try {
      let matchDateTime: string | undefined;
      
      if (matchData.matchDate) {
        try {
          const timeStr = matchData.matchTime || '00:00';
          const dateTimeStr = `${matchData.matchDate}T${timeStr}:00`;
          const parsedDate = new Date(dateTimeStr);
          
          // Validate the date is valid
          if (!isNaN(parsedDate.getTime())) {
            matchDateTime = parsedDate.toISOString();
          }
        } catch {
          // If date parsing fails, leave as undefined
          console.warn('Failed to parse match date:', matchData.matchDate, matchData.matchTime);
        }
      }

      const match = await createMatch.mutateAsync({
        home_team_id: matchData.homeTeamId,
        away_team_id: matchData.awayTeamId,
        competition: matchData.competition || undefined,
        match_date: matchDateTime,
        venue: matchData.venue || undefined,
      });

      // Atualizar estados e URL
      setCreatedMatchId(match.id);
      setSelectedExistingMatch(match.id);
      navigate(`/upload?match=${match.id}`, { replace: true });
      setCurrentStep('videos');

      const homeTeam = teams.find(t => t.id === matchData.homeTeamId);
      const awayTeam = teams.find(t => t.id === matchData.awayTeamId);

      toast({
        title: "✓ Partida criada",
        description: `${homeTeam?.name || 'Casa'} vs ${awayTeam?.name || 'Visitante'} - Agora adicione os vídeos`,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao criar partida",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreatingMatch(false);
    }
  };

  // Verify server before opening LocalFileBrowser
  const handleOpenLocalBrowser = async (half: 'first' | 'second' | null) => {
    const matchId = getValidMatchId();
    if (!matchId) {
      toast({ 
        title: "Partida não selecionada", 
        description: "Crie ou selecione uma partida primeiro.", 
        variant: "destructive" 
      });
      return;
    }
    
    // Verificar servidor Python
    try {
      await apiClient.health();
    } catch {
      toast({
        title: "Servidor Python offline",
        description: "O modo 'Arquivo Local' requer o servidor Python em localhost:5000. Use a aba 'Upload' para enviar via nuvem.",
        variant: "destructive",
      });
      return;
    }
    
    setLocalBrowserHalf(half);
    setShowLocalBrowser(true);
  };

  // Handle local file selection (no upload - just link the path)
  const handleLocalFileSelect = async (file: { path: string; name: string; size_mb: number }) => {
    // Fallback: ler diretamente da URL caso o estado ainda não esteja sincronizado
    const urlMatchId = new URLSearchParams(window.location.search).get('match');
    const matchId = selectedExistingMatch || existingMatchId || urlMatchId;
    
    console.log('[handleLocalFileSelect] Match IDs:', { selectedExistingMatch, existingMatchId, urlMatchId, matchId });
    
    if (!matchId) {
      toast({
        title: "Partida não selecionada",
        description: "Selecione ou crie uma partida primeiro.",
        variant: "destructive",
      });
      return;
    }
    const videoType = localBrowserHalf === 'first' ? 'first_half' : 
                      localBrowserHalf === 'second' ? 'second_half' : 'full';
    
    const segmentId = crypto.randomUUID();
    const defaultMins = {
      first_half: { start: 0, end: 45 },
      second_half: { start: 45, end: 90 },
      full: { start: 0, end: 90 },
    }[videoType];

    // Verificar se arquivo já está na lista (usando ref para evitar stale closure)
    const alreadyExists = segmentsRef.current.some(s => 
      s.name === file.name || (s.url && s.url.includes(file.path))
    );
    if (alreadyExists) {
      console.log('[Upload] Arquivo já está na lista:', file.name);
      toast({
        title: "Arquivo já adicionado",
        description: `${file.name} já está na lista.`,
      });
      setShowLocalBrowser(false);
      return;
    }

    // Add segment immediately as "linking"
    const newSegment: VideoSegment = {
      id: segmentId,
      name: file.name,
      size: file.size_mb * 1024 * 1024,
      videoType: videoType as VideoType,
      title: file.name.replace(/\.[^/.]+$/, ''),
      durationSeconds: null,
      startMinute: defaultMins.start,
      endMinute: defaultMins.end,
      progress: 50,
      status: 'uploading',
      isLink: false,
      half: localBrowserHalf || undefined,
    };
    setSegments(prev => [...prev, newSegment]);

    try {
      const result = await apiClient.linkLocalFile({
        local_path: file.path,
        match_id: matchId,
        subfolder: 'videos',
        video_type: videoType as any,
      });

      // Check if video already existed (no duplicate created)
      if (result.already_exists) {
        // Check if this video is already in segments list - usar ref para evitar closure stale
        const alreadyInList = segmentsRef.current.some(s => s.id === result.video.id);
        
        if (alreadyInList) {
          // Remove the temporary segment - video already exists
          setSegments(prev => prev.filter(s => s.id !== segmentId));
          toast({
            title: "Vídeo já vinculado",
            description: `${file.name} já estava na lista.`,
          });
        } else {
          // Update with the real database ID
          setSegments(prev => prev.map(s => 
            s.id === segmentId 
              ? { 
                  ...s,
                  id: result.video.id,  // Use database ID
                  progress: 100, 
                  status: 'complete' as const, 
                  url: result.video.file_url,
                  durationSeconds: result.duration_seconds,
                }
              : s
          ));
          toast({
            title: "✓ Vídeo já registrado",
            description: `${file.name} (${file.size_mb} MB) - Recuperado do banco.`,
          });
        }
        return;
      }

      // New video created - update segment with database ID
      setSegments(prev => prev.map(s => 
        s.id === segmentId 
          ? { 
              ...s,
              id: result.video.id,  // Use database ID to match future queries
              progress: 100, 
              status: 'complete' as const, 
              url: result.video.file_url,
              durationSeconds: result.duration_seconds,
            }
          : s
      ));

      toast({
        title: "✓ Vídeo vinculado",
        description: `${file.name} (${file.size_mb} MB) - Sem upload necessário!`,
      });
    } catch (error: any) {
      setSegments(prev => prev.map(s => 
        s.id === segmentId ? { ...s, status: 'error' as const } : s
      ));
      
      const isServerError = error.message?.includes('Servidor Python') || 
                            error.message?.includes('expirou') ||
                            error.message?.includes('timeout');
      
      toast({
        title: isServerError ? "Servidor indisponível" : "Erro ao vincular arquivo",
        description: isServerError 
          ? "Verifique se o servidor Python está rodando em localhost:5000 e tente novamente."
          : error.message,
        variant: "destructive",
      });
    }
  };

  const updateSegment = (updated: VideoSegment) => {
    setSegments(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  const removeSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  // Helper to read SRT file content
  const readSrtFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || '');
      reader.onerror = () => reject(new Error('Failed to read SRT file'));
      reader.readAsText(file);
    });
  };

  // Handle SRT file drop per half
  const handleSrtDrop = async (file: File, half: 'first' | 'second') => {
    if (half === 'first') {
      setFirstHalfSrt(file);
    } else {
      setSecondHalfSrt(file);
    }
    
    // Read and attach to corresponding segments
    const srtContent = await readSrtFile(file);
    
    setSegments(prev => prev.map(s => {
      if ((half === 'first' && (s.half === 'first' || s.videoType === 'first_half')) ||
          (half === 'second' && (s.half === 'second' || s.videoType === 'second_half'))) {
        return { ...s, transcription: srtContent };
      }
      return s;
    }));
    
    toast({
      title: "Legenda carregada",
      description: `${file.name} para ${half === 'first' ? '1º' : '2º'} tempo`,
    });
  };
  
  const handleSrtRemove = (half: 'first' | 'second') => {
    if (half === 'first') {
      setFirstHalfSrt(null);
    } else {
      setSecondHalfSrt(null);
    }
    
    // Remove transcription from corresponding segments
    setSegments(prev => prev.map(s => {
      if ((half === 'first' && (s.half === 'first' || s.videoType === 'first_half')) ||
          (half === 'second' && (s.half === 'second' || s.videoType === 'second_half'))) {
        return { ...s, transcription: undefined };
      }
      return s;
    }));
  };

  // State for processing progress
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState('');
  
  // Detailed processing state
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingError, setProcessingError] = useState<string | undefined>();

  // Transcribe video/embed using Whisper API with FFmpeg audio extraction - WITH RETRIES AND FALLBACK
  // Now supports in-browser video splitting for large files when local server is offline
  const transcribeWithWhisper = async (segment: VideoSegment, matchId: string): Promise<string | null> => {
    const MAX_RETRIES = 2;
    
    console.log('========================================');
    console.log('[transcribeWithWhisper] INICIANDO');
    console.log('Segmento:', segment.name);
    console.log('URL:', segment.url);
    console.log('isLink:', segment.isLink);
    console.log('Match ID:', matchId);
    console.log('Server Online:', isLocalServerOnline);
    console.log('========================================');
    
    // Check if we need to split video in browser
    const sizeMB = (segment.size || 0) / (1024 * 1024);
    const needsBrowserSplit = shouldSplitInBrowser(sizeMB, !!isLocalServerOnline);
    
    if (needsBrowserSplit && segment.url && !segment.isLink) {
      console.log(`[Browser Split] Video is ${sizeMB.toFixed(0)}MB, server offline - splitting in browser`);
      
      try {
        // Calculate optimal parts
        const numParts = calculateOptimalParts(sizeMB);
        console.log(`[Browser Split] Will split into ${numParts} parts`);
        
        setTranscriptionProgress(`Baixando vídeo (0%)...`);
        
        // Fetch video blob with progress
        const videoBlob = await downloadVideoWithProgress(segment.url, (percent) => {
          setTranscriptionProgress(`Baixando vídeo (${percent}%)...`);
        });
        
        console.log(`[Browser Split] Video blob size: ${(videoBlob.size / 1024 / 1024).toFixed(1)}MB`);
        
        // Split video in browser
        const parts = await splitVideoInBrowser(videoBlob, numParts, (progress) => {
          setTranscriptionProgress(`${progress.message}`);
        });
        
        console.log(`[Browser Split] Split into ${parts.length} parts`);
        
        // Transcribe each part and combine
        let combinedTranscription = '';
        
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const partSizeMB = (part.size / 1024 / 1024).toFixed(1);
          
          setTranscriptionProgress(`Transcrevendo parte ${i + 1}/${parts.length} (${partSizeMB}MB)...`);
          console.log(`[Browser Split] Transcribing part ${i + 1}/${parts.length} (${partSizeMB}MB)`);
          
          // Upload part to temporary storage
          const partFileName = `temp_part_${i + 1}_${Date.now()}.mp4`;
          const partFile = new File([part], partFileName, { type: 'video/mp4' });
          
          try {
            // Upload part
            const uploadResult = await apiClient.uploadFile(matchId, 'temp', partFile, partFileName);
            
            // Transcribe part
            const transcriptionResult = await apiClient.transcribeLargeVideo({
              videoUrl: uploadResult.url
            });
            
            if (transcriptionResult?.text) {
              combinedTranscription += transcriptionResult.text + '\n\n';
              console.log(`[Browser Split] Part ${i + 1} transcribed: ${transcriptionResult.text.length} chars`);
            } else if (transcriptionResult?.requiresLocalServer) {
              // Part is still too big - shouldn't happen but handle it
              console.warn(`[Browser Split] Part ${i + 1} still too large, skipping`);
              toast({
                title: `⚠️ Parte ${i + 1} muito grande`,
                description: "Algumas partes não puderam ser transcritas.",
                variant: "destructive",
              });
            }
          } catch (partError) {
            console.error(`[Browser Split] Error transcribing part ${i + 1}:`, partError);
            // Continue with other parts
          }
        }
        
        if (combinedTranscription.trim()) {
          console.log(`[Browser Split] Combined transcription: ${combinedTranscription.length} chars`);
          return combinedTranscription.trim();
        } else {
          console.error('[Browser Split] No transcription obtained from any parts');
          return null;
        }
        
      } catch (splitError) {
        console.error('[Browser Split] Error during browser split:', splitError);
        toast({
          title: "Erro na divisão do vídeo",
          description: splitError instanceof Error ? splitError.message : "Falha ao dividir vídeo no navegador",
          variant: "destructive",
        });
        return null;
      }
    }
    
    // Original transcription logic for smaller files or when server is online
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Tentativa ${attempt}/${MAX_RETRIES}] Iniciando transcrição Whisper para: ${segment.name}`);
        
        // ESTRATÉGIA 1: Para MP4 uploaded, usar FFmpeg para extrair áudio
        if (!segment.isLink && segment.url) {
          setTranscriptionProgress(`[${attempt}/${MAX_RETRIES}] Extraindo áudio de ${segment.name}...`);
          console.log('[FFmpeg] Tentando extrair áudio do MP4...');
          
          // Generate a unique videoId for the audio file
          const videoId = segment.id || crypto.randomUUID();
          
          try {
            // Use FFmpeg to extract audio, upload, and transcribe
            const result = await transcribeVideo(segment.url, matchId, videoId);
            
            if (result?.text) {
              console.log('[FFmpeg] ✓ Transcrição FFmpeg completa:', result.text.length, 'caracteres');
              return result.text;
            }
            
            console.log('[FFmpeg] ✗ FFmpeg retornou sem texto, tentando fallback...');
          } catch (ffmpegError) {
            console.error('[FFmpeg] ✗ FFmpeg falhou:', ffmpegError);
            console.log('[FFmpeg] Tentando fallback direto para edge function...');
          }
        }
        
        // ESTRATÉGIA 2: Fallback - enviar URL diretamente para edge function
        setTranscriptionProgress(`[${attempt}/${MAX_RETRIES}] Transcrevendo ${segment.name} (fallback)...`);
        console.log('[Fallback] Enviando URL diretamente para edge function...');
        
        let requestBody: { audioUrl?: string; videoUrl?: string; embedUrl?: string } = {};
        
        if (segment.isLink) {
          // Para embeds, enviar URL do embed
          requestBody = { embedUrl: segment.url };
          console.log('[Fallback] Usando embedUrl:', segment.url);
        } else if (segment.url) {
          // Para MP4 uploaded como fallback - usar videoUrl (edge function vai baixar)
          requestBody = { videoUrl: segment.url };
          console.log('[Fallback] Usando videoUrl:', segment.url);
        }
        
        if (!requestBody.videoUrl && !requestBody.embedUrl) {
          console.log('[Fallback] ✗ Segmento sem URL válida para transcrição');
          return null;
        }
        
        console.log('[Fallback] Invocando transcribe-large-video via apiClient...');
        let data: { success?: boolean; text?: string; srtContent?: string; requiresSrt?: boolean; requiresLocalServer?: boolean; suggestion?: string; error?: string };
        try {
          data = await apiClient.transcribeLargeVideo({ 
            videoUrl: requestBody.videoUrl || requestBody.embedUrl 
          });
        } catch (error: any) {
          console.error(`[Tentativa ${attempt}] Erro na transcrição Whisper:`, error);
          if (attempt < MAX_RETRIES) {
            console.log('Tentando novamente...');
            continue;
          }
          throw error;
        }
        
        console.log('[Fallback] Resposta:', { success: data?.success, hasText: !!data?.text, requiresLocalServer: data?.requiresLocalServer });
        
        // Check if video is too large for cloud processing
        if (data?.requiresLocalServer) {
          console.log('[Fallback] Vídeo requer servidor local:', data.suggestion);
          toast({
            title: "⚠️ Vídeo muito grande para transcrição na nuvem",
            description: data.suggestion || "Vídeos maiores que 500MB precisam do servidor Python local (python server.py) ou um arquivo SRT.",
            variant: "destructive",
          });
          return null;
        }
        
        // Check if embed requires SRT
        if (data?.requiresSrt) {
          console.log('[Fallback] Embed requer SRT manual:', data.error);
          toast({
            title: "Embed não suportado",
            description: "Este embed não suporta extração automática. Faça upload do MP4 ou forneça um arquivo SRT.",
            variant: "destructive",
          });
          return null;
        }
        
        if (!data?.success) {
          console.error('[Fallback] Transcrição falhou:', data?.error);
          if (attempt < MAX_RETRIES) {
            console.log('Tentando novamente...');
            continue;
          }
          throw new Error(data?.error || 'Falha na transcrição');
        }
        
        console.log('[Fallback] ✓ Transcrição completa:', data.text?.length || 0, 'caracteres');
        return data.text || data.srtContent || '';
      } catch (error: any) {
        console.error(`[Tentativa ${attempt}] Erro ao transcrever:`, error);
        if (attempt === MAX_RETRIES) {
          console.log('Todas as tentativas de transcrição falharam');
          
          // Show informative toast with actual error
          const errorMessage = error?.message || 'Erro desconhecido';
          const isDependencyError = errorMessage.includes('Dependência') || errorMessage.includes('module') || errorMessage.includes('faster-whisper');
          const isServerError = errorMessage.includes('servidor') || errorMessage.includes('offline');
          const isApiKeyError = errorMessage.includes('API') || errorMessage.includes('chave') || errorMessage.includes('configurad');
          
          toast({
            title: isDependencyError 
              ? "⚠️ Dependência faltando no servidor" 
              : isServerError 
                ? "⚠️ Servidor Python offline" 
                : isApiKeyError
                  ? "⚠️ Chave de API não configurada"
                  : "⚠️ Transcrição falhou",
            description: isDependencyError 
              ? "Se quiser usar Whisper Local offline, execute: pip install faster-whisper==1.1.0"
              : isApiKeyError
                ? "Configure sua chave Google/Lovable em Configurações > APIs para transcrição."
                : errorMessage.length > 150 
                  ? errorMessage.substring(0, 150) + '...' 
                  : errorMessage,
            variant: "destructive",
            duration: 10000,
          });
          
          return null;
        }
      }
    }
    
    return null;
  };

  const handleStartAnalysis = async () => {
    // Reset and start processing
    setProcessingStage('preparing');
    setProcessingProgress(0);
    setProcessingMessage('Validando arquivos e configurações...');
    setProcessingError(undefined);
    
    try {
      // CORREÇÃO: Usar ref para obter valor atual dos segmentos (evita stale closure)
      const currentSegments = segmentsRef.current;
      
      console.log('========================================');
      console.log('handleStartAnalysis - INÍCIO');
      console.log('segments do estado:', segments.length);
      console.log('segmentsRef.current:', currentSegments.length);
      
      // Validação: verificar se há segmentos disponíveis
      if (currentSegments.length === 0) {
        console.error('ERRO CRÍTICO: Nenhum segmento disponível!');
        setProcessingStage('error');
        setProcessingError('Nenhum vídeo encontrado. Por favor, faça upload de vídeos.');
        toast({
          title: "Nenhum vídeo encontrado",
          description: "Por favor, faça upload de vídeos ou recarregue a página.",
          variant: "destructive"
        });
        return;
      }
      
      // Debug: mostrar estado dos segmentos
      currentSegments.forEach(s => {
        console.log(`  - ${s.name}: status=${s.status}, url=${s.url ? 'SIM' : 'NÃO'}, videoType=${s.videoType}`);
      });
      
      let matchId: string;
      let homeTeamName: string = '';
      let awayTeamName: string = '';

      // PRIORIDADE 1: Partida criada no passo anterior (Nova Partida)
      if (createdMatchId) {
        matchId = createdMatchId;
        homeTeamName = teams.find(t => t.id === matchData.homeTeamId)?.name || 'Time Casa';
        awayTeamName = teams.find(t => t.id === matchData.awayTeamId)?.name || 'Time Visitante';
        
        console.log('=== USANDO PARTIDA JÁ CRIADA ===');
        console.log('Match ID:', matchId);
        console.log('Time Casa:', homeTeamName);
        console.log('Time Visitante:', awayTeamName);
      }
      // PRIORIDADE 2: Reimportação de partida existente (da URL)
      else if (existingMatchId && existingMatch) {
        matchId = existingMatchId;
        homeTeamName = existingMatch.home_team?.name || 'Time Casa';
        awayTeamName = existingMatch.away_team?.name || 'Time Visitante';
        
        console.log('=== REIMPORTAÇÃO PARA PARTIDA EXISTENTE ===');
        console.log('Match ID:', matchId);
        console.log('Time Casa:', homeTeamName);
        console.log('Time Visitante:', awayTeamName);
      }
      // PRIORIDADE 3: Partida selecionada no wizard
      else if (selectedExistingMatch) {
        matchId = selectedExistingMatch;
        const match = allMatches.find(m => m.id === selectedExistingMatch);
        homeTeamName = match?.home_team?.name || 'Time Casa';
        awayTeamName = match?.away_team?.name || 'Time Visitante';
        
        console.log('=== USANDO PARTIDA SELECIONADA ===');
        console.log('Match ID:', matchId);
        console.log('Time Casa:', homeTeamName);
        console.log('Time Visitante:', awayTeamName);
      }
      // FALLBACK: Criar partida aqui (não deveria chegar aqui no novo fluxo)
      else {
        // VALIDATION: Check teams are different
        if (matchData.homeTeamId && matchData.awayTeamId && matchData.homeTeamId === matchData.awayTeamId) {
          setProcessingStage('idle');
          toast({
            title: "Erro de validação",
            description: "Os times da casa e visitante não podem ser iguais.",
            variant: "destructive"
          });
          return;
        }

        // VALIDATION: Confirm teams exist
        if (!matchData.homeTeamId || !matchData.awayTeamId) {
          setProcessingStage('idle');
          toast({
            title: "Times não selecionados",
            description: "Por favor, selecione os times da partida antes de iniciar a análise.",
            variant: "destructive"
          });
          return;
        }

        // Get team names
        const homeTeam = teams.find(t => t.id === matchData.homeTeamId);
        const awayTeam = teams.find(t => t.id === matchData.awayTeamId);
        homeTeamName = homeTeam?.name || 'Time Casa';
        awayTeamName = awayTeam?.name || 'Time Visitante';

        console.log('=== FALLBACK: CRIANDO NOVA PARTIDA ===');
        console.log('Time Casa:', homeTeamName);
        console.log('Time Visitante:', awayTeamName);

        // Create match
        const matchDateTime = matchData.matchDate 
          ? new Date(`${matchData.matchDate}T${matchData.matchTime || '00:00'}`).toISOString()
          : undefined;

        const match = await createMatch.mutateAsync({
          home_team_id: matchData.homeTeamId,
          away_team_id: matchData.awayTeamId,
          competition: matchData.competition || undefined,
          match_date: matchDateTime,
          venue: matchData.venue || undefined,
        });
        
        matchId = match.id;
      }
      
      // Store the matchId for later navigation
      setCreatedMatchId(matchId);

      // Check if we should use async processing (local server available + large files or local mode)
      const hasLargeVideos = currentSegments.some(s => (s.size || 0) > 300 * 1024 * 1024); // 300MB+
      const isUsingLocalMode = uploadMode === 'local';
      const shouldUseAsyncPipeline = isLocalServerOnline && (hasLargeVideos || isUsingLocalMode);
      
      console.log('=== PIPELINE SELECTION ===');
      console.log('Local server online:', isLocalServerOnline);
      console.log('Has large videos (>300MB):', hasLargeVideos);
      console.log('Using local mode:', isUsingLocalMode);
      console.log('Will use async pipeline:', shouldUseAsyncPipeline);
      
      if (shouldUseAsyncPipeline) {
        // USE ASYNC PIPELINE - Parallel processing on local server
        console.log('🚀 Iniciando pipeline assíncrono paralelo...');
        setProcessingStage('idle'); // Hide old progress, show async progress
        
        // Build video inputs for async processing
        const videoInputs: VideoInput[] = currentSegments
          .filter(s => s.status === 'complete' || s.status === 'ready')
          .map(s => ({
            url: s.url || '',
            halfType: s.half === 'second' || s.videoType === 'second_half' ? 'second' : 'first',
            videoType: s.videoType,
            startMinute: s.startMinute ?? 0,
            endMinute: s.endMinute ?? 90,
            sizeMB: (s.size || 0) / (1024 * 1024),
          }));
        
        try {
          await asyncProcessing.startProcessing({
            matchId,
            videos: videoInputs,
            homeTeam: homeTeamName,
            awayTeam: awayTeamName,
            autoClip: true,
            autoAnalysis: true,
          });
          
          toast({
            title: "🚀 Processamento paralelo iniciado",
            description: "O servidor local está processando os vídeos em paralelo. Acompanhe o progresso abaixo.",
          });
        } catch (error: any) {
          console.error('Erro ao iniciar pipeline assíncrono:', error);
          toast({
            title: "Erro no processamento",
            description: error.message || "Falha ao iniciar o processamento paralelo.",
            variant: "destructive",
          });
        }
        
        return; // Exit - async processing will handle the rest
      }

      // FALLBACK: Original sequential processing for cloud/small files
      // Update progress - Uploading stage
      setProcessingStage('uploading');
      setProcessingProgress(10);
      setProcessingMessage('Registrando vídeos na partida...');

      // Register all video segments - USANDO currentSegments
      for (const segment of currentSegments) {
        if (segment.status === 'complete' || segment.status === 'ready') {
          await apiClient.createVideo({
            match_id: matchId,
            file_url: segment.url || '',
            file_name: segment.title || segment.name,
            video_type: segment.videoType,
            start_minute: segment.startMinute,
            end_minute: segment.endMinute,
            duration_seconds: segment.durationSeconds,
            status: 'pending'
          });
        }
      }
      
      setProcessingProgress(30);

      // Collect transcriptions from SRT files first
      let firstHalfTranscription = '';
      let secondHalfTranscription = '';

      // Get transcription from SRT files or segments
      if (firstHalfSrt) {
        firstHalfTranscription = await readSrtFile(firstHalfSrt);
      }
      if (secondHalfSrt) {
        secondHalfTranscription = await readSrtFile(secondHalfSrt);
      }

      // Debug: mostrar todos os segmentos disponíveis - USANDO currentSegments
      console.log('=== SEGMENTOS DISPONÍVEIS PARA TRANSCRIÇÃO ===');
      currentSegments.forEach(s => {
        console.log(`- ${s.name}: half=${s.half}, videoType=${s.videoType}, status=${s.status}, url=${s.url ? 'SIM' : 'NÃO'}, isLink=${s.isLink}`);
      });

      // CORREÇÃO: Incluir vídeos 'full' no filtro de segmentos - USANDO currentSegments
      // Vídeos 'full' são tratados como primeiro tempo para transcrição única
      const firstHalfSegments = currentSegments.filter(s => 
        (s.half === 'first' || s.videoType === 'first_half' || s.videoType === 'full') && 
        (s.status === 'complete' || s.status === 'ready')
      );
      
      // Segundo tempo: processar se existir, independente de 'full' - USANDO currentSegments
      const hasFullVideo = currentSegments.some(s => 
        s.videoType === 'full' && (s.status === 'complete' || s.status === 'ready')
      );
      
      // CORREÇÃO: Sempre buscar segmentos do 2º tempo se existirem
      const secondHalfSegments = currentSegments.filter(s => 
        (s.half === 'second' || s.videoType === 'second_half') && 
        (s.status === 'complete' || s.status === 'ready')
      );
      
      // Se tem vídeo full E segmentos do 2º tempo separados, priorizar os separados
      const shouldProcessSecondHalf = secondHalfSegments.length > 0;

      console.log('=== SEGMENTOS FILTRADOS ===');
      console.log('1º Tempo / Full:', firstHalfSegments.length, 'segmentos');
      console.log('2º Tempo:', secondHalfSegments.length, 'segmentos');
      console.log('Tem vídeo full:', hasFullVideo);

      // Check segment transcriptions first (from SRT uploads)
      if (!firstHalfTranscription && firstHalfSegments[0]?.transcription) {
        firstHalfTranscription = firstHalfSegments[0].transcription;
      }
      if (!secondHalfTranscription && secondHalfSegments[0]?.transcription) {
        secondHalfTranscription = secondHalfSegments[0].transcription;
      }

      console.log('=== TRANSCRIÇÕES PRÉ-WHISPER ===');
      console.log('1º Tempo / Full:', firstHalfTranscription ? `${firstHalfTranscription.length} chars` : 'Nenhuma');
      console.log('2º Tempo:', secondHalfTranscription ? `${secondHalfTranscription.length} chars` : 'Nenhuma');

      // AUTO-TRANSCRIBE: Se não tem SRT, usar fila de transcrição
      setIsTranscribing(true);
      
      // Preparar itens para fila de transcrição
      const transcriptionItems: { segment: VideoSegment; halfType: 'first' | 'second' }[] = [];
      
      // Adicionar primeiro tempo / full à fila
      if (!firstHalfTranscription && firstHalfSegments.length > 0) {
        const segment = firstHalfSegments[0];
        transcriptionItems.push({ segment, halfType: 'first' });
      }
      
      // Adicionar segundo tempo à fila (sempre processar se existir arquivo separado)
      if (!secondHalfTranscription && secondHalfSegments.length > 0) {
        const segment = secondHalfSegments[0];
        transcriptionItems.push({ segment, halfType: 'second' });
      }
      
      // Processar transcrições em fila (sequencialmente para evitar gargalo)
      for (const { segment, halfType } of transcriptionItems) {
        const isFullMatch = segment.videoType === 'full';
        const halfLabel = isFullMatch ? 'partida completa' : (halfType === 'first' ? '1º tempo' : '2º tempo');
        
        console.log(`=== TRANSCREVENDO: ${halfLabel.toUpperCase()} ===`);
        console.log('Segmento:', segment.name, 'URL:', segment.url, 'Size:', segment.size);
        
        // Update UI stage
        setProcessingStage('transcribing');
        setProcessingProgress(halfType === 'first' ? 30 : 60);
        setProcessingMessage(`Transcrevendo ${halfLabel}...`);
        
        // Calcular tamanho em MB
        const sizeMB = (segment.size || 0) / (1024 * 1024);
        const numParts = sizeMB > 800 ? 4 : sizeMB > 300 ? 2 : 1;
        
        if (numParts > 1) {
          setProcessingMessage(`Dividindo ${halfLabel} em ${numParts} partes...`);
          setTranscriptionProgress(`Parte 1/${numParts}...`);
        }
        
        const transcription = await transcribeWithWhisper(segment, matchId);
        
        if (transcription) {
          if (halfType === 'first') {
            firstHalfTranscription = transcription;
          } else {
            secondHalfTranscription = transcription;
          }
          
          setProcessingProgress(halfType === 'first' ? 50 : 80);
          setProcessingMessage(`✓ ${halfLabel}: ${transcription.length} caracteres`);
          
          toast({
            title: `✓ ${halfLabel.charAt(0).toUpperCase() + halfLabel.slice(1)} transcrito`,
            description: `${transcription.length} caracteres (${numParts > 1 ? numParts + ' partes' : 'completo'})`,
          });
        } else {
          console.error('Transcrição falhou para:', segment.name);
          // Error toast is shown by transcribeWithWhisper with specific details
        }
      }
      
      setIsTranscribing(false);
      setTranscriptionProgress('');

      console.log('=== TRANSCRIÇÕES PÓS-WHISPER ===');
      console.log('1º Tempo:', firstHalfTranscription ? `${firstHalfTranscription.length} chars` : 'Nenhuma');
      console.log('2º Tempo:', secondHalfTranscription ? `${secondHalfTranscription.length} chars` : 'Nenhuma');

      // Check if we have any transcription after auto-transcription
      const hasTranscription = firstHalfTranscription || secondHalfTranscription;
      
      // WARNING: Continue even without transcription - analysis will be limited
      if (!hasTranscription) {
        console.log('⚠️ Sem transcrição disponível - partida será criada mas sem análise de eventos');
        setProcessingStage('complete');
        setProcessingProgress(100);
        setProcessingMessage('Partida criada sem transcrição');
        
        // Check if this was a size issue
        const hasLargeVideo = currentSegments.some(s => (s.size || 0) > 500 * 1024 * 1024);
        
        toast({
          title: hasLargeVideo ? "🖥️ Vídeo muito grande para a nuvem" : "⚠️ Transcrição não disponível",
          description: hasLargeVideo 
            ? "Vídeos acima de 500MB precisam do servidor Python local. Inicie o servidor (cd video-processor && python server.py) e use o modo 'Arquivo Local'."
            : "A partida foi criada. Use 'Analisar com Transcrição' na página de eventos para detectar eventos manualmente.",
          variant: hasLargeVideo ? "destructive" : "default",
          duration: 10000
        });
        
        // Redirect to match anyway - user can add videos/transcription later
        setTimeout(() => {
          navigate(`/events?match=${matchId}`);
        }, 2000);
        return;
      }

      // Update to analyzing stage
      setProcessingStage('analyzing');
      setProcessingProgress(50);
      setProcessingMessage('Analisando transcrição com IA...');

      let totalEventsDetected = 0;

      // Verificar se é vídeo full (partida completa) E tem duração suficiente para dividir
      const fullVideoSegment = currentSegments.find(s => 
        s.videoType === 'full' && (s.status === 'complete' || s.status === 'ready')
      );
      const isFullMatchAnalysis = !!fullVideoSegment;
      
      // CORREÇÃO: Só dividir em 2 tempos se duração for >= 40 minutos
      // Vídeos curtos marcados como "full" devem ser analisados como um único período
      const fullVideoDurationMinutes = fullVideoSegment?.durationSeconds 
        ? Math.floor(fullVideoSegment.durationSeconds / 60) 
        : 90; // Assume 90 min se não souber duração
      
      const shouldSplitAnalysis = isFullMatchAnalysis && fullVideoDurationMinutes >= 40;

      console.log('=== MODO DE ANÁLISE ===');
      console.log('É partida completa (full)?', isFullMatchAnalysis);
      console.log('Duração do vídeo full:', fullVideoDurationMinutes, 'min');
      console.log('Deve dividir em 2 tempos?', shouldSplitAnalysis);
      console.log('Tem 1º tempo separado?', firstHalfSegments.length > 0 && !isFullMatchAnalysis);
      console.log('Tem 2º tempo separado?', secondHalfSegments.length > 0 && !hasFullVideo);
      console.log('Transcrição 1º Tempo:', firstHalfTranscription ? `${firstHalfTranscription.length} chars` : 'N/A');
      console.log('Transcrição 2º Tempo:', secondHalfTranscription ? `${secondHalfTranscription.length} chars` : 'N/A');

      // CASO 1: Vídeo curto (clip/trecho) marcado como "full" - analisar usando startMinute/endMinute
      if (isFullMatchAnalysis && !shouldSplitAnalysis && firstHalfTranscription) {
        console.log(`⚠️ Vídeo "full" de apenas ${fullVideoDurationMinutes} min - analisando como trecho único`);
        
        // Usar os minutos do segmento se configurados, senão estimar pela duração
        const startMinute = fullVideoSegment?.startMinute ?? 0;
        const endMinute = fullVideoSegment?.endMinute ?? Math.min(startMinute + fullVideoDurationMinutes, 90);
        
        setProcessingMessage(`Analisando trecho (${startMinute}'-${endMinute}')...`);
        
        try {
          const result = await startAnalysis({
            matchId,
            transcription: firstHalfTranscription,
            homeTeam: homeTeamName,
            awayTeam: awayTeamName,
            gameStartMinute: startMinute,
            gameEndMinute: endMinute,
            halfType: startMinute >= 45 ? 'second' : 'first',
          });
          
          totalEventsDetected += result.eventsDetected || 0;
          setProcessingProgress(90);
          setProcessingMessage(`✓ Trecho analisado: ${result.eventsDetected} eventos`);
          console.log(`Trecho ${startMinute}'-${endMinute}': ${result.eventsDetected} eventos detectados`);
        } catch (error) {
          console.error('Erro na análise do trecho:', error);
          toast({
            title: "⚠️ Erro na análise do trecho",
            description: "Verifique a transcrição e tente novamente.",
            variant: "destructive",
          });
        }
      }
      // CASO 2: Partida completa de verdade - dividir em 2 tempos
      else if (shouldSplitAnalysis && firstHalfTranscription) {
        // ANÁLISE DE PARTIDA COMPLETA EM 2 FASES (0-45 e 45-90)
        // Dividir em 2 análises melhora significativamente a detecção de gols
        console.log('Iniciando análise da PARTIDA COMPLETA em 2 fases...');
        
        // FASE 1: Primeiro Tempo (0-45 min)
        setProcessingMessage('Detectando eventos do 1º tempo (0-45 min)...');
        
        try {
          const result1 = await startAnalysis({
            matchId,
            transcription: firstHalfTranscription,
            homeTeam: homeTeamName,
            awayTeam: awayTeamName,
            gameStartMinute: 0,
            gameEndMinute: 45,
            halfType: 'first',
          });
          
          totalEventsDetected += result1.eventsDetected || 0;
          setProcessingProgress(70);
          setProcessingMessage(`✓ 1º tempo: ${result1.eventsDetected} eventos`);
          console.log(`1º tempo: ${result1.eventsDetected} eventos detectados`);
        } catch (error) {
          console.error('Erro na análise do 1º tempo (full):', error);
          toast({
            title: "⚠️ Erro na análise do 1º tempo",
            description: "Continuando com 2º tempo...",
            variant: "destructive",
          });
        }
        
        // FASE 2: Segundo Tempo (45-90 min)
        setProcessingMessage('Detectando eventos do 2º tempo (45-90 min)...');
        
        try {
          const result2 = await startAnalysis({
            matchId,
            transcription: firstHalfTranscription,
            homeTeam: homeTeamName,
            awayTeam: awayTeamName,
            gameStartMinute: 45,
            gameEndMinute: 90,
            halfType: 'second',
          });
          
          totalEventsDetected += result2.eventsDetected || 0;
          setProcessingProgress(90);
          setProcessingMessage(`✓ 2º tempo: ${result2.eventsDetected} eventos`);
          console.log(`2º tempo: ${result2.eventsDetected} eventos detectados`);
        } catch (error) {
          console.error('Erro na análise do 2º tempo (full):', error);
          toast({
            title: "⚠️ Erro na análise do 2º tempo",
            description: "Alguns eventos podem não ter sido detectados",
            variant: "destructive",
          });
        }
      } else {
        // ANÁLISE POR TEMPOS SEPARADOS
        setProcessingMessage('Analisando 1º tempo...');
        
        // Analyze first half if has transcription
        if (firstHalfTranscription && firstHalfSegments.length > 0) {
          const segment = firstHalfSegments[0];
          const isClip = segment.videoType === 'clip';
          
          // Para clips, usar minutos configurados; para tempos, usar 0-45 ou 45-90
          const startMin = isClip ? (segment.startMinute ?? 0) : 0;
          const endMin = isClip ? (segment.endMinute ?? 45) : 45;
          
          console.log(`Iniciando análise do ${isClip ? 'trecho' : '1º Tempo'} (${startMin}'-${endMin}')...`);
          setProcessingMessage(isClip ? `Analisando trecho (${startMin}'-${endMin}')...` : 'Analisando 1º tempo...');
          
          try {
            const result = await startAnalysis({
              matchId,
              transcription: firstHalfTranscription,
              homeTeam: homeTeamName,
              awayTeam: awayTeamName,
              gameStartMinute: startMin,
              gameEndMinute: endMin,
              halfType: startMin >= 45 ? 'second' : 'first',
            });
            
            totalEventsDetected += result.eventsDetected || 0;
            setProcessingProgress(75);
            setProcessingMessage(`✓ ${isClip ? 'Trecho' : '1º tempo'}: ${result.eventsDetected} eventos`);
          } catch (error: any) {
            console.error('Erro na análise do 1º tempo:', error);
            const errorMsg = error?.message || 'Erro desconhecido';
            // Traduzir erros comuns
            const friendlyMsg = errorMsg.includes('Failed to send a request to the Edge Function')
              ? 'Serviço de análise temporariamente indisponível. Tente novamente.'
              : errorMsg;
            toast({
              title: "⚠️ Erro na análise do 1º Tempo",
              description: friendlyMsg,
              variant: "destructive",
            });
          }
        }

        // Analyze second half if has transcription
        if (secondHalfTranscription) {
          console.log('Iniciando análise do 2º Tempo...');
          setProcessingMessage('Analisando 2º tempo...');
          
          try {
            const result = await startAnalysis({
              matchId,
              transcription: secondHalfTranscription,
              homeTeam: homeTeamName,
              awayTeam: awayTeamName,
              gameStartMinute: 45,
              gameEndMinute: 90,
            });
            
            totalEventsDetected += result.eventsDetected || 0;
            setProcessingProgress(90);
            setProcessingMessage(`✓ 2º tempo: ${result.eventsDetected} eventos`);
          } catch (error: any) {
            console.error('Erro na análise do 2º tempo:', error);
            const errorMsg = error?.message || 'Erro desconhecido';
            const friendlyMsg = errorMsg.includes('Failed to send a request to the Edge Function')
              ? 'Serviço de análise temporariamente indisponível. Tente novamente.'
              : errorMsg;
            toast({
              title: "⚠️ Erro na análise do 2º Tempo",
              description: friendlyMsg,
              variant: "destructive",
            });
          }
        }
      }

      // Update to saving stage
      setProcessingStage('saving');
      setProcessingProgress(95);
      setProcessingMessage('Salvando eventos...');

      // Atualizar status dos vídeos para 'analyzed' (apenas se existirem no banco)
      const processedSegments = segments.filter(s => s.status === 'complete' || s.status === 'ready');
      for (const segment of processedSegments) {
        if (segment.id) {
          try {
            // Verificar se o vídeo existe antes de atualizar
            const video = await apiClient.getVideo(segment.id);
            if (video) {
              await apiClient.updateVideo(segment.id, { status: 'analyzed' });
              console.log(`[Upload] Vídeo ${segment.id} status atualizado para 'analyzed'`);
            } else {
              console.warn(`[Upload] Vídeo ${segment.id} não encontrado no banco, ignorando atualização`);
            }
          } catch (err) {
            console.warn(`[Upload] Falha ao atualizar status do vídeo ${segment.id}:`, err);
          }
        }
      }

      // Complete!
      setProcessingStage('complete');
      setProcessingProgress(100);
      setProcessingMessage(`✓ ${totalEventsDetected} eventos detectados!`);

      // Success - redirect to events
      toast({
        title: totalEventsDetected > 0 ? "Análise completa!" : "Partida criada",
        description: totalEventsDetected > 0 
          ? `${totalEventsDetected} eventos detectados. Redirecionando...`
          : "Redirecionando para os eventos...",
      });

      setTimeout(() => {
        navigate(`/events?match=${matchId}`);
      }, 2000);

    } catch (error: any) {
      setIsTranscribing(false);
      setTranscriptionProgress('');
      setProcessingStage('error');
      setProcessingError(error.message || 'Erro desconhecido no processamento');
      console.error('Erro na análise:', error);
      toast({
        title: "Erro ao analisar",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const analysisCompleted = analysisJob?.status === 'completed';

  // Count videos per half
  const firstHalfCount = segments.filter(s => s.half === 'first' || s.videoType === 'first_half').length;
  const secondHalfCount = segments.filter(s => s.half === 'second' || s.videoType === 'second_half').length;

  // Show async processing progress (parallel pipeline)
  if (asyncProcessing.isProcessing || asyncProcessing.status) {
    const handleAsyncComplete = () => {
      const matchId = createdMatchId || existingMatchId || selectedExistingMatch;
      
      asyncProcessing.reset();
      setCreatedMatchId(null);
      
      if (matchId) {
        navigate(`/events?match=${matchId}`);
      } else {
        navigate('/matches');
      }
    };
    
    const handleAsyncRetry = () => {
      asyncProcessing.reset();
      handleStartAnalysis();
    };

    return (
      <AppLayout>
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold">
              {asyncProcessing.isComplete ? 'Processamento Concluído' : 
               asyncProcessing.isError ? 'Erro no Processamento' : 
               '⚡ Processamento Paralelo'}
            </h1>
            <p className="text-muted-foreground">
              {asyncProcessing.isComplete ? 'Todos os vídeos foram processados com sucesso' :
               asyncProcessing.isError ? 'Ocorreu um erro durante o processamento' :
               'O servidor local está processando os vídeos em paralelo para maior velocidade'}
            </p>
          </div>

          <div className="max-w-2xl">
            <AsyncProcessingProgress 
              status={asyncProcessing.status}
              onCancel={asyncProcessing.cancelProcessing}
              onRetry={handleAsyncRetry}
              onComplete={handleAsyncComplete}
            />
            
            {asyncProcessing.isComplete && (
              <div className="mt-6 flex gap-4">
                <Button variant="arena" onClick={handleAsyncComplete}>
                  Ver Eventos
                </Button>
                <Button variant="arena-outline" onClick={() => {
                  asyncProcessing.reset();
                  setSegments([]);
                  setMatchData({
                    homeTeamId: '',
                    awayTeamId: '',
                    competition: '',
                    matchDate: '',
                    matchTime: '',
                    venue: '',
                  });
                  setCurrentStep('choice');
                }}>
                  Nova Análise
                </Button>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // Show real-time processing progress (sequential pipeline)
  if (processingStage !== 'idle') {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold">
              {processingStage === 'complete' ? 'Análise Concluída' : 
               processingStage === 'error' ? 'Erro no Processamento' : 
               'Processando Vídeo'}
            </h1>
            <p className="text-muted-foreground">
              Acompanhe o progresso em tempo real
            </p>
          </div>

          <div className="max-w-2xl">
            <ProcessingProgress 
              stage={processingStage}
              currentStep={processingMessage}
              progress={processingProgress}
              message={processingMessage}
              error={processingError}
              transcriptionProgress={transcriptionProgress}
              isTranscribing={isTranscribing}
              isAnalyzing={isStartingAnalysis}
            />

            {(processingStage === 'complete' || processingStage === 'error') && (
              <div className="mt-6 flex gap-4">
                <Button variant="arena" onClick={() => navigate('/matches')}>
                  Ver Partidas
                </Button>
                <Button variant="arena-outline" onClick={() => {
                  setProcessingStage('idle');
                  setProcessingProgress(0);
                  setProcessingMessage('');
                  setProcessingError(undefined);
                  setCurrentJobId(null);
                  setSegments([]);
                  setMatchData({
                    homeTeamId: '',
                    awayTeamId: '',
                    competition: '',
                    matchDate: '',
                    matchTime: '',
                    venue: '',
                  });
                  setCurrentStep('choice');
                }}>
                  Nova Análise
                </Button>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // Show legacy analysis progress (for compatibility)
  if (currentJobId && analysisJob) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold">Análise em Andamento</h1>
            <p className="text-muted-foreground">
              Acompanhe o progresso da análise do vídeo
            </p>
          </div>

          <div className="max-w-2xl">
            <AnalysisProgress job={analysisJob} />

            {analysisCompleted && (
              <div className="mt-6 flex gap-4">
                <Button variant="arena" onClick={() => navigate('/matches')}>
                  Ver Partidas
                </Button>
                <Button variant="arena-outline" onClick={() => {
                  setCurrentJobId(null);
                  setSegments([]);
                  setMatchData({
                    homeTeamId: '',
                    awayTeamId: '',
                    competition: '',
                    matchDate: '',
                    matchTime: '',
                    venue: '',
                  });
                  setCurrentStep('choice');
                }}>
                  Nova Análise
                </Button>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  const steps = currentStep === 'choice' || currentStep === 'existing' 
    ? [] // No step indicator on choice/existing screens
    : [
        { id: 'match' as const, label: 'Partida', icon: '🏟️' },
        { id: 'videos' as const, label: 'Vídeos', icon: '🎬' },
        { id: 'summary' as const, label: 'Análise', icon: '🚀' },
      ];

  // Determine which step is active for the indicator
  const isStepActive = (stepId: WizardStep) => {
    if (stepId === 'match') return currentStep === 'match';
    if (stepId === 'videos') return currentStep === 'videos' || currentStep === 'existing';
    if (stepId === 'summary') return currentStep === 'summary';
    return false;
  };

  const readySegments = segments.filter(s => s.status === 'complete' || s.status === 'ready');

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="relative">
          <div className="absolute inset-0 tactical-grid opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-primary/5 blur-[100px] rounded-full" />

          <div className="relative text-center pt-4 pb-2">
            <img 
              src={arenaPlayWordmark} 
              alt="Arena Play" 
              className="h-12 md:h-16 mx-auto"
            />
            <p className="text-muted-foreground text-sm mt-1">
              Upload de Vídeos
            </p>
          </div>

          {/* Gallery Link */}
          <div className="relative flex justify-center mb-4">
            <Button 
              asChild 
              variant="outline" 
              size="sm" 
              className="gap-2 border-border/50"
            >
              <Link to="/matches">
                <FolderOpen className="h-4 w-4" />
                Ver Galeria
              </Link>
            </Button>
          </div>
        </div>

        {/* Step Indicator - only show when not on choice/existing screens */}
        {steps.length > 0 && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2 p-1 rounded-lg bg-muted/30 border border-border/50">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => {
                      // If reimporting, skip match step
                      if (step.id === 'match' && !existingMatchId && !selectedExistingMatch) setCurrentStep('match');
                      if (step.id === 'videos' && (existingMatchId || selectedExistingMatch || (matchData.homeTeamId && matchData.awayTeamId))) setCurrentStep('videos');
                      if (step.id === 'summary' && readySegments.length > 0) setCurrentStep('summary');
                    }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-md transition-all",
                      isStepActive(step.id) 
                        ? "bg-primary text-primary-foreground" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span>{step.icon}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                  {index < steps.length - 1 && (
                    <div className="w-8 h-px bg-border mx-1" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="pb-8">
          {/* Step 0: Choice - New or Existing */}
          {currentStep === 'choice' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <Card className="border-border/50 bg-card/50 backdrop-blur">
                <CardContent className="pt-6">
                  <div className="text-center mb-8">
                    <h2 className="text-xl font-semibold mb-2">Como deseja prosseguir?</h2>
                    <p className="text-muted-foreground">
                      Crie uma nova partida ou adicione vídeos a uma partida existente
                    </p>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* New Match Option */}
                    <button
                      onClick={() => setCurrentStep('match')}
                      className="group relative p-6 rounded-lg border-2 border-border/50 bg-background/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                    >
                      <div className="flex flex-col items-center text-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <FilePlus className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-1">Nova Partida</h3>
                          <p className="text-sm text-muted-foreground">
                            Criar uma nova partida e fazer upload dos vídeos
                          </p>
                        </div>
                      </div>
                    </button>
                    
                    {/* Existing Match Option */}
                    <button
                      onClick={() => setCurrentStep('existing')}
                      className="group relative p-6 rounded-lg border-2 border-border/50 bg-background/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                    >
                      <div className="flex flex-col items-center text-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <ListPlus className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-1">Adicionar a Partida Existente</h3>
                          <p className="text-sm text-muted-foreground">
                            Adicionar mais vídeos (ex: 2º tempo) a uma partida já analisada
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* Step 0b: Existing Match Selection */}
          {currentStep === 'existing' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <Button variant="ghost" onClick={() => setCurrentStep('choice')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
              
              <Card className="border-border/50 bg-card/50 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListPlus className="h-5 w-5 text-primary" />
                    Selecionar Partida
                  </CardTitle>
                  <CardDescription>
                    Escolha a partida para adicionar novos vídeos
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLoadingMatches ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
                    </div>
                  ) : allMatches.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Nenhuma partida encontrada.</p>
                      <Button 
                        variant="arena" 
                        className="mt-4"
                        onClick={() => setCurrentStep('match')}
                      >
                        Criar Nova Partida
                      </Button>
                    </div>
                  ) : (
                    allMatches.map((match) => (
                      <button
                        key={match.id}
                        onClick={() => {
                          setUserWantsChoice(false); // Reset flag when selecting a match
                          setSelectedExistingMatch(match.id);
                          navigate(`/upload?match=${match.id}`);
                        }}
                        className="w-full flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50 hover:border-primary/50 hover:bg-primary/5 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          {/* Home Team */}
                          <div className="flex items-center gap-2">
                            {match.home_team?.logo_url ? (
                              <img 
                                src={match.home_team.logo_url} 
                                alt={match.home_team.name}
                                className="h-8 w-8 object-contain rounded"
                              />
                            ) : (
                              <div 
                                className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                style={{ backgroundColor: match.home_team?.primary_color || '#10b981' }}
                              >
                                {match.home_team?.short_name?.[0] || 'H'}
                              </div>
                            )}
                            <span className="font-medium">{match.home_team?.short_name || match.home_team?.name || 'Casa'}</span>
                            <span className="font-bold">{match.home_score ?? 0}</span>
                          </div>
                          
                          <span className="text-muted-foreground">x</span>
                          
                          {/* Away Team */}
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{match.away_score ?? 0}</span>
                            <span className="font-medium">{match.away_team?.short_name || match.away_team?.name || 'Visitante'}</span>
                            {match.away_team?.logo_url ? (
                              <img 
                                src={match.away_team.logo_url} 
                                alt={match.away_team.name}
                                className="h-8 w-8 object-contain rounded"
                              />
                            ) : (
                              <div 
                                className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                style={{ backgroundColor: match.away_team?.primary_color || '#ef4444' }}
                              >
                                {match.away_team?.short_name?.[0] || 'A'}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <Badge 
                          variant={match.status === 'completed' ? 'default' : 'secondary'}
                          className={match.status === 'completed' ? 'bg-primary/20 text-primary border-primary/30' : ''}
                        >
                          {match.status === 'completed' ? 'Analisada' : match.status === 'pending' ? 'Pendente' : match.status}
                        </Badge>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 1: Match Setup */}
          {currentStep === 'match' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <Button variant="ghost" onClick={() => setCurrentStep('choice')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
              
              <MatchSetupCard
                data={matchData}
                onChange={setMatchData}
                onContinue={handleMatchSetupContinue}
                isCreating={isCreatingMatch}
              />
            </div>
          )}

          {/* Step 2: Videos */}
          {currentStep === 'videos' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Back Button - only show if not reimporting */}
              {!existingMatchId && !selectedExistingMatch && (
                <Button variant="ghost" onClick={() => setCurrentStep('match')} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </Button>
              )}
              {(existingMatchId || selectedExistingMatch) && (
                <Button variant="ghost" onClick={() => {
                  // Marcar que o usuário quer voltar - isso impede o useEffect de sobrescrever
                  setUserWantsChoice(true);
                  // Limpar estados
                  setSelectedExistingMatch(null);
                  setCurrentStep('choice');
                  // Navegar para URL limpa
                  navigate('/upload', { replace: true });
                }} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </Button>
              )}
              
              {/* Show reimport info banner */}
              {existingMatch && (
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <UploadIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Reimportando vídeos</p>
                    <p className="text-sm text-muted-foreground">
                      {existingMatch.home_team?.name || 'Casa'} vs {existingMatch.away_team?.name || 'Visitante'}
                      {existingMatch.competition && ` • ${existingMatch.competition}`}
                    </p>
                  </div>
                </div>
              )}

              {/* Match Times Config */}
              <MatchTimesConfig times={matchTimes} onChange={setMatchTimes} />

              {/* Upload Mode Tabs */}
              <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as 'file' | 'local' | 'link')}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="local" className="gap-2">
                    <HardDrive className="h-4 w-4" />
                    Arquivo Local
                  </TabsTrigger>
                  <TabsTrigger value="file" className="gap-2">
                    <UploadIcon className="h-4 w-4" />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger value="link" className="gap-2">
                    <LinkIcon className="h-4 w-4" />
                    Link/Embed
                  </TabsTrigger>
                </TabsList>

                {/* Pipeline Status Indicator */}
                <div className={`mt-4 p-3 rounded-lg border flex items-center justify-between ${
                  isLocalServerOnline 
                    ? 'bg-emerald-500/10 border-emerald-500/30' 
                    : 'bg-muted/50 border-border/50'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      isLocalServerOnline ? 'bg-emerald-500/20' : 'bg-muted'
                    }`}>
                      {isLocalServerOnline === undefined ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : isLocalServerOnline ? (
                        <Server className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Cloud className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${isLocalServerOnline ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                        {isLocalServerOnline === undefined 
                          ? 'Verificando servidor...' 
                          : isLocalServerOnline 
                            ? 'Servidor Python Online' 
                            : 'Servidor Python Offline'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isLocalServerOnline 
                          ? 'Pipeline paralelo disponível • FFmpeg nativo' 
                          : 'Usando Supabase Cloud • FFmpeg via WebAssembly'}
                      </p>
                    </div>
                  </div>
                  <Badge 
                    variant={isLocalServerOnline ? 'default' : 'secondary'}
                    className={`gap-1 ${isLocalServerOnline ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}`}
                  >
                    <Zap className="h-3 w-3" />
                    {uploadMode === 'local' && isLocalServerOnline 
                      ? 'Processamento Paralelo' 
                      : isLocalServerOnline 
                        ? 'Pipeline Local' 
                        : 'Pipeline Cloud'}
                  </Badge>
                </div>

                {/* AI Provider Status Alert */}
                {aiStatus && !aiStatus.anyTranscription && (
                  <div className="mt-3 p-3 rounded-lg border bg-yellow-500/10 border-yellow-500/30 flex items-center gap-3">
                    <Brain className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-400">Nenhuma IA de Transcrição Configurada</p>
                      <p className="text-xs text-muted-foreground">
                        Configure uma chave de API (Gemini, OpenAI ou ElevenLabs) em Configurações → APIs para transcrever e analisar partidas.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild className="flex-shrink-0">
                      <Link to="/settings">Configurar</Link>
                    </Button>
                  </div>
                )}

                {/* Transfer Commands Button - for large files */}
                {isLocalServerOnline && (selectedExistingMatch || existingMatchId || createdMatchId) && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTransferCommands(true)}
                      className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <Terminal className="h-4 w-4" />
                      Transferência Direta (SCP/Rsync)
                    </Button>
                  </div>
                )}

                {/* LOCAL FILE MODE - No upload needed */}
                <TabsContent value="local" className="mt-4 space-y-4">
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">⚡ Modo Local Otimizado:</strong> Selecione arquivos diretamente do seu disco. 
                      O servidor acessa o arquivo original sem upload, economizando tempo e espaço.
                    </p>
                  </div>
                  
                  {/* Half Selection Buttons */}
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => handleOpenLocalBrowser('first')}
                      className="group relative p-6 rounded-lg border-2 border-dashed border-blue-500/30 bg-blue-500/5 hover:border-blue-400 hover:bg-blue-500/10 transition-all text-center"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                          <HardDrive className="h-6 w-6 text-blue-400" />
                        </div>
                        <span className="font-medium text-blue-400">1º Tempo</span>
                        <span className="text-xs text-muted-foreground">Clique para navegar</span>
                        {firstHalfCount > 0 && (
                          <Badge variant="secondary" className="mt-1">{firstHalfCount} vídeo(s)</Badge>
                        )}
                      </div>
                    </button>
                    
                    <button
                      onClick={() => handleOpenLocalBrowser('second')}
                      className="group relative p-6 rounded-lg border-2 border-dashed border-orange-500/30 bg-orange-500/5 hover:border-orange-400 hover:bg-orange-500/10 transition-all text-center"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-12 rounded-full bg-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/30 transition-colors">
                          <HardDrive className="h-6 w-6 text-orange-400" />
                        </div>
                        <span className="font-medium text-orange-400">2º Tempo</span>
                        <span className="text-xs text-muted-foreground">Clique para navegar</span>
                        {secondHalfCount > 0 && (
                          <Badge variant="secondary" className="mt-1">{secondHalfCount} vídeo(s)</Badge>
                        )}
                      </div>
                    </button>
                  </div>
                  
                  {/* Full match button */}
                  <button
                    onClick={() => handleOpenLocalBrowser(null)}
                    className="w-full group relative p-4 rounded-lg border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-400 hover:bg-emerald-500/10 transition-all"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                        <HardDrive className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div className="text-left">
                        <span className="font-medium text-emerald-400">Partida Completa ou Trecho</span>
                        <p className="text-xs text-muted-foreground">Clique para navegar pelos arquivos</p>
                      </div>
                    </div>
                  </button>
                </TabsContent>

                {/* UPLOAD MODE */}
                <TabsContent value="file" className="mt-4 space-y-4">
                  {/* Half Dropzones */}
                  <div className="grid grid-cols-2 gap-4">
                    <HalfDropzone 
                      half="first" 
                      videoCount={firstHalfCount}
                      srtFile={firstHalfSrt}
                      onFileDrop={handleHalfDrop}
                      onSrtDrop={handleSrtDrop}
                      onSrtRemove={handleSrtRemove}
                    />
                    <HalfDropzone 
                      half="second" 
                      videoCount={secondHalfCount}
                      srtFile={secondHalfSrt}
                      onFileDrop={handleHalfDrop}
                      onSrtDrop={handleSrtDrop}
                      onSrtRemove={handleSrtRemove}
                    />
                  </div>

                  {/* Generic Dropzone for full/clips */}
                  <Card variant="glass" className="border-emerald-500/30">
                    <CardContent className="pt-4">
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={cn(
                          "relative flex min-h-[100px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 transition-all",
                          isDragging 
                            ? "border-emerald-400 bg-emerald-500/10 scale-[1.02]" 
                            : "border-border/50 hover:border-emerald-500/50"
                        )}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 mb-2">
                          <UploadIcon className="h-5 w-5 text-emerald-400" />
                        </div>
                        <p className="font-medium text-sm text-emerald-400">Partida Completa ou Trecho</p>
                        <p className="text-xs text-muted-foreground">Arraste ou clique para selecionar</p>
                        <input
                          type="file"
                          accept="video/*"
                          multiple
                          onChange={handleFileSelect}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="link" className="mt-4">
                  <Card variant="glass">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <LinkIcon className="h-5 w-5" />
                        Adicionar Vídeo por Link
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Link ou Código Embed</Label>
                        <Textarea
                          placeholder='Cole o link ou código embed'
                          value={newLinkInput}
                          onChange={(e) => setNewLinkInput(e.target.value)}
                          rows={2}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Tipo do Vídeo</Label>
                          <Select value={newLinkType} onValueChange={(v) => setNewLinkType(v as VideoType)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">Partida Completa</SelectItem>
                              <SelectItem value="first_half">1º Tempo</SelectItem>
                              <SelectItem value="second_half">2º Tempo</SelectItem>
                              <SelectItem value="clip">Trecho</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Título</Label>
                          <Input
                            placeholder="Ex: 1º Tempo"
                            value={newLinkTitle}
                            onChange={(e) => setNewLinkTitle(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-primary">
                          <Clock className="h-4 w-4" />
                          Duração e Sincronização
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-xs">Duração do Vídeo (segundos)</Label>
                          <Input
                            type="number"
                            placeholder="Ex: 77 para 1:17"
                            min={1}
                            value={newDuration}
                            onChange={(e) => setNewDuration(e.target.value)}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs">Minuto Inicial</Label>
                            <Input
                              type="number"
                              placeholder={newLinkType === 'second_half' ? '45' : '0'}
                              min={0}
                              max={120}
                              value={newStartMinute}
                              onChange={(e) => setNewStartMinute(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Minuto Final</Label>
                            <Input
                              type="number"
                              placeholder="90"
                              min={0}
                              max={120}
                              value={newEndMinute}
                              onChange={(e) => setNewEndMinute(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <Button 
                        variant="arena" 
                        onClick={addVideoLink} 
                        className="w-full"
                        disabled={isValidatingLink || !newLinkInput.trim()}
                      >
                        {isValidatingLink ? (
                          <>
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                            Validando... {linkValidationTime > 0 && `(${linkValidationTime}s)`}
                          </>
                        ) : (
                          <>
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar Vídeo
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Video Segments List */}
              {segments.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <FileVideo className="h-5 w-5 text-emerald-400" />
                    Vídeos Adicionados ({segments.length})
                  </h3>
                  
                  {segments.map((segment, index) => (
                    <VideoSegmentCard
                      key={segment.id}
                      segment={segment}
                      onChange={updateSegment}
                      onRemove={() => removeSegment(segment.id)}
                      onFallbackClick={() => convertToExternalLink(segment.id)}
                      index={index}
                    />
                  ))}

                  {/* Coverage Timeline */}
                  <Card variant="glass">
                    <CardContent className="pt-6">
                      <CoverageTimeline segments={segments} />
                    </CardContent>
                  </Card>
                  
                  {/* Transcription Queue - show when queue has items */}
                  {transcriptionQueue.queue.length > 0 && (
                    <TranscriptionQueue
                      queue={transcriptionQueue.queue}
                      isProcessing={transcriptionQueue.isProcessing}
                      currentItemId={transcriptionQueue.currentItemId}
                      onStart={transcriptionQueue.startProcessing}
                      onRemove={transcriptionQueue.removeFromQueue}
                      onClear={transcriptionQueue.clearQueue}
                      overallProgress={transcriptionQueue.getQueueProgress()}
                    />
                  )}
                </div>
              )}

              {/* Continue Button - Always Visible */}
              <Card variant="glass" className="border-emerald-500/50 bg-emerald-500/5">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      {segments.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                          Adicione pelo menos um vídeo para continuar
                        </p>
                      ) : readySegments.length === 0 ? (
                        <div className="flex items-center gap-2 text-amber-400 text-sm">
                          <div className="animate-spin h-4 w-4 border-2 border-amber-400 border-t-transparent rounded-full" />
                          Aguardando uploads... ({segments.filter(s => s.status === 'uploading').length} em andamento)
                        </div>
                      ) : (
                        <p className="text-emerald-400 text-sm flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          {readySegments.length} vídeo(s) pronto(s) para análise
                        </p>
                      )}
                    </div>
                    <Button 
                      onClick={() => setCurrentStep('summary')}
                      disabled={readySegments.length === 0}
                      size="lg"
                      variant="arena"
                      className="gap-2 min-w-[200px]"
                    >
                      <Zap className="h-5 w-5" />
                      Continuar para Análise
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 3: Summary */}
          {currentStep === 'summary' && (
            <AnalysisSummary
              matchData={matchData}
              segments={segments}
              onBack={() => setCurrentStep('videos')}
              onStartAnalysis={handleStartAnalysis}
              isLoading={isStartingAnalysis || createMatch.isPending}
              isTranscribing={isTranscribing || isWhisperTranscribing}
              transcriptionProgress={transcriptionProgress}
              whisperProgress={whisperProgress}
            />
          )}
        </div>

        {/* Features Section */}
        {currentStep === 'match' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { icon: <Brain className="h-5 w-5" />, label: 'Análise com IA' },
              { icon: <Zap className="h-5 w-5" />, label: 'Detecção de Eventos' },
              { icon: <BarChart3 className="h-5 w-5" />, label: 'Estatísticas' },
              { icon: <FileText className="h-5 w-5" />, label: 'Relatórios' },
            ].map((feature, i) => (
              <div key={i} className="flex flex-col items-center gap-2 p-4 rounded-lg bg-muted/20 border border-border/30">
                <div className="text-primary">{feature.icon}</div>
                <span className="text-xs text-muted-foreground text-center">{feature.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Local File Browser Dialog */}
      <LocalFileBrowser
        open={showLocalBrowser}
        onOpenChange={setShowLocalBrowser}
        onSelectFile={handleLocalFileSelect}
        matchId={getValidMatchId() || ''}
      />

      {/* Transfer Commands Dialog */}
      <TransferCommandsDialog
        open={showTransferCommands}
        onOpenChange={setShowTransferCommands}
        matchId={getValidMatchId() || ''}
        onSyncComplete={async () => {
          // Limpar segmentos PRIMEIRO para que o useEffect seja acionado corretamente
          setSegments([]);
          
          // Aguardar refetch - quando terminar, existingVideos será atualizado
          // e o useEffect carregará os novos vídeos automaticamente
          await refetchVideos();
          
          toast({
            title: 'Vídeos sincronizados',
            description: 'A lista de vídeos foi atualizada.',
          });
        }}
      />
    </AppLayout>
  );
}
