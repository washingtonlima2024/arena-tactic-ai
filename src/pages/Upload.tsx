import { useState, useCallback } from 'react';
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
import { toast } from '@/hooks/use-toast';

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
}

export default function VideoUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const { data: teams = [], isLoading: teamsLoading } = useTeams();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const simulateUpload = (file: File) => {
    const newFile: UploadedFile = {
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: 'uploading'
    };

    setFiles(prev => [...prev, newFile]);

    // Simulate upload progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setFiles(prev => 
          prev.map(f => 
            f.name === file.name 
              ? { ...f, progress: 100, status: 'complete' }
              : f
          )
        );
      } else {
        setFiles(prev => 
          prev.map(f => 
            f.name === file.name 
              ? { ...f, progress }
              : f
          )
        );
      }
    }, 200);
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

    droppedFiles.forEach(simulateUpload);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(simulateUpload);
    }
  };

  const removeFile = (fileName: string) => {
    setFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const startAnalysis = () => {
    setIsAnalyzing(true);
    toast({
      title: "Análise iniciada",
      description: "O processamento do vídeo foi iniciado. Você será notificado quando concluir."
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(2) + ' KB';
  };

  const allFilesComplete = files.length > 0 && files.every(f => f.status === 'complete');

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
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          setSrtFile(e.target.files[0]);
                          toast({
                            title: "Arquivo SRT carregado",
                            description: e.target.files[0].name
                          });
                        }
                      }}
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
                        onClick={() => setSrtFile(null)}
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
                  <Label>Time da Casa</Label>
                  <Select disabled={teamsLoading}>
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
                  <Label>Time Visitante</Label>
                  <Select disabled={teamsLoading}>
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
                  <Input placeholder="Ex: La Liga, Champions League" />
                </div>

                <div className="space-y-2">
                  <Label>Data da Partida</Label>
                  <Input type="date" />
                </div>

                <div className="space-y-2">
                  <Label>Período do Vídeo</Label>
                  <Select defaultValue="full">
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
              disabled={!allFilesComplete || isAnalyzing}
              onClick={startAnalysis}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-5 w-5" />
                  Iniciar Análise
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
