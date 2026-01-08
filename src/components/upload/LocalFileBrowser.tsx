import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { apiClient, isLocalServerAvailable, VideoInfo } from '@/lib/apiClient';
import { Folder, FileVideo, ArrowLeft, HardDrive, Loader2, CheckCircle2, Monitor, Film, Clock, HardDrive as StorageIcon, Gauge, AlertTriangle, Zap, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LocalFileBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFile: (file: { path: string; name: string; size_mb: number; conversion_job_id?: string }) => void;
  matchId: string;
}

interface DirectoryEntry {
  name: string;
  path: string;
  type: 'directory' | 'video';
  size?: number;
  size_mb?: number;
}

interface ConversionStatus {
  job_id: string;
  status: 'pending' | 'converting' | 'completed' | 'error';
  progress: number;
  output_url?: string;
  savings_percent?: number;
  error?: string;
}

export function LocalFileBrowser({ open, onOpenChange, onSelectFile, matchId }: LocalFileBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [files, setFiles] = useState<DirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<DirectoryEntry | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(true);
  
  // Video info state
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  
  // Conversion state
  const [convertTo480p, setConvertTo480p] = useState(false);
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus | null>(null);
  const [isPollingConversion, setIsPollingConversion] = useState(false);

  // Check server availability
  useEffect(() => {
    if (open) {
      isLocalServerAvailable().then(setServerAvailable);
    }
  }, [open]);

  // Load initial directory
  useEffect(() => {
    if (open && serverAvailable) {
      loadDirectory();
    }
  }, [open, serverAvailable]);

  // Load video info when file is selected
  useEffect(() => {
    if (selectedFile) {
      loadVideoInfo(selectedFile.path);
      setConvertTo480p(false); // Reset conversion checkbox
      setConversionStatus(null);
    } else {
      setVideoInfo(null);
      setConvertTo480p(false);
      setConversionStatus(null);
    }
  }, [selectedFile]);

  // Auto-enable conversion for high-res videos
  useEffect(() => {
    if (videoInfo?.needs_conversion) {
      setConvertTo480p(true);
    }
  }, [videoInfo]);

  // Poll conversion status
  const pollConversionStatus = useCallback(async (jobId: string) => {
    setIsPollingConversion(true);
    try {
      const status = await apiClient.getConversionStatus(jobId);
      setConversionStatus(status);
      
      if (status.status === 'pending' || status.status === 'converting') {
        // Continue polling
        setTimeout(() => pollConversionStatus(jobId), 1000);
      } else {
        setIsPollingConversion(false);
      }
    } catch (err) {
      console.error('Failed to get conversion status:', err);
      setIsPollingConversion(false);
    }
  }, []);

  const loadDirectory = async (path?: string) => {
    setIsLoading(true);
    setError(null);
    setSelectedFile(null);
    setVideoInfo(null);
    setConversionStatus(null);
    
    try {
      const result = await apiClient.browseLocalDirectory(path);
      setCurrentPath(result.current_path);
      setParentPath(result.parent_path);
      setDirectories(result.directories);
      setFiles(result.files);
      setPathInput(result.current_path);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar diretório');
    } finally {
      setIsLoading(false);
    }
  };

  const loadVideoInfo = async (path: string) => {
    setIsLoadingInfo(true);
    try {
      const info = await apiClient.getVideoInfo(path);
      setVideoInfo(info);
    } catch (err: any) {
      console.error('Failed to load video info:', err);
      setVideoInfo(null);
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const handleNavigate = (path: string) => {
    loadDirectory(path);
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      loadDirectory(pathInput.trim());
    }
  };

  const handleSelectAndLink = async () => {
    if (!selectedFile) return;
    
    setIsLinking(true);
    try {
      if (convertTo480p) {
        // Use the new method with conversion
        const result = await apiClient.linkLocalFileWithConversion({
          local_path: selectedFile.path,
          match_id: matchId,
          subfolder: 'videos',
          video_type: 'full',
          convert_to_480p: true
        });
        
        if (result.conversion_job_id) {
          // Start polling for conversion status
          pollConversionStatus(result.conversion_job_id);
        }
        
        onSelectFile({
          path: selectedFile.path,
          name: selectedFile.name,
          size_mb: videoInfo?.size_mb || selectedFile.size_mb || 0,
          conversion_job_id: result.conversion_job_id
        });
      } else {
        // Regular linking without conversion
        onSelectFile({
          path: selectedFile.path,
          name: selectedFile.name,
          size_mb: videoInfo?.size_mb || selectedFile.size_mb || 0
        });
      }
      onOpenChange(false);
    } finally {
      setIsLinking(false);
    }
  };

  if (!serverAvailable) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              Servidor Local Indisponível
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O navegador de arquivos locais requer o servidor Python rodando em <code className="bg-muted px-1 rounded">localhost:5000</code>.
            </p>
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium mb-1">Para iniciar o servidor:</p>
              <code className="text-xs bg-background px-2 py-1 rounded block">
                cd video-processor && python server.py
              </code>
            </div>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Usar Upload Tradicional
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Selecionar Vídeo Local
          </DialogTitle>
        </DialogHeader>

        {/* Path input */}
        <form onSubmit={handlePathSubmit} className="flex gap-2">
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="Caminho do diretório..."
            className="flex-1 font-mono text-sm"
          />
          <Button type="submit" size="sm" variant="secondary">
            Ir
          </Button>
        </form>

        {/* Navigation breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {parentPath && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleNavigate(parentPath)}
              className="h-7 px-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
          )}
          <span className="truncate">{currentPath}</span>
        </div>

        {/* Error state */}
        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-[250px] border rounded-md">
            <div className="p-2 space-y-1">
              {/* Directories */}
              {directories.map((dir) => (
                <button
                  key={dir.path}
                  onClick={() => handleNavigate(dir.path)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-left transition-colors"
                >
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{dir.name}</span>
                </button>
              ))}

              {/* Video files */}
              {files.map((file) => (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left transition-colors",
                    selectedFile?.path === file.path
                      ? "bg-primary/10 ring-1 ring-primary"
                      : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileVideo className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {file.size_mb} MB
                  </span>
                </button>
              ))}

              {/* Empty state */}
              {directories.length === 0 && files.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum arquivo de vídeo encontrado neste diretório
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {/* Video info card */}
        {selectedFile && (
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <span className="truncate text-sm font-medium">{selectedFile.name}</span>
            </div>
            
            {isLoadingInfo ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Analisando vídeo...</span>
              </div>
            ) : videoInfo ? (
              <div className="p-3 space-y-3">
                {/* Info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Resolução:</span>
                    <span className="font-medium">{videoInfo.resolution} ({videoInfo.resolution_label})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Film className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Codec:</span>
                    <span className="font-medium">{videoInfo.codec_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Duração:</span>
                    <span className="font-medium">{videoInfo.duration_formatted}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StorageIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Tamanho:</span>
                    <span className="font-medium">{videoInfo.size_formatted}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Bitrate:</span>
                    <span className="font-medium">{videoInfo.bitrate_kbps} kbps</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Film className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">FPS:</span>
                    <span className="font-medium">{videoInfo.fps}</span>
                  </div>
                </div>

                {/* Conversion option */}
                {videoInfo.needs_conversion && (
                  <div className="space-y-2">
                    <div 
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-md border transition-colors cursor-pointer",
                        convertTo480p 
                          ? "bg-primary/10 border-primary" 
                          : "bg-muted/50 border-transparent hover:border-muted-foreground/20"
                      )}
                      onClick={() => setConvertTo480p(!convertTo480p)}
                    >
                      <Checkbox 
                        id="convert480p" 
                        checked={convertTo480p} 
                        onCheckedChange={(checked) => setConvertTo480p(!!checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Converter para 480p</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Economiza ~{Math.round((1 - (videoInfo.estimated_size_480p_mb / videoInfo.size_mb)) * 100)}% de espaço 
                          ({videoInfo.size_formatted} → ~{videoInfo.estimated_size_480p_mb} MB)
                        </p>
                      </div>
                    </div>
                    
                    {/* Conversion progress */}
                    {conversionStatus && (
                      <div className="p-2 rounded-md bg-muted/50 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            {conversionStatus.status === 'converting' && (
                              <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                            )}
                            {conversionStatus.status === 'completed' && (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            )}
                            {conversionStatus.status === 'error' && (
                              <AlertTriangle className="h-3 w-3 text-destructive" />
                            )}
                            <span className="font-medium">
                              {conversionStatus.status === 'pending' && 'Aguardando...'}
                              {conversionStatus.status === 'converting' && 'Convertendo...'}
                              {conversionStatus.status === 'completed' && `Concluído! Economia: ${conversionStatus.savings_percent}%`}
                              {conversionStatus.status === 'error' && 'Erro na conversão'}
                            </span>
                          </div>
                          <span className="text-muted-foreground">{conversionStatus.progress}%</span>
                        </div>
                        <Progress value={conversionStatus.progress} className="h-1.5" />
                      </div>
                    )}
                  </div>
                )}

                {/* Local link badge */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <HardDrive className="h-3 w-3" />
                  <span>Link local (sem upload){convertTo480p ? ' + conversão 480p' : ''}</span>
                </div>
              </div>
            ) : (
              <div className="p-3 text-sm text-muted-foreground">
                Não foi possível obter informações do vídeo
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSelectAndLink}
            disabled={!selectedFile || isLinking}
          >
            {isLinking ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Vinculando...
              </>
            ) : (
              'Selecionar'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}