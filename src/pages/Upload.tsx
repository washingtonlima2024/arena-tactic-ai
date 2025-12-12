import { useState, useCallback } from 'react';
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
import { AnalysisProgress } from '@/components/analysis/AnalysisProgress';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import arenaPlayWordmark from '@/assets/arena-play-wordmark.png';
import { MatchSetupCard, MatchSetupData } from '@/components/upload/MatchSetupCard';
import { VideoSegmentCard, VideoSegment, VideoType } from '@/components/upload/VideoSegmentCard';
import { CoverageTimeline } from '@/components/upload/CoverageTimeline';
import { AnalysisSummary } from '@/components/upload/AnalysisSummary';
import { MatchTimesConfig, defaultMatchTimes, MatchTimes } from '@/components/upload/MatchTimesConfig';
import { HalfDropzone, getDefaultVideoType, getDefaultMinutes } from '@/components/upload/HalfDropzone';
import { SubtitlesUpload } from '@/components/upload/SubtitlesUpload';
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
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('match');
  
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
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file');
  
  // Subtitles
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  
  // Link input state
  const [newLinkInput, setNewLinkInput] = useState('');
  const [newLinkType, setNewLinkType] = useState<VideoType>('full');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newStartMinute, setNewStartMinute] = useState('');
  const [newEndMinute, setNewEndMinute] = useState('');
  const [newDuration, setNewDuration] = useState('');

  // Analysis state
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  
  const { data: teams = [] } = useTeams();
  const createMatch = useCreateMatch();
  const { startAnalysis, isLoading: isStartingAnalysis } = useStartAnalysis();
  const analysisJob = useAnalysisJob(currentJobId);

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

  const uploadFile = async (file: File, half?: 'first' | 'second') => {
    const segmentId = crypto.randomUUID();
    const suggestedType = half ? getDefaultVideoType(half) : suggestVideoType(file.name);
    const defaultMins = half ? getDefaultMinutes(half) : {
      full: { start: 0, end: 90 },
      first_half: { start: 0, end: 45 },
      second_half: { start: 45, end: 90 },
      clip: { start: 0, end: 10 },
    }[suggestedType];

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
    };

    setSegments(prev => [...prev, newSegment]);

    try {
      // Detect duration
      const detectedDuration = await detectVideoDuration(file);
      
      const sanitizedName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${Date.now()}-${sanitizedName}`;
      
      const progressInterval = setInterval(() => {
        setSegments(prev => 
          prev.map(s => 
            s.id === segmentId && s.status === 'uploading'
              ? { ...s, progress: Math.min(s.progress + 15, 90) }
              : s
          )
        );
      }, 300);

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
            ? { 
                ...s, 
                progress: 100, 
                status: 'complete', 
                url: urlData.publicUrl,
                durationSeconds: detectedDuration || null,
              }
            : s
        )
      );

      const durationStr = detectedDuration ? ` (${Math.floor(detectedDuration / 60)}:${String(detectedDuration % 60).padStart(2, '0')})` : '';
      toast({
        title: "Upload concluído",
        description: `${file.name}${durationStr}`
      });

    } catch (error: any) {
      setSegments(prev => 
        prev.map(s => 
          s.id === segmentId ? { ...s, status: 'error' } : s
        )
      );
      toast({
        title: "Erro no upload",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // Handle files dropped on half dropzones
  const handleHalfDrop = useCallback((files: File[], half: 'first' | 'second') => {
    const videoFiles = files.filter(file => file.type.startsWith('video/'));
    if (videoFiles.length === 0) {
      toast({
        title: "Formato inválido",
        description: "Por favor, envie apenas arquivos de vídeo.",
        variant: "destructive"
      });
      return;
    }
    videoFiles.forEach(file => uploadFile(file, half));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
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
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => uploadFile(file));
    }
  };

  const addVideoLink = () => {
    if (!newLinkInput.trim()) {
      toast({
        title: "Link obrigatório",
        description: "Insira um link ou código de embed do vídeo.",
        variant: "destructive"
      });
      return;
    }

    const embedUrl = extractEmbedUrl(newLinkInput);
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
      name: embedUrl.slice(0, 50) + '...',
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
      title: "Vídeo adicionado",
      description: `${newSegment.title} (${startMinute}'-${endMinute}')`
    });
  };

  const updateSegment = (updated: VideoSegment) => {
    setSegments(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  const removeSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  const handleStartAnalysis = async () => {
    try {
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

      // Register all video segments
      for (const segment of segments) {
        if (segment.status === 'complete' || segment.status === 'ready') {
          await supabase.from('videos').insert({
            match_id: match.id,
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

      // Get primary video for analysis (first complete segment)
      const primarySegment = segments.find(s => s.status === 'complete' || s.status === 'ready');
      
      if (primarySegment) {
        let durationSeconds = primarySegment.durationSeconds;
        if (!durationSeconds && primarySegment.endMinute) {
          durationSeconds = (primarySegment.endMinute - primarySegment.startMinute) * 60;
        }

        const result = await startAnalysis({
          matchId: match.id,
          videoUrl: primarySegment.url || '',
          homeTeamId: matchData.homeTeamId,
          awayTeamId: matchData.awayTeamId,
          competition: matchData.competition,
          startMinute: primarySegment.startMinute,
          endMinute: primarySegment.endMinute || 90,
          durationSeconds: durationSeconds || 0,
        });

        setCurrentJobId(result.jobId);
      }

    } catch (error: any) {
      toast({
        title: "Erro ao iniciar análise",
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
              Nova Partida para Análise
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
                    if (step.id === 'match') setCurrentStep('match');
                    if (step.id === 'videos' && matchData.homeTeamId && matchData.awayTeamId) setCurrentStep('videos');
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
              {/* Back Button */}
              <Button variant="ghost" onClick={() => setCurrentStep('match')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar para Partida
              </Button>

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
                      onFileDrop={handleHalfDrop}
                    />
                    <HalfDropzone 
                      half="second" 
                      videoCount={secondHalfCount}
                      onFileDrop={handleHalfDrop}
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

                  {/* Subtitles Upload */}
                  <SubtitlesUpload file={subtitleFile} onFileChange={setSubtitleFile} />
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
                      
                      <Button variant="arena" onClick={addVideoLink} className="w-full">
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar Vídeo
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

              {/* Continue Button */}
              <div className="flex justify-end">
                <Button 
                  onClick={() => setCurrentStep('summary')}
                  disabled={readySegments.length === 0}
                  size="lg"
                  variant="arena"
                  className="gap-2"
                >
                  <Zap className="h-5 w-5" />
                  Continuar para Análise
                </Button>
              </div>
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
