import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { apiClient } from '@/lib/apiClient';
import {
  Copy,
  Check,
  Terminal,
  RefreshCw,
  Folder,
  Server,
  Download,
  Loader2,
  Link,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface TransferCommands {
  match_id: string;
  destination_path: string;
  hostname: string;
  ip: string;
  commands: {
    scp: {
      description: string;
      single_file: string;
      multiple_files: string;
      folder: string;
    };
    rsync: {
      description: string;
      single_file: string;
      folder: string;
    };
    windows_network: {
      description: string;
      copy: string;
      xcopy: string;
    };
    curl: {
      description: string;
      command: string;
    };
    powershell: {
      description: string;
      command: string;
    };
  };
  sync_after: string;
  notes: string[];
}

interface TransferCommandsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  onSyncComplete?: () => void;
}

export function TransferCommandsDialog({
  open,
  onOpenChange,
  matchId,
  onSyncComplete,
}: TransferCommandsDialogProps) {
  const [commands, setCommands] = useState<TransferCommands | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [sourceFilePath, setSourceFilePath] = useState('/caminho/do/video.mp4');

  // URL Download state
  const [videoUrl, setVideoUrl] = useState('');
  const [videoType, setVideoType] = useState('full');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadJobId, setDownloadJobId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [bytesDownloaded, setBytesDownloaded] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'completed' | 'failed'>('idle');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch commands when dialog opens
  useEffect(() => {
    if (open && matchId) {
      fetchCommands();
    }
    
    // Cleanup polling on close
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [open, matchId]);

  const fetchCommands = async () => {
    setIsLoading(true);
    try {
      const result = await apiClient.getTransferCommands(matchId);
      setCommands(result);
    } catch (error: any) {
      toast.error('Erro ao gerar comandos', {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (command: string, label: string) => {
    // Replace placeholder with actual source path
    const finalCommand = command.replace('/caminho/do/video.mp4', sourceFilePath)
                                 .replace('/caminho/*.mp4', sourceFilePath)
                                 .replace('/caminho/pasta/', sourceFilePath)
                                 .replace('C:\\caminho\\video.mp4', sourceFilePath)
                                 .replace('C:\\caminho\\*.mp4', sourceFilePath);
    
    navigator.clipboard.writeText(finalCommand);
    setCopiedCommand(label);
    toast.success('Comando copiado!');
    
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await apiClient.syncVideos(matchId);
      if (result.synced > 0) {
        toast.success(`${result.synced} vídeo(s) sincronizado(s)!`);
        onSyncComplete?.();
      } else {
        toast.info('Nenhum novo vídeo encontrado no storage');
      }
    } catch (error: any) {
      toast.error('Erro ao sincronizar', {
        description: error.message,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Format bytes helper
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Poll download status
  const pollDownloadStatus = useCallback(async (jobId: string) => {
    try {
      const status = await apiClient.getDownloadStatus(jobId);
      setDownloadProgress(status.progress);
      setBytesDownloaded(status.bytes_downloaded);
      setTotalBytes(status.total_bytes);

      if (status.status === 'completed') {
        setDownloadStatus('completed');
        setIsDownloading(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        toast.success('Download concluído!', {
          description: `Vídeo ${status.filename} baixado com sucesso`,
        });
        onSyncComplete?.();
        // Reset form after success
        setTimeout(() => {
          setVideoUrl('');
          setDownloadJobId(null);
          setDownloadProgress(0);
          setBytesDownloaded(0);
          setTotalBytes(null);
          setDownloadStatus('idle');
        }, 3000);
      } else if (status.status === 'failed') {
        setDownloadStatus('failed');
        setDownloadError(status.error || 'Erro desconhecido');
        setIsDownloading(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        toast.error('Falha no download', {
          description: status.error,
        });
      }
    } catch (error: any) {
      console.error('Error polling status:', error);
    }
  }, [onSyncComplete]);

  // Start URL download
  const handleDownloadFromUrl = async () => {
    if (!videoUrl.trim()) {
      toast.error('URL é obrigatória');
      return;
    }

    setIsDownloading(true);
    setDownloadStatus('downloading');
    setDownloadProgress(0);
    setBytesDownloaded(0);
    setTotalBytes(null);
    setDownloadError(null);

    try {
      const result = await apiClient.downloadVideoFromUrl(matchId, videoUrl, videoType);
      setDownloadJobId(result.job_id);
      toast.info('Download iniciado', {
        description: `Baixando ${result.filename}...`,
      });

      // Start polling for status
      pollIntervalRef.current = setInterval(() => {
        pollDownloadStatus(result.job_id);
      }, 2000);
    } catch (error: any) {
      setIsDownloading(false);
      setDownloadStatus('failed');
      setDownloadError(error.message);
      toast.error('Erro ao iniciar download', {
        description: error.message,
      });
    }
  };

  const CopyButton = ({ command, label }: { command: string; label: string }) => (
    <Button
      variant="outline"
      size="sm"
      onClick={() => copyToClipboard(command, label)}
      className="gap-2"
    >
      {copiedCommand === label ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      Copiar
    </Button>
  );

  const CommandBlock = ({
    command,
    label,
    description,
  }: {
    command: string;
    label: string;
    description?: string;
  }) => (
    <div className="space-y-2">
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      <div className="flex items-start gap-2">
        <code className="flex-1 bg-muted p-3 rounded-md text-sm break-all font-mono">
          {command
            .replace('/caminho/do/video.mp4', sourceFilePath)
            .replace('C:\\caminho\\video.mp4', sourceFilePath)}
        </code>
        <CopyButton command={command} label={label} />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Transferência Direta de Vídeo
          </DialogTitle>
          <DialogDescription>
            Copie o comando e execute no terminal da máquina onde o vídeo está armazenado.
            Ideal para arquivos grandes que excedem o limite de upload do navegador.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : commands ? (
          <div className="space-y-6">
            {/* Server Info */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Servidor de Destino
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Hostname:</span>{' '}
                    <Badge variant="outline">{commands.hostname}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IP:</span>{' '}
                    <Badge variant="outline">{commands.ip}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <code className="bg-muted px-2 py-1 rounded text-xs">
                    {commands.destination_path}
                  </code>
                </div>
              </CardContent>
            </Card>

            {/* Source File Path Input */}
            <div className="space-y-2">
              <Label htmlFor="source-path">Caminho do arquivo origem</Label>
              <Input
                id="source-path"
                value={sourceFilePath}
                onChange={(e) => setSourceFilePath(e.target.value)}
                placeholder="/caminho/completo/do/video.mp4"
              />
              <p className="text-xs text-muted-foreground">
                Substitua pelo caminho real do vídeo na sua máquina
              </p>
            </div>

            {/* Commands Tabs */}
            <Tabs defaultValue="url-download" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="url-download" className="gap-1">
                  <Link className="h-3 w-3" />
                  URL
                </TabsTrigger>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="scp">SCP/Rsync</TabsTrigger>
                <TabsTrigger value="windows">Windows</TabsTrigger>
                <TabsTrigger value="powershell">PowerShell</TabsTrigger>
              </TabsList>

              {/* URL Download Tab - NEW */}
              <TabsContent value="url-download" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Download por URL
                    </CardTitle>
                    <CardDescription>
                      Cole a URL do vídeo e o servidor baixará diretamente para o storage
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>URL do Vídeo</Label>
                      <Input
                        placeholder="Cole o link: YouTube, Instagram, Facebook, TikTok, Google Drive..."
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        disabled={isDownloading}
                      />
                      <p className="text-xs text-muted-foreground">
                        Suporta: YouTube, Instagram, Facebook, TikTok, Vimeo, Twitter/X, Twitch, Google Drive, Dropbox, links diretos
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo do Vídeo</Label>
                      <Select value={videoType} onValueChange={setVideoType} disabled={isDownloading}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="first_half">1º Tempo</SelectItem>
                          <SelectItem value="second_half">2º Tempo</SelectItem>
                          <SelectItem value="full">Jogo Completo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Progress display */}
                    {downloadStatus !== 'idle' && (
                      <div className="space-y-2 p-3 bg-muted rounded-lg">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            {downloadStatus === 'downloading' && (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                Baixando...
                              </>
                            )}
                            {downloadStatus === 'completed' && (
                              <>
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                Concluído
                              </>
                            )}
                            {downloadStatus === 'failed' && (
                              <>
                                <XCircle className="h-4 w-4 text-destructive" />
                                Falhou
                              </>
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            {totalBytes
                              ? `${formatBytes(bytesDownloaded)} / ${formatBytes(totalBytes)}`
                              : formatBytes(bytesDownloaded)
                            }
                          </span>
                        </div>
                        <Progress value={downloadProgress} className="h-2" />
                        {downloadError && (
                          <p className="text-xs text-destructive mt-1">{downloadError}</p>
                        )}
                      </div>
                    )}

                    <Button
                      onClick={handleDownloadFromUrl}
                      disabled={isDownloading || !videoUrl.trim()}
                      className="w-full gap-2"
                    >
                      {isDownloading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      {isDownloading ? 'Baixando...' : 'Iniciar Download'}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="curl" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Upload via HTTP</CardTitle>
                    <CardDescription>
                      {commands.commands.curl.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CommandBlock
                      command={commands.commands.curl.command}
                      label="curl"
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="scp" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">SCP - Cópia via SSH</CardTitle>
                    <CardDescription>
                      {commands.commands.scp.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <CommandBlock
                      command={commands.commands.scp.single_file}
                      label="scp-single"
                      description="Arquivo único"
                    />
                    <CommandBlock
                      command={commands.commands.scp.multiple_files}
                      label="scp-multiple"
                      description="Múltiplos arquivos"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Rsync - Sincronização com Resume</CardTitle>
                    <CardDescription>
                      {commands.commands.rsync.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <CommandBlock
                      command={commands.commands.rsync.single_file}
                      label="rsync-single"
                      description="Arquivo único (permite retomar se interrompido)"
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="windows" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Cópia via Rede (CMD)</CardTitle>
                    <CardDescription>
                      {commands.commands.windows_network.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <CommandBlock
                      command={commands.commands.windows_network.copy}
                      label="win-copy"
                      description="Comando copy"
                    />
                    <CommandBlock
                      command={commands.commands.windows_network.xcopy}
                      label="win-xcopy"
                      description="Comando xcopy (múltiplos arquivos)"
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="powershell" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">PowerShell</CardTitle>
                    <CardDescription>
                      {commands.commands.powershell.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CommandBlock
                      command={commands.commands.powershell.command}
                      label="powershell"
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Notes */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Instruções</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {commands.notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {note}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 font-medium text-foreground">
                    <span className="text-primary">•</span>
                    Após transferir, clique no botão "Sincronizar" abaixo
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Sync Button */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button onClick={handleSync} disabled={isSyncing} className="gap-2">
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sincronizar Vídeos
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            Erro ao carregar comandos. Tente novamente.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
