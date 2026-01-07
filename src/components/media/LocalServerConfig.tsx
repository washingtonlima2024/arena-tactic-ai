import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, Server, Check, X, Loader2 } from 'lucide-react';

interface ServerStatus {
  status: 'checking' | 'online' | 'offline';
  ffmpeg: boolean;
  vignettes: string[];
}

interface LocalServerConfigProps {
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  includeVignettes: boolean;
  onIncludeVignettesChange: (include: boolean) => void;
  openingVignette: string;
  onOpeningVignetteChange: (vignette: string) => void;
  closingVignette: string;
  onClosingVignetteChange: (vignette: string) => void;
}

export function LocalServerConfig({
  serverUrl,
  onServerUrlChange,
  includeVignettes,
  onIncludeVignettesChange,
  openingVignette,
  onOpeningVignetteChange,
  closingVignette,
  onClosingVignetteChange,
}: LocalServerConfigProps) {
  const [open, setOpen] = useState(false);
  const [tempUrl, setTempUrl] = useState(serverUrl);
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    status: 'checking',
    ffmpeg: false,
    vignettes: [],
  });

  const checkServerStatus = async (url: string) => {
    setServerStatus((prev) => ({ ...prev, status: 'checking' }));
    try {
      const response = await fetch(`${url}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        const data = await response.json();
        const vignettes = (data.vignettes_available || []).map((v: string) => {
          // Extrair nome do arquivo do path
          const parts = v.split(/[/\\]/);
          return parts[parts.length - 1];
        });
        
        setServerStatus({
          status: 'online',
          ffmpeg: data.ffmpeg,
          vignettes,
        });
      } else {
        setServerStatus({ status: 'offline', ffmpeg: false, vignettes: [] });
      }
    } catch {
      setServerStatus({ status: 'offline', ffmpeg: false, vignettes: [] });
    }
  };

  useEffect(() => {
    if (open) {
      checkServerStatus(tempUrl);
    }
  }, [open, tempUrl]);

  const handleSave = () => {
    onServerUrlChange(tempUrl);
    localStorage.setItem('pythonServerUrl', tempUrl);
    setOpen(false);
  };

  const handleReset = () => {
    const defaultUrl = 'http://localhost:5000';
    setTempUrl(defaultUrl);
    checkServerStatus(defaultUrl);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Server className="h-4 w-4" />
          Servidor Local
          {serverStatus.status === 'online' && (
            <Badge variant="default" className="ml-1 bg-green-500 text-xs px-1">
              <Check className="h-3 w-3" />
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Configuração do Servidor Local
          </DialogTitle>
          <DialogDescription>
            Configure a conexão com o servidor Python para processamento de vídeo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Server URL */}
          <div className="space-y-2">
            <Label htmlFor="serverUrl">URL do Servidor</Label>
            <div className="flex gap-2">
              <Input
                id="serverUrl"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                placeholder="http://localhost:5000"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => checkServerStatus(tempUrl)}
              >
                {serverStatus.status === 'checking' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : serverStatus.status === 'online' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
              </Button>
            </div>
          </div>

          {/* Server Status */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge
                variant={serverStatus.status === 'online' ? 'default' : 'destructive'}
              >
                {serverStatus.status === 'checking'
                  ? 'Verificando...'
                  : serverStatus.status === 'online'
                  ? 'Online'
                  : 'Offline'}
              </Badge>
            </div>
            
            {serverStatus.status === 'online' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">FFmpeg</span>
                  <Badge variant={serverStatus.ffmpeg ? 'default' : 'destructive'}>
                    {serverStatus.ffmpeg ? 'Disponível' : 'Não encontrado'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Vinhetas</span>
                  <Badge variant="outline">
                    {serverStatus.vignettes.length} disponíveis
                  </Badge>
                </div>
              </>
            )}

            {serverStatus.status === 'offline' && (
              <p className="text-xs text-muted-foreground">
                Certifique-se de que o servidor Python está rodando.
                Execute: <code className="bg-muted px-1 rounded">python server.py</code>
              </p>
            )}
          </div>

          {/* Vignettes Config */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label htmlFor="includeVignettes">Incluir Vinhetas</Label>
              <Switch
                id="includeVignettes"
                checked={includeVignettes}
                onCheckedChange={onIncludeVignettesChange}
                disabled={serverStatus.vignettes.length === 0}
              />
            </div>

            {includeVignettes && serverStatus.vignettes.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label>Vinheta de Abertura</Label>
                  <Select
                    value={openingVignette}
                    onValueChange={onOpeningVignetteChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhuma</SelectItem>
                      {serverStatus.vignettes.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Vinheta de Encerramento</Label>
                  <Select
                    value={closingVignette}
                    onValueChange={onClosingVignetteChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhuma</SelectItem>
                      {serverStatus.vignettes.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleReset}>
            Resetar
          </Button>
          <Button onClick={handleSave} disabled={serverStatus.status !== 'online'}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
