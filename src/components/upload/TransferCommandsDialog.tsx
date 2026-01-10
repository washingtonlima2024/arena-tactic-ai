import { useState, useEffect } from 'react';
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
import { toast } from 'sonner';
import { apiClient } from '@/lib/apiClient';
import {
  Copy,
  Check,
  Terminal,
  RefreshCw,
  Folder,
  Server,
  MonitorDown,
  Upload,
  Loader2,
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

  // Fetch commands when dialog opens
  useEffect(() => {
    if (open && matchId) {
      fetchCommands();
    }
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
            <Tabs defaultValue="curl" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="curl">HTTP (cURL)</TabsTrigger>
                <TabsTrigger value="scp">SCP/Rsync</TabsTrigger>
                <TabsTrigger value="windows">Windows</TabsTrigger>
                <TabsTrigger value="powershell">PowerShell</TabsTrigger>
              </TabsList>

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
