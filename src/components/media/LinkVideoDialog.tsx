import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/hooks/use-toast';
import { Loader2, Link, Upload, Video, FolderOpen } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface LinkVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  onVideoLinked: () => void;
}

interface StorageFile {
  name: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any> | null;
}

export function LinkVideoDialog({ open, onOpenChange, matchId, onVideoLinked }: LinkVideoDialogProps) {
  const [mode, setMode] = useState<'storage' | 'url'>('storage');
  const [isLoading, setIsLoading] = useState(false);
  const [storageFiles, setStorageFiles] = useState<StorageFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Load files from storage when dialog opens
  useEffect(() => {
    if (open && mode === 'storage') {
      loadStorageFiles();
    }
  }, [open, mode]);

  const loadStorageFiles = async () => {
    setIsLoadingFiles(true);
    try {
      // Load files from local storage
      const storageData = await apiClient.getMatchStorage(matchId, 'videos');
      const allFiles: StorageFile[] = [];
      
      if (storageData?.files) {
        const videoFiles = storageData.files.filter((f: any) => 
          f.name.endsWith('.mp4') || f.name.endsWith('.webm') || f.name.endsWith('.mov')
        ).map((f: any) => ({
          name: f.name,
          created_at: f.modified || new Date().toISOString(),
          updated_at: f.modified || new Date().toISOString(),
          metadata: { size: f.size }
        }));
        allFiles.push(...videoFiles);
      }
      
      // Also try to get all videos from API
      try {
        const videos = await apiClient.getVideos(matchId);
        videos?.forEach((v: any) => {
          if (v.file_url && !allFiles.some(f => f.name === v.file_name)) {
            allFiles.push({
              name: v.file_name || v.file_url.split('/').pop() || 'video.mp4',
              created_at: v.created_at,
              updated_at: v.created_at,
              metadata: null
            });
          }
        });
      } catch {}

      console.log(`Found ${allFiles.length} video files`);
      setStorageFiles(allFiles);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os vídeos do storage',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleLinkVideo = async () => {
    let videoUrl = '';

    if (mode === 'storage' && selectedFile) {
      videoUrl = apiClient.getStorageUrl(matchId, 'videos', selectedFile);
    } else if (mode === 'url' && manualUrl) {
      videoUrl = manualUrl;
    }

    if (!videoUrl) {
      toast({
        title: 'Erro',
        description: 'Selecione um vídeo ou insira uma URL',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);

    try {
      // Check if there's an existing video record
      const videos = await apiClient.getVideos(matchId);
      const emptyVideo = videos?.find((v: any) => !v.file_url);

      if (emptyVideo) {
        // Update existing record
        await apiClient.updateVideo(emptyVideo.id, {
          file_url: videoUrl,
          status: 'completed'
        });
        console.log('Updated existing video record:', emptyVideo.id);
      } else {
        // Insert new record
        await apiClient.createVideo({
          match_id: matchId,
          file_url: videoUrl,
          file_name: mode === 'storage' ? selectedFile : 'Vídeo vinculado manualmente',
          video_type: 'full',
          status: 'completed'
        });
        console.log('Inserted new video record');
      }

      toast({
        title: 'Vídeo vinculado',
        description: 'O vídeo foi vinculado aos eventos com sucesso'
      });

      onVideoLinked();
      onOpenChange(false);
      setSelectedFile(null);
      setManualUrl('');
    } catch (error) {
      console.error('Error linking video:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível vincular o vídeo',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return 'Tamanho desconhecido';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Vincular Vídeo aos Eventos
          </DialogTitle>
          <DialogDescription>
            Selecione um vídeo do storage ou insira uma URL para vincular aos eventos desta partida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            <Button 
              variant={mode === 'storage' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setMode('storage')}
              className="flex-1"
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Do Storage
            </Button>
            <Button 
              variant={mode === 'url' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setMode('url')}
              className="flex-1"
            >
              <Link className="h-4 w-4 mr-2" />
              URL Manual
            </Button>
          </div>

          {mode === 'storage' && (
            <div className="space-y-2">
              <Label>Selecione um vídeo do storage</Label>
              {isLoadingFiles ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : storageFiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum vídeo encontrado no storage</p>
                </div>
              ) : (
                <ScrollArea className="h-64 border rounded-md">
                  <div className="p-2 space-y-1">
                    {storageFiles.map((file) => (
                      <div
                        key={file.name}
                        className={`p-3 rounded-md cursor-pointer transition-colors ${
                          selectedFile === file.name 
                            ? 'bg-primary/10 border border-primary' 
                            : 'hover:bg-muted/50 border border-transparent'
                        }`}
                        onClick={() => setSelectedFile(file.name)}
                      >
                        <div className="flex items-center gap-3">
                          <Video className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {formatFileSize(file.metadata?.size || 0)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(file.created_at).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {mode === 'url' && (
            <div className="space-y-2">
              <Label htmlFor="video-url">URL do Vídeo</Label>
              <Input
                id="video-url"
                placeholder="https://..."
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Insira uma URL pública de um vídeo MP4 ou WebM
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleLinkVideo} 
              disabled={isLoading || (mode === 'storage' && !selectedFile) || (mode === 'url' && !manualUrl)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Vinculando...
                </>
              ) : (
                <>
                  <Link className="h-4 w-4 mr-2" />
                  Vincular Vídeo
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}