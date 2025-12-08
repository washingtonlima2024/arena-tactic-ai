import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  FileText
} from 'lucide-react';
import { useTeams } from '@/hooks/useTeams';
import { useCreateMatch } from '@/hooks/useMatches';
import { useStartAnalysis, useAnalysisJob } from '@/hooks/useAnalysisJob';
import { AnalysisProgress } from '@/components/analysis/AnalysisProgress';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  url?: string;
}

export default function VideoUpload() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtContent, setSrtContent] = useState<string>('');
  const [homeTeamId, setHomeTeamId] = useState<string>('');
  const [awayTeamId, setAwayTeamId] = useState<string>('');
  const [competition, setCompetition] = useState<string>('');
  const [matchDate, setMatchDate] = useState<string>('');
  const [videoPeriod, setVideoPeriod] = useState<string>('full');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

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
      // Sanitize filename: remove accents and special characters
      const sanitizedName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-zA-Z0-9._-]/g, '_'); // Replace special chars with underscore
      const fileName = `${Date.now()}-${sanitizedName}`;
      
      // Simulate progress
      const progressInterval = setInterval(() => {
        setFiles(prev => 
          prev.map(f => 
            f.name === file.name && f.status === 'uploading'
              ? { ...f, progress: Math.min(f.progress + 20, 90) }
              : f
          )
        );
      }, 300);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('match-videos')
        .upload(fileName, file);

      clearInterval(progressInterval);

      if (error) throw error;

      // Get public URL
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
      
      // Read SRT content
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

    // Get video URL from first uploaded file
    const uploadedFile = files.find(f => f.status === 'complete');
    const videoUrl = uploadedFile?.url || '';

    try {
      // Create match
      const match = await createMatch.mutateAsync({
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        competition: competition || undefined,
        match_date: matchDate ? new Date(matchDate).toISOString() : undefined,
      });

      // Register video in database - ALWAYS register if there's a URL
      if (videoUrl) {
        const videoType = videoPeriod === 'full' ? 'full' : videoPeriod === '1st' ? 'first_half' : videoPeriod === '2nd' ? 'second_half' : 'clip';
        const { error: videoError } = await supabase.from('videos').insert({
          match_id: match.id,
          file_url: videoUrl,
          file_name: uploadedFile?.name || 'video',
          video_type: videoType,
          start_minute: videoPeriod === '2nd' ? 45 : 0,
          end_minute: videoPeriod === '1st' ? 45 : videoPeriod === '2nd' ? 90 : null,
          status: 'uploaded'
        });

        if (videoError) {
          console.error('Error registering video:', videoError);
          toast({
            title: "Erro ao registrar vídeo",
            description: videoError.message,
            variant: "destructive"
          });
        } else {
          toast({
            title: "Vídeo registrado",
            description: "O vídeo foi vinculado à partida com sucesso."
          });
        }
      } else {
        toast({
          title: "Análise sem vídeo",
          description: "A análise será iniciada sem vídeo vinculado. Você pode adicionar o vídeo depois.",
        });
      }

      // Start analysis
      const result = await startAnalysis({
        matchId: match.id,
        videoUrl,
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

  const allFilesComplete = files.length > 0 && files.every(f => f.status === 'complete');
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

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-display text-3xl font-bold">Importar Vídeo</h1>
          <p className="text-muted-foreground">
            Faça upload de vídeos de partidas para análise automática
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Upload Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Dropzone */}
            <Card variant="glass">
              <CardContent className="pt-6">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`
                    relative flex min-h-[300px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all
                    ${isDragging 
                      ? 'border-primary bg-primary/5 scale-[1.02]' 
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }
                  `}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
                    <UploadIcon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-display text-xl font-semibold">
                    Arraste e solte seus vídeos aqui
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
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

            {/* SRT File Upload */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Arquivo de Legendas (SRT)
                </CardTitle>
                <CardDescription>
                  Importe um arquivo SRT com a narração ou legendas da partida
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
                  Formatos aceitos: .srt, .vtt
                </p>
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

                <div className="space-y-2">
                  <Label>Período do Vídeo</Label>
                  <Select value={videoPeriod} onValueChange={setVideoPeriod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Partida Completa</SelectItem>
                      <SelectItem value="1st">Primeiro Tempo</SelectItem>
                      <SelectItem value="2nd">Segundo Tempo</SelectItem>
                      <SelectItem value="clip">Trecho</SelectItem>
                    </SelectContent>
                  </Select>
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
              disabled={!allFilesComplete || isAnalyzing || isStartingAnalysis || !homeTeamId || !awayTeamId}
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
