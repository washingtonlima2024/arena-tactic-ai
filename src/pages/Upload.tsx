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
  ArrowLeft
} from 'lucide-react';
import { useTeams } from '@/hooks/useTeams';
import { useCreateMatch } from '@/hooks/useMatches';
import { useStartAnalysis, useAnalysisJob } from '@/hooks/useAnalysisJob';
import { useWhisperTranscription } from '@/hooks/useWhisperTranscription';
import { AnalysisProgress } from '@/components/analysis/AnalysisProgress';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import arenaPlayWordmark from '@/assets/arena-play-wordmark.png';
import { MatchSetupCard, MatchSetupData } from '@/components/upload/MatchSetupCard';
import { VideoSegmentCard, VideoSegment, VideoType } from '@/components/upload/VideoSegmentCard';
import { CoverageTimeline } from '@/components/upload/CoverageTimeline';
import { AnalysisSummary } from '@/components/upload/AnalysisSummary';
import { MatchTimesConfig, defaultMatchTimes, MatchTimes } from '@/components/upload/MatchTimesConfig';
import { HalfDropzone, getDefaultVideoType, getDefaultMinutes } from '@/components/upload/HalfDropzone';
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

type WizardStep = 'match' | 'videos' | 'summary';

export default function VideoUpload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Check for existing match ID (when reimporting)
  const existingMatchId = searchParams.get('match');
  
  // Fetch existing match data if reimporting
  const { data: existingMatch } = useQuery({
    queryKey: ['match-for-reimport', existingMatchId],
    queryFn: async () => {
      if (!existingMatchId) return null;
      const { data, error } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
        .eq('id', existingMatchId)
        .maybeSingle();
      if (error || !data) return null;
      return data;
    },
    enabled: !!existingMatchId
  });
  
  // Wizard state - skip to 'videos' if reimporting existing match
  const [currentStep, setCurrentStep] = useState<WizardStep>(existingMatchId ? 'videos' : 'match');
  
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
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file');
  
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
  
  const { data: teams = [] } = useTeams();
  const createMatch = useCreateMatch();
  const { startAnalysis, isLoading: isStartingAnalysis } = useStartAnalysis();
  const analysisJob = useAnalysisJob(currentJobId);
  const { transcribeVideo, transcriptionProgress: whisperProgress, isTranscribing: isWhisperTranscribing } = useWhisperTranscription();

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

  // Large file threshold (50MB)
  const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;
  // Upload timeout (60 seconds)
  const UPLOAD_TIMEOUT = 60000;

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

    // Warn about large files
    if (isLargeFile) {
      toast({
        title: "⚠️ Arquivo grande detectado",
        description: `${file.name} (${fileSizeMB} MB) pode demorar ou falhar. Considere usar link externo para arquivos >50MB.`,
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

    setSegments(prev => [...prev, newSegment]);

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

      const { data, error } = await supabase.storage
        .from('match-videos')
        .upload(fileName, file);

      clearInterval(progressInterval);

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('match-videos')
        .getPublicUrl(fileName);

      setSegments(prev => 
        prev.map(s => 
          s.id === segmentId 
            ? { ...s, progress: 100, status: 'complete', url: urlData.publicUrl, elapsedSeconds: undefined }
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

      setSegments(prev => [...prev, newSegment]);
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

  // State for transcription progress
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState('');

  // Transcribe video/embed using Whisper API with FFmpeg audio extraction - WITH RETRIES AND FALLBACK
  const transcribeWithWhisper = async (segment: VideoSegment, matchId: string): Promise<string | null> => {
    const MAX_RETRIES = 2;
    
    console.log('========================================');
    console.log('[transcribeWithWhisper] INICIANDO');
    console.log('Segmento:', segment.name);
    console.log('URL:', segment.url);
    console.log('isLink:', segment.isLink);
    console.log('Match ID:', matchId);
    console.log('========================================');
    
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
        
        console.log('[Fallback] Invocando edge function...');
        const { data, error } = await supabase.functions.invoke('transcribe-audio-whisper', {
          body: requestBody
        });
        
        console.log('[Fallback] Resposta:', { success: data?.success, hasText: !!data?.text, error: error?.message || data?.error });
        
        if (error) {
          console.error(`[Tentativa ${attempt}] Erro na transcrição Whisper:`, error);
          if (attempt < MAX_RETRIES) {
            console.log('Tentando novamente...');
            continue;
          }
          throw error;
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
      } catch (error) {
        console.error(`[Tentativa ${attempt}] Erro ao transcrever:`, error);
        if (attempt === MAX_RETRIES) {
          console.log('Todas as tentativas de transcrição falharam');
          return null;
        }
      }
    }
    
    return null;
  };

  const handleStartAnalysis = async () => {
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

      // If reimporting to existing match, use that match
      if (existingMatchId && existingMatch) {
        matchId = existingMatchId;
        homeTeamName = existingMatch.home_team?.name || 'Time Casa';
        awayTeamName = existingMatch.away_team?.name || 'Time Visitante';
        
        console.log('=== REIMPORTAÇÃO PARA PARTIDA EXISTENTE ===');
        console.log('Match ID:', matchId);
        console.log('Time Casa:', homeTeamName);
        console.log('Time Visitante:', awayTeamName);
      } else {
        // VALIDATION: Check teams are different
        if (matchData.homeTeamId && matchData.awayTeamId && matchData.homeTeamId === matchData.awayTeamId) {
          toast({
            title: "Erro de validação",
            description: "Os times da casa e visitante não podem ser iguais.",
            variant: "destructive"
          });
          return;
        }

        // VALIDATION: Confirm teams exist
        if (!matchData.homeTeamId || !matchData.awayTeamId) {
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

        console.log('=== CRIANDO NOVA PARTIDA ===');
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

      // Register all video segments - USANDO currentSegments
      for (const segment of currentSegments) {
        if (segment.status === 'complete' || segment.status === 'ready') {
          await supabase.from('videos').insert({
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
      
      // Segundo tempo: só incluir se NÃO tiver vídeo 'full' (evita duplicação) - USANDO currentSegments
      const hasFullVideo = currentSegments.some(s => 
        s.videoType === 'full' && (s.status === 'complete' || s.status === 'ready')
      );
      
      const secondHalfSegments = hasFullVideo 
        ? [] // Se tem vídeo full, não precisa transcrever segundo tempo separado
        : currentSegments.filter(s => 
            (s.half === 'second' || s.videoType === 'second_half') && 
            (s.status === 'complete' || s.status === 'ready')
          );

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

      // AUTO-TRANSCRIBE: Se não tem SRT, extrair áudio e transcrever automaticamente
      setIsTranscribing(true);
      
      // Transcrever primeiro tempo OU vídeo full
      if (!firstHalfTranscription && firstHalfSegments.length > 0) {
        const segment = firstHalfSegments[0];
        const isFullMatch = segment.videoType === 'full';
        
        console.log(`Sem SRT para ${isFullMatch ? 'partida completa' : '1º tempo'} - tentando transcrição automática Whisper...`);
        console.log('Segmento selecionado:', segment.name, 'URL:', segment.url, 'isLink:', segment.isLink);
        
        toast({
          title: isFullMatch ? "🎙️ Transcrevendo Partida Completa" : "🎙️ Transcrevendo 1º Tempo",
          description: "Extraindo áudio e enviando para Whisper API...",
        });
        
        const transcription = await transcribeWithWhisper(segment, matchId);
        if (transcription) {
          firstHalfTranscription = transcription;
          toast({
            title: isFullMatch ? "✓ Partida transcrita" : "✓ 1º Tempo transcrito",
            description: `${transcription.length} caracteres extraídos do áudio`,
          });
        } else {
          console.error('Transcrição Whisper falhou para:', segment.name);
          toast({
            title: isFullMatch ? "⚠️ Transcrição da partida falhou" : "⚠️ Transcrição do 1º Tempo falhou",
            description: "Verifique se o vídeo é um arquivo MP4 válido.",
            variant: "destructive",
          });
        }
      }
      
      // Transcrever segundo tempo (apenas se não tiver vídeo full)
      if (!secondHalfTranscription && secondHalfSegments.length > 0 && !hasFullVideo) {
        const segment = secondHalfSegments[0];
        
        console.log('Sem SRT para 2º tempo - tentando transcrição automática Whisper...');
        console.log('Segmento selecionado:', segment.name, 'URL:', segment.url, 'isLink:', segment.isLink);
        
        toast({
          title: "🎙️ Transcrevendo 2º Tempo",
          description: "Extraindo áudio e enviando para Whisper API...",
        });
        
        const transcription = await transcribeWithWhisper(segment, matchId);
        if (transcription) {
          secondHalfTranscription = transcription;
          toast({
            title: "✓ 2º Tempo transcrito",
            description: `${transcription.length} caracteres extraídos do áudio`,
          });
        } else {
          console.error('Transcrição Whisper falhou para:', segment.name);
          toast({
            title: "⚠️ Transcrição do 2º Tempo falhou",
            description: "Verifique se o vídeo é um arquivo MP4 válido.",
            variant: "destructive",
          });
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
        toast({
          title: "⚠️ Sem transcrição disponível",
          description: "A partida foi criada. Para detectar eventos, reimporte com arquivo de vídeo MP4 ou adicione SRT.",
          variant: "default"
        });
        
        // Redirect to match anyway - user can add videos/transcription later
        setTimeout(() => {
          navigate(`/events?match=${matchId}`);
        }, 1500);
        return;
      }

      let totalEventsDetected = 0;

      // Verificar se é vídeo full (partida completa)
      const isFullMatchAnalysis = segments.some(s => 
        s.videoType === 'full' && (s.status === 'complete' || s.status === 'ready')
      );

      if (isFullMatchAnalysis && firstHalfTranscription) {
        // ANÁLISE DE PARTIDA COMPLETA (0-90 min)
        console.log('Iniciando análise da PARTIDA COMPLETA (0-90 min)...');
        
        try {
          const result = await startAnalysis({
            matchId,
            transcription: firstHalfTranscription,
            homeTeam: homeTeamName,
            awayTeam: awayTeamName,
            gameStartMinute: 0,
            gameEndMinute: 90, // Partida completa
          });
          
          totalEventsDetected += result.eventsDetected || 0;
          toast({
            title: "Partida analisada",
            description: `${result.eventsDetected} eventos detectados na partida completa`,
          });
        } catch (error) {
          console.error('Erro na análise da partida completa:', error);
          toast({
            title: "⚠️ Erro na análise",
            description: "Não foi possível analisar a partida",
            variant: "destructive",
          });
        }
      } else {
        // ANÁLISE POR TEMPOS SEPARADOS
        
        // Analyze first half if has transcription
        if (firstHalfTranscription) {
          console.log('Iniciando análise do 1º Tempo...');
          
          try {
            const result = await startAnalysis({
              matchId,
              transcription: firstHalfTranscription,
              homeTeam: homeTeamName,
              awayTeam: awayTeamName,
              gameStartMinute: 0,
              gameEndMinute: 45,
            });
            
            totalEventsDetected += result.eventsDetected || 0;
            toast({
              title: "1º Tempo analisado",
              description: `${result.eventsDetected} eventos detectados`,
            });
          } catch (error) {
            console.error('Erro na análise do 1º tempo:', error);
            toast({
              title: "⚠️ Erro no 1º Tempo",
              description: "Análise parcial - continuando com 2º tempo...",
              variant: "destructive",
            });
          }
        }

        // Analyze second half if has transcription
        if (secondHalfTranscription) {
          console.log('Iniciando análise do 2º Tempo...');
          
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
            toast({
              title: "2º Tempo analisado",
              description: `${result.eventsDetected} eventos detectados`,
            });
          } catch (error) {
            console.error('Erro na análise do 2º tempo:', error);
            toast({
              title: "⚠️ Erro no 2º Tempo",
              description: "Análise parcial concluída",
              variant: "destructive",
            });
          }
        }
      }

      // Success - redirect to events
      toast({
        title: totalEventsDetected > 0 ? "Análise completa!" : "Partida criada",
        description: totalEventsDetected > 0 
          ? `${totalEventsDetected} eventos detectados. Redirecionando...`
          : "Redirecionando para os eventos...",
      });

      setTimeout(() => {
        navigate(`/events?match=${matchId}`);
      }, 1500);

    } catch (error: any) {
      setIsTranscribing(false);
      setTranscriptionProgress('');
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

  // Show analysis progress
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
                  setCurrentStep('match');
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

  const steps = [
    { id: 'match' as const, label: 'Partida', icon: '🏟️' },
    { id: 'videos' as const, label: 'Vídeos', icon: '🎬' },
    { id: 'summary' as const, label: 'Análise', icon: '🚀' },
  ];

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
              {existingMatch 
                ? `Reimportando: ${existingMatch.home_team?.short_name || 'Casa'} vs ${existingMatch.away_team?.short_name || 'Visitante'}`
                : 'Nova Partida para Análise'
              }
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

        {/* Step Indicator */}
        <div className="flex justify-center">
          <div className="flex items-center gap-2 p-1 rounded-lg bg-muted/30 border border-border/50">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => {
                    // If reimporting, skip match step
                    if (step.id === 'match' && !existingMatchId) setCurrentStep('match');
                    if (step.id === 'videos' && (existingMatchId || (matchData.homeTeamId && matchData.awayTeamId))) setCurrentStep('videos');
                    if (step.id === 'summary' && readySegments.length > 0) setCurrentStep('summary');
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md transition-all",
                    currentStep === step.id 
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

        {/* Step Content */}
        <div className="pb-8">
          {/* Step 1: Match Setup */}
          {currentStep === 'match' && (
            <MatchSetupCard
              data={matchData}
              onChange={setMatchData}
              onContinue={() => setCurrentStep('videos')}
            />
          )}

          {/* Step 2: Videos */}
          {currentStep === 'videos' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Back Button - only show if not reimporting */}
              {!existingMatchId && (
                <Button variant="ghost" onClick={() => setCurrentStep('match')} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para Partida
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
              <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as 'file' | 'link')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="file" className="gap-2">
                    <UploadIcon className="h-4 w-4" />
                    Upload de Arquivo
                  </TabsTrigger>
                  <TabsTrigger value="link" className="gap-2">
                    <LinkIcon className="h-4 w-4" />
                    Link/Embed
                  </TabsTrigger>
                </TabsList>

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
    </AppLayout>
  );
}
