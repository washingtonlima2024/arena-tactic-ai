import { useState, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Video, 
  FileVideo, 
  X, 
  CheckCircle2,
  Loader2,
  Zap,
  Brain,
  BarChart3,
  FileText,
  Link as LinkIcon,
  Plus,
  Trash2,
  Clock,
  FolderOpen
} from 'lucide-react';
import { useTeams } from '@/hooks/useTeams';
import { useCreateMatch } from '@/hooks/useMatches';
import { useStartAnalysis, useAnalysisJob } from '@/hooks/useAnalysisJob';
import { AnalysisProgress } from '@/components/analysis/AnalysisProgress';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import soccerBall from '@/assets/soccer-ball.png';

interface VideoLink {
  id: string;
  url: string;
  embedUrl: string;
  type: 'full' | 'first_half' | 'second_half' | 'clip';
  title: string;
  startMinute: number;
  endMinute: number | null;
  durationSeconds: number | null; // Duração real do arquivo de vídeo em segundos
}

interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  url?: string;
}

// Helper to extract embed URL from various formats
const extractEmbedUrl = (input: string): string => {
  // If it's already an embed URL, return as is
  if (input.includes('/embed/')) {
    const match = input.match(/src="([^"]+)"/);
    if (match) return match[1];
    if (input.startsWith('http')) return input;
  }
  
  // If it's an iframe code, extract the src
  const iframeMatch = input.match(/src="([^"]+)"/);
  if (iframeMatch) return iframeMatch[1];
  
  // If it's a plain URL, return as is
  return input;
};

export default function VideoUpload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'file' ? 'file' : 'link';
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtContent, setSrtContent] = useState<string>('');
  const [homeTeamId, setHomeTeamId] = useState<string>('');
  const [awayTeamId, setAwayTeamId] = useState<string>('');
  const [competition, setCompetition] = useState<string>('');
  const [matchDate, setMatchDate] = useState<string>('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'link' | 'file'>(initialMode);
  
  // Video links state
  const [videoLinks, setVideoLinks] = useState<VideoLink[]>([]);
  const [newLinkInput, setNewLinkInput] = useState('');
  const [newLinkType, setNewLinkType] = useState<VideoLink['type']>('full');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newStartMinute, setNewStartMinute] = useState<string>('');
  const [newEndMinute, setNewEndMinute] = useState<string>('');
  const [newDuration, setNewDuration] = useState<string>('');

  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const createMatch = useCreateMatch();
  const { startAnalysis, isLoading: isStartingAnalysis } = useStartAnalysis();
  const analysisJob = useAnalysisJob(currentJobId);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const uploadFile = async (file: File) => {
    const newFile: UploadedFile = {
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: 'uploading'
    };

    setFiles(prev => [...prev, newFile]);

    try {
      const sanitizedName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${Date.now()}-${sanitizedName}`;
      
      const progressInterval = setInterval(() => {
        setFiles(prev => 
          prev.map(f => 
            f.name === file.name && f.status === 'uploading'
              ? { ...f, progress: Math.min(f.progress + 20, 90) }
              : f
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

      setFiles(prev => 
        prev.map(f => 
          f.name === file.name 
            ? { ...f, progress: 100, status: 'complete', url: urlData.publicUrl }
            : f
        )
      );

      toast({
        title: "Upload concluído",
        description: `${file.name} foi enviado com sucesso.`
      });

    } catch (error: any) {
      console.error('Upload error:', error);
      setFiles(prev => 
        prev.map(f => 
          f.name === file.name 
            ? { ...f, status: 'error' }
            : f
        )
      );
      toast({
        title: "Erro no upload",
        description: error.message,
        variant: "destructive"
      });
    }
  };

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

    droppedFiles.forEach(uploadFile);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(uploadFile);
    }
  };

  const handleSrtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSrtFile(file);
      
      const text = await file.text();
      setSrtContent(text);
      
      toast({
        title: "Arquivo SRT carregado",
        description: file.name
      });
    }
  };

  const removeFile = (fileName: string) => {
    setFiles(prev => prev.filter(f => f.name !== fileName));
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
    
    // Usar valores dos inputs ou defaults baseados no tipo
    const defaultStartMinute = newLinkType === 'second_half' ? 45 : 0;
    const defaultEndMinute = newLinkType === 'first_half' ? 45 : newLinkType === 'second_half' ? 90 : 90;
    
    const startMinute = newStartMinute ? parseInt(newStartMinute) : defaultStartMinute;
    const endMinute = newEndMinute ? parseInt(newEndMinute) : defaultEndMinute;
    const durationSeconds = newDuration ? parseInt(newDuration) : null;
    
    const typeLabels = {
      full: 'Partida Completa',
      first_half: '1º Tempo',
      second_half: '2º Tempo',
      clip: 'Trecho'
    };

    const newLink: VideoLink = {
      id: crypto.randomUUID(),
      url: newLinkInput,
      embedUrl,
      type: newLinkType,
      title: newLinkTitle || typeLabels[newLinkType],
      startMinute,
      endMinute,
      durationSeconds
    };

    setVideoLinks(prev => [...prev, newLink]);
    setNewLinkInput('');
    setNewLinkTitle('');
    setNewStartMinute('');
    setNewEndMinute('');
    setNewDuration('');
    
    toast({
      title: "Vídeo adicionado",
      description: `${newLink.title} foi adicionado à lista. Sincronização: ${startMinute}'-${endMinute}'`
    });
  };

  const removeVideoLink = (id: string) => {
    setVideoLinks(prev => prev.filter(link => link.id !== id));
  };

  const handleStartAnalysis = async () => {
    if (!homeTeamId || !awayTeamId) {
      toast({
        title: "Selecione os times",
        description: "É necessário selecionar os dois times para iniciar a análise.",
        variant: "destructive"
      });
      return;
    }

    if (homeTeamId === awayTeamId) {
      toast({
        title: "Times inválidos",
        description: "O time da casa e visitante devem ser diferentes.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Create match
      const match = await createMatch.mutateAsync({
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        competition: competition || undefined,
        match_date: matchDate ? new Date(matchDate).toISOString() : undefined,
      });

      // Register video links in database
      if (videoLinks.length > 0) {
        for (const link of videoLinks) {
          const { error: videoError } = await supabase.from('videos').insert({
            match_id: match.id,
            file_url: link.embedUrl,
            file_name: link.title,
            video_type: link.type,
            start_minute: link.startMinute,
            end_minute: link.endMinute,
            duration_seconds: link.durationSeconds,
            status: 'pending'
          });

          if (videoError) {
            console.error('Error registering video:', videoError);
          }
        }
        
        toast({
          title: "Vídeos registrados",
          description: `${videoLinks.length} vídeo(s) vinculado(s) à partida.`
        });
      }

      // Register uploaded files
      const uploadedFile = files.find(f => f.status === 'complete');
      if (uploadedFile?.url) {
        await supabase.from('videos').insert({
          match_id: match.id,
          file_url: uploadedFile.url,
          file_name: uploadedFile.name,
          video_type: 'full',
          start_minute: 0,
          end_minute: null,
          status: 'pending'
        });
      }

      // Get primary video URL for analysis
      const primaryVideoUrl = videoLinks[0]?.embedUrl || uploadedFile?.url || '';

      // Start analysis
      const result = await startAnalysis({
        matchId: match.id,
        videoUrl: primaryVideoUrl,
        homeTeamId,
        awayTeamId,
        competition,
        srtContent: srtContent || undefined,
      });

      setCurrentJobId(result.jobId);

    } catch (error: any) {
      console.error('Error starting analysis:', error);
      toast({
        title: "Erro ao iniciar análise",
        description: error.message || "Ocorreu um erro ao iniciar a análise.",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(2) + ' KB';
  };

  // Video is optional when using embed links - analysis can be done from embed
  const hasVideos = videoLinks.length > 0 || files.some(f => f.status === 'complete');
  const hasEmbed = videoLinks.length > 0;
  const isAnalyzing = !!currentJobId && analysisJob?.status === 'processing';
  const analysisCompleted = analysisJob?.status === 'completed';

  // Show analysis progress if job is active
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
                  setFiles([]);
                  setVideoLinks([]);
                  setHomeTeamId('');
                  setAwayTeamId('');
                  setCompetition('');
                  setMatchDate('');
                  setSrtFile(null);
                  setSrtContent('');
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

  // Landing-style hero section for Upload
  const HeroSection = () => (
    <div className="relative mb-6">
      {/* Background Grid Effect */}
      <div className="absolute inset-0 tactical-grid opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      
      {/* Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 blur-[100px] rounded-full" />

      {/* Title with Soccer Ball */}
      <div className="relative text-center mb-6 pt-4">
        <h1 className="text-5xl md:text-6xl lg:text-7xl neon-text-blue flex items-center justify-center gap-1">
          <span className="text-6xl md:text-7xl lg:text-8xl">A</span>rena Visi
          <img src={soccerBall} alt="" className="h-12 w-12 md:h-14 md:w-14 lg:h-16 lg:w-16 inline-block animate-spin-slow" />
          n
        </h1>
        <p className="text-muted-foreground mt-2">
          Análise Inteligente de Futebol
        </p>
      </div>

      {/* Gallery Button */}
      <div className="relative flex justify-center mb-6">
        <Button 
          asChild 
          variant="outline" 
          size="sm" 
          className="gap-2 border-border/50 hover:border-primary/50 hover:bg-primary/5"
        >
          <Link to="/matches">
            <FolderOpen className="h-4 w-4" />
            Ver Galeria de Partidas
          </Link>
        </Button>
      </div>

      {/* Upload Mode Tabs - Visual Only */}
      <div className="relative flex justify-center mb-6">
        <div className="flex rounded-lg overflow-hidden border border-border/50 max-w-md w-full">
          <button
            onClick={() => setUploadMode('file')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 transition-colors ${
              uploadMode === 'file' 
                ? 'bg-secondary/50 text-foreground' 
                : 'bg-transparent text-muted-foreground hover:bg-secondary/30 hover:text-foreground'
            }`}
          >
            <UploadIcon className="h-4 w-4" />
            Upload de Arquivo
          </button>
          <button
            onClick={() => setUploadMode('link')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 transition-colors ${
              uploadMode === 'link' 
                ? 'bg-secondary/50 text-foreground' 
                : 'bg-transparent text-muted-foreground hover:bg-secondary/30 hover:text-foreground'
            }`}
          >
            <LinkIcon className="h-4 w-4" />
            Link + Legenda
          </button>
        </div>
      </div>

      {/* Upload Icon Circle */}
      <div className="relative flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 arena-glow">
          <UploadIcon className="h-8 w-8 text-primary" />
        </div>
        
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Enviar Vídeo para Análise
        </h2>
        <p className="text-muted-foreground text-sm max-w-md mb-4">
          Faça upload de um vídeo de futebol para análise tática em tempo real com IA. 
          Formatos suportados: MP4, WebM, MOV, MKV, AVI (até 500MB - compressão automática para 80MB)
        </p>
      </div>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
      `}</style>
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Landing-style Hero */}
        <HeroSection />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Upload Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Mode Tabs */}
            <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as 'link' | 'file')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="link" className="gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Link/Embed
                </TabsTrigger>
                <TabsTrigger value="file" className="gap-2">
                  <UploadIcon className="h-4 w-4" />
                  Upload de Arquivo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="link" className="space-y-4 mt-4">
                {/* Add Video Link */}
                <Card variant="glass">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LinkIcon className="h-5 w-5" />
                      Adicionar Vídeo por Link
                    </CardTitle>
                    <CardDescription>
                      Cole o link do vídeo ou código de embed (iframe)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Link ou Código Embed</Label>
                      <Textarea
                        placeholder='Cole o link do vídeo ou o código embed (ex: <iframe src="...")'
                        value={newLinkInput}
                        onChange={(e) => setNewLinkInput(e.target.value)}
                        rows={3}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tipo do Vídeo</Label>
                        <Select value={newLinkType} onValueChange={(v) => setNewLinkType(v as VideoLink['type'])}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="full">Partida Completa</SelectItem>
                            <SelectItem value="first_half">1º Tempo</SelectItem>
                            <SelectItem value="second_half">2º Tempo</SelectItem>
                            <SelectItem value="clip">Trecho/Clip</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Título (opcional)</Label>
                        <Input
                          placeholder="Ex: Gol do Neymar"
                          value={newLinkTitle}
                          onChange={(e) => setNewLinkTitle(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Sincronização de Tempo - Seção Expandida */}
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        Sincronização de Tempo (Importante para cortes)
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Configure o alinhamento entre o tempo do jogo e o tempo do vídeo. 
                        Ex: Se o vídeo é do 2º tempo, o minuto inicial seria 45.
                      </p>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Minuto Inicial (Jogo)</Label>
                          <Input
                            type="number"
                            placeholder={newLinkType === 'second_half' ? '45' : '0'}
                            min={0}
                            max={120}
                            value={newStartMinute}
                            onChange={(e) => setNewStartMinute(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">Em que minuto do jogo o vídeo começa</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Minuto Final (Jogo)</Label>
                          <Input
                            type="number"
                            placeholder={newLinkType === 'first_half' ? '45' : newLinkType === 'second_half' ? '90' : '90'}
                            min={0}
                            max={120}
                            value={newEndMinute}
                            onChange={(e) => setNewEndMinute(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">Em que minuto do jogo o vídeo termina</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Duração do Vídeo (seg)</Label>
                          <Input
                            type="number"
                            placeholder="Opcional"
                            min={0}
                            value={newDuration}
                            onChange={(e) => setNewDuration(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">Deixe vazio para usar cálculo padrão</p>
                        </div>
                      </div>
                    </div>
                    
                    <Button variant="arena" onClick={addVideoLink} className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Vídeo
                    </Button>
                  </CardContent>
                </Card>

                {/* Video Links List */}
                {videoLinks.length > 0 && (
                  <Card variant="glass">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Video className="h-5 w-5" />
                        Vídeos Adicionados ({videoLinks.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {videoLinks.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Video className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium">{link.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {link.embedUrl}
                            </p>
                          </div>
                          <Badge variant={
                            link.type === 'full' ? 'arena' :
                            link.type === 'first_half' ? 'outline' :
                            link.type === 'second_half' ? 'secondary' : 'warning'
                          }>
                            {link.type === 'full' ? 'Completo' :
                             link.type === 'first_half' ? '1º Tempo' :
                             link.type === 'second_half' ? '2º Tempo' : 'Trecho'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeVideoLink(link.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="file" className="space-y-4 mt-4">
                {/* Dropzone */}
                <Card variant="glass">
                  <CardContent className="pt-6">
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`
                        relative flex min-h-[200px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all
                        ${isDragging 
                          ? 'border-primary bg-primary/5 scale-[1.02]' 
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }
                      `}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
                        <UploadIcon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-display text-lg font-semibold">
                        Arraste e solte seus vídeos aqui
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        ou clique para selecionar arquivos
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        MP4, MOV, AVI até 10GB
                      </p>
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

                {/* Uploaded Files */}
                {files.length > 0 && (
                  <Card variant="glass">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileVideo className="h-5 w-5" />
                        Arquivos ({files.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {files.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Video className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(file.size)}
                            </p>
                            {file.status === 'uploading' && (
                              <Progress value={file.progress} className="mt-2 h-1" />
                            )}
                          </div>
                          {file.status === 'complete' && (
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          )}
                          {file.status === 'uploading' && (
                            <span className="text-sm text-primary">
                              {Math.round(file.progress)}%
                            </span>
                          )}
                          {file.status === 'error' && (
                            <Badge variant="destructive">Erro</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeFile(file.name)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>

            {/* SRT File Upload */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Arquivo de Legendas (SRT)
                </CardTitle>
                <CardDescription>
                  Opcional: Importe um arquivo SRT ou deixe em branco para extração automática do áudio
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept=".srt,.vtt"
                      onChange={handleSrtUpload}
                      className="cursor-pointer"
                    />
                  </div>
                  {srtFile && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {srtFile.name}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setSrtFile(null);
                          setSrtContent('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Formatos aceitos: .srt, .vtt • Sem arquivo? O sistema extrairá o áudio automaticamente
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Settings Panel */}
          <div className="space-y-6">
            <Card variant="glow">
              <CardHeader>
                <CardTitle>Configurações da Análise</CardTitle>
                <CardDescription>
                  Configure os parâmetros para a análise da partida
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Time da Casa *</Label>
                  <Select 
                    disabled={teamsLoading} 
                    value={homeTeamId} 
                    onValueChange={setHomeTeamId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={teamsLoading ? "Carregando..." : "Selecione o time"} />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map(team => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Time Visitante *</Label>
                  <Select 
                    disabled={teamsLoading}
                    value={awayTeamId}
                    onValueChange={setAwayTeamId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={teamsLoading ? "Carregando..." : "Selecione o time"} />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map(team => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Competição</Label>
                  <Input 
                    placeholder="Ex: La Liga, Champions League" 
                    value={competition}
                    onChange={(e) => setCompetition(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Data da Partida</Label>
                  <Input 
                    type="date" 
                    value={matchDate}
                    onChange={(e) => setMatchDate(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Analysis Options */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle>Opções de Análise</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Detecção de Eventos</p>
                    <p className="text-xs text-muted-foreground">Gols, faltas, cartões</p>
                  </div>
                  <Badge variant="success">Incluído</Badge>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Brain className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Análise Tática</p>
                    <p className="text-xs text-muted-foreground">Padrões e insights</p>
                  </div>
                  <Badge variant="success">Incluído</Badge>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <BarChart3 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Métricas Avançadas</p>
                    <p className="text-xs text-muted-foreground">xG, pressão, transições</p>
                  </div>
                  <Badge variant="success">Incluído</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Start Button */}
            <Button 
              variant="arena" 
              size="xl" 
              className="w-full"
              disabled={!hasVideos || isAnalyzing || isStartingAnalysis || !homeTeamId || !awayTeamId}
              onClick={handleStartAnalysis}
            >
              {isStartingAnalysis ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-5 w-5" />
                  Iniciar Análise
                </>
              )}
            </Button>

            {!hasVideos && (
              <p className="text-center text-sm text-muted-foreground">
                Adicione pelo menos um vídeo ou link embed para iniciar a análise.
              </p>
            )}

            {hasEmbed && !srtFile && (
              <p className="text-center text-xs text-muted-foreground">
                💡 Sem arquivo SRT? O sistema irá extrair o áudio automaticamente.
              </p>
            )}

            {teams.length === 0 && !teamsLoading && (
              <p className="text-center text-sm text-muted-foreground">
                Cadastre times em Configurações antes de iniciar uma análise.
              </p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
