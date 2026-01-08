import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Play, 
  Download, 
  Video,
  GripVertical,
  Instagram,
  Youtube,
  Twitter,
  Send,
  Loader2,
  Server
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import JSZip from 'jszip';
import { apiClient } from '@/lib/apiClient';
import { LocalServerConfig } from './LocalServerConfig';

interface Clip {
  id: string;
  title: string;
  type: string;
  startTime: number;
  endTime: number;
  description: string;
  minute: number;
  clipUrl?: string | null;
}

interface Team {
  id: string;
  name: string;
  short_name?: string;
  primary_color?: string;
}

interface TeamPlaylistProps {
  team: Team;
  teamType: 'home' | 'away';
  clips: Clip[];
  getThumbnail: (id: string) => { imageUrl: string } | undefined;
  onPlayClip: (clipId: string) => void;
  hasVideo: boolean;
  videoUrl?: string;
  matchId?: string;
  onClipsExtracted?: () => void;
}

interface PlaylistItem extends Clip {
  selected: boolean;
  order: number;
}

export function TeamPlaylist({ 
  team, 
  teamType, 
  clips, 
  getThumbnail, 
  onPlayClip, 
  hasVideo,
  videoUrl,
  matchId,
  onClipsExtracted
}: TeamPlaylistProps) {
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [showExtractionDialog, setShowExtractionDialog] = useState(false);
  const [pendingExport, setPendingExport] = useState<PlaylistItem[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  
  // Local server config
  const [serverUrl, setServerUrl] = useState(() => 
    localStorage.getItem('pythonServerUrl') || 'http://localhost:5000'
  );
  const [includeVignettes, setIncludeVignettes] = useState(false);
  const [openingVignette, setOpeningVignette] = useState('');
  const [closingVignette, setClosingVignette] = useState('');
  const [useLocalServer, setUseLocalServer] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  
  // Check server status on mount
  useEffect(() => {
    const checkServer = async () => {
      try {
        const response = await fetch(`${serverUrl}/health`, { 
          signal: AbortSignal.timeout(2000) 
        });
        setServerOnline(response.ok);
      } catch {
        setServerOnline(false);
      }
    };
    checkServer();
  }, [serverUrl]);
  
  // Initialize playlist items from clips
  useEffect(() => {
    setPlaylistItems(
      clips.map((clip, index) => ({
        ...clip,
        selected: false,
        order: index + 1
      }))
    );
  }, [clips]);

  const selectedItems = playlistItems.filter(item => item.selected).sort((a, b) => a.order - b.order);
  const selectedCount = selectedItems.length;

  const toggleSelection = (clipId: string) => {
    setPlaylistItems(prev => prev.map(item => {
      if (item.id === clipId) {
        const newSelected = !item.selected;
        return {
          ...item,
          selected: newSelected,
          order: newSelected ? selectedCount + 1 : 0
        };
      }
      return item;
    }));
  };

  const updateOrder = (clipId: string, newOrder: number) => {
    setPlaylistItems(prev => {
      const items = [...prev];
      const itemIndex = items.findIndex(i => i.id === clipId);
      if (itemIndex === -1) return prev;

      const currentOrder = items[itemIndex].order;
      
      items.forEach(item => {
        if (item.id === clipId) {
          item.order = newOrder;
        } else if (item.selected) {
          if (currentOrder < newOrder && item.order > currentOrder && item.order <= newOrder) {
            item.order--;
          } else if (currentOrder > newOrder && item.order < currentOrder && item.order >= newOrder) {
            item.order++;
          }
        }
      });

      return items;
    });
  };

  const handleDragStart = (clipId: string) => {
    setDraggedItem(clipId);
  };

  const handleDragOver = (e: React.DragEvent, targetClipId: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetClipId) return;
    
    const draggedItemData = playlistItems.find(i => i.id === draggedItem);
    const targetItemData = playlistItems.find(i => i.id === targetClipId);
    
    if (draggedItemData?.selected && targetItemData?.selected) {
      updateOrder(draggedItem, targetItemData.order);
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };


  const handleExportPlaylist = async () => {
    if (selectedCount === 0) {
      toast({
        title: "Nenhum clipe selecionado",
        description: "Selecione pelo menos um clipe para exportar",
        variant: "destructive"
      });
      return;
    }

    const clipsWithUrls = selectedItems.filter(item => item.clipUrl);
    const clipsWithoutUrls = selectedItems.filter(item => !item.clipUrl);
    
    // Se há clips sem URL, mostrar dialog
    if (clipsWithoutUrls.length > 0) {
      setPendingExport(selectedItems);
      setShowExtractionDialog(true);
      return;
    }

    // Download direto dos clips com URL
    await exportClipsWithUrls(clipsWithUrls);
  };

  const handleShareToSocial = (platform: string) => {
    if (selectedCount === 0) {
      toast({
        title: "Nenhum clipe selecionado",
        description: "Selecione pelo menos um clipe para publicar",
        variant: "destructive"
      });
      return;
    }
    toast({
      title: `Publicando no ${platform}`,
      description: `${selectedCount} clipes serão publicados na ordem definida`
    });
  };

  // Extrair clips via servidor Python local
  const handleExtractWithLocalServer = async () => {
    setShowExtractionDialog(false);
    
    if (!videoUrl) {
      toast({
        title: "Vídeo não disponível",
        description: "Link do vídeo não encontrado",
        variant: "destructive"
      });
      return;
    }
    
    setIsExporting(true);
    
    try {
      // Preparar clips para extração
      const clipsToExtract = pendingExport.map((clip, index) => ({
        eventId: clip.id,
        startSeconds: Math.max(0, clip.startTime - 3),
        durationSeconds: 8,
        title: `${clip.minute}min-${clip.type}`
      }));
      
      setExportProgress('Enviando para servidor local...');
      
      const response = await fetch(`${serverUrl}/extract-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          clips: clipsToExtract,
          includeVignettes,
          openingVignette: includeVignettes ? openingVignette : undefined,
          closingVignette: includeVignettes ? closingVignette : undefined
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro no servidor');
      }
      
      setExportProgress('Baixando clips...');
      
      // Baixar o ZIP retornado
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${team.name}-clips.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download concluído!",
        description: `${pendingExport.length} clips extraídos com sucesso`
      });
      
      onClipsExtracted?.();
    } catch (error) {
      console.error('Erro na extração local:', error);
      toast({
        title: "Erro na extração",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
      setPendingExport([]);
      setExportProgress('');
    }
  };

  // Extrair clips via edge function (fallback)
  const handleExtractAndExport = async () => {
    // Se servidor local está online e configurado para usar, usar ele
    if (useLocalServer && serverOnline) {
      return handleExtractWithLocalServer();
    }
    
    setShowExtractionDialog(false);
    
    if (!videoUrl || !matchId) {
      toast({
        title: "Vídeo não disponível",
        description: "Link do vídeo não encontrado",
        variant: "destructive"
      });
      return;
    }
    
    setIsExporting(true);
    
    const clipsComUrl = pendingExport.filter(item => item.clipUrl);
    const clipsSemUrl = pendingExport.filter(item => !item.clipUrl);
    
    try {
      // Extrair clips que não têm URL via servidor local
      for (const clip of clipsSemUrl) {
        const startSeconds = Math.max(0, clip.startTime - 3); // 3s antes
        const durationSeconds = 8; // 8s total
        
        setExportProgress(`Extraindo: ${clip.minute}' - ${clip.type}`);
        
        try {
          const result = await apiClient.extractClip({
            videoUrl,
            startSeconds,
            durationSeconds,
            filename: `${clip.minute}min-${clip.type}.mp4`
          });
          
          // Verificar se retornou Blob (servidor local) ou objeto (Edge Function)
          if (result instanceof Blob) {
            const clipUrl = URL.createObjectURL(result);
            clipsComUrl.push({ ...clip, clipUrl });
          } else if (result && 'clipUrl' in result) {
            clipsComUrl.push({ ...clip, clipUrl: result.clipUrl });
          }
        } catch (error) {
          console.error('Erro ao extrair clip:', error);
          continue;
        }
      }
      
      if (clipsComUrl.length > 0) {
        await exportClipsWithUrls(clipsComUrl);
        onClipsExtracted?.();
      } else {
        toast({
          title: "Nenhum clip disponível",
          description: "Não foi possível extrair os clips",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Erro na extração:', error);
      toast({
        title: "Erro na extração",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
      setPendingExport([]);
      setExportProgress('');
    }
  };

  // Exportar apenas clips que já têm URL
  const exportClipsWithUrls = async (clipsToExport: PlaylistItem[]) => {
    if (clipsToExport.length === 0) return;
    
    setIsExporting(true);
    try {
      if (clipsToExport.length === 1) {
        const clip = clipsToExport[0];
        const response = await fetch(clip.clipUrl!);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${clip.minute}min-${clip.type}.mp4`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Download concluído!" });
      } else {
        const zip = new JSZip();
        for (const clip of clipsToExport) {
          const response = await fetch(clip.clipUrl!);
          const blob = await response.blob();
          zip.file(`${clip.order}-${clip.minute}min-${clip.type}.mp4`, blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${team.name}-clips.zip`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "ZIP baixado com sucesso!", description: `${clipsToExport.length} clips` });
      }
    } catch (error) {
      toast({
        title: "Erro no download",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  const clearSelection = () => {
    setPlaylistItems(prev => prev.map(item => ({
      ...item,
      selected: false,
      order: 0
    })));
  };

  const selectAll = () => {
    setPlaylistItems(prev => prev.map((item, index) => ({
      ...item,
      selected: true,
      order: index + 1
    })));
  };

  // Group clips by type for display
  const goalClips = playlistItems.filter(c => c.type === 'goal');
  const shotClips = playlistItems.filter(c => c.type === 'shot' || c.type === 'shot_on_target');
  const defensiveClips = playlistItems.filter(c => ['foul', 'interception', 'tackle'].includes(c.type));
  const keyMomentClips = playlistItems.filter(c => ['corner', 'freekick', 'offside', 'yellow_card', 'red_card'].includes(c.type));

  return (
    <Card variant="glow" className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg"
              style={{ backgroundColor: team.primary_color || (teamType === 'home' ? '#10b981' : '#3b82f6') }}
            >
              {team.short_name?.slice(0, 2).toUpperCase() || team.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <CardTitle className="text-lg">{team.name}</CardTitle>
              <CardDescription>
                Playlist para redes sociais
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="arena" className="gap-1">
              {selectedCount} selecionados
            </Badge>
            <Badge variant="outline">{clips.length} clipes</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Selection Controls */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Selecionar Todos
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedCount === 0}>
              Limpar
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <LocalServerConfig
              serverUrl={serverUrl}
              onServerUrlChange={setServerUrl}
              includeVignettes={includeVignettes}
              onIncludeVignettesChange={setIncludeVignettes}
              openingVignette={openingVignette}
              onOpeningVignetteChange={setOpeningVignette}
              closingVignette={closingVignette}
              onClosingVignetteChange={setClosingVignette}
            />
          </div>
        </div>
        
        {/* Server Toggle */}
        {serverOnline && (
          <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 p-2">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">
                Servidor local online
              </span>
            </div>
            <Button
              variant={useLocalServer ? "default" : "outline"}
              size="sm"
              onClick={() => setUseLocalServer(!useLocalServer)}
            >
              {useLocalServer ? "Usando Local" : "Usar Local"}
            </Button>
          </div>
        )}

        {/* Selected Clips Queue - Sequência de Publicação */}
        {selectedCount > 0 && (
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-primary flex items-center gap-2">
                <Send className="h-4 w-4" />
                Sequência de Publicação
              </p>
              <Badge variant="arena">{selectedCount} clipes</Badge>
            </div>
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
              {selectedItems.map((item) => {
                const thumbnail = getThumbnail(item.id);
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(item.id)}
                    onDragOver={(e) => handleDragOver(e, item.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 rounded-md bg-background/80 p-2 cursor-move transition-all ${
                      draggedItem === item.id ? 'opacity-50 scale-95' : ''
                    }`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold flex-shrink-0">
                      {item.order}
                    </span>
                    <div className="flex h-8 w-12 items-center justify-center rounded bg-muted overflow-hidden flex-shrink-0">
                      {thumbnail?.imageUrl ? (
                        <img src={thumbnail.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <Video className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <span className="text-xs truncate flex-1">{item.title}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{item.minute}'</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Clip Categories */}
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {/* Goals */}
          {goalClips.length > 0 && (
            <ClipSection
              title="⚽ Gols"
              clips={goalClips}
              getThumbnail={getThumbnail}
              onPlayClip={onPlayClip}
              onToggleSelection={toggleSelection}
              hasVideo={hasVideo}
            />
          )}

          {/* Shots */}
          {shotClips.length > 0 && (
            <ClipSection
              title="🎯 Finalizações"
              clips={shotClips}
              getThumbnail={getThumbnail}
              onPlayClip={onPlayClip}
              onToggleSelection={toggleSelection}
              hasVideo={hasVideo}
            />
          )}

          {/* Defensive */}
          {defensiveClips.length > 0 && (
            <ClipSection
              title="🛡️ Jogadas Defensivas"
              clips={defensiveClips}
              getThumbnail={getThumbnail}
              onPlayClip={onPlayClip}
              onToggleSelection={toggleSelection}
              hasVideo={hasVideo}
            />
          )}

          {/* Key Moments */}
          {keyMomentClips.length > 0 && (
            <ClipSection
              title="⭐ Momentos-Chave"
              clips={keyMomentClips}
              getThumbnail={getThumbnail}
              onPlayClip={onPlayClip}
              onToggleSelection={toggleSelection}
              hasVideo={hasVideo}
            />
          )}

          {clips.length === 0 && (
            <div className="py-8 text-center">
              <Video className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum evento registrado</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-border space-y-3">
          <div className="flex gap-2">
            <Button 
              variant="arena" 
              className="flex-1" 
              size="sm"
              onClick={handleExportPlaylist}
              disabled={selectedCount === 0 || isExporting}
            >
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isExporting ? 'Exportando...' : `Exportar (${selectedCount})`}
            </Button>
          </div>
          
          {/* Social Media Buttons */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => handleShareToSocial('Instagram')}
              disabled={selectedCount === 0}
            >
              <Instagram className="mr-1 h-4 w-4" />
              Instagram
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => handleShareToSocial('YouTube')}
              disabled={selectedCount === 0}
            >
              <Youtube className="mr-1 h-4 w-4" />
              YouTube
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => handleShareToSocial('X')}
              disabled={selectedCount === 0}
            >
              <Twitter className="mr-1 h-4 w-4" />
              X
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Dialog de Extração On-Demand */}
      <AlertDialog open={showExtractionDialog} onOpenChange={setShowExtractionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Clips não extraídos
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingExport.filter(item => !item.clipUrl).length} dos {pendingExport.length} clips selecionados ainda não foram extraídos do vídeo.
              <br /><br />
              {serverOnline ? (
                <>
                  <strong>Servidor local detectado!</strong> Os clips serão cortados com precisão usando FFmpeg.
                  {includeVignettes && (
                    <span className="block mt-1 text-green-600 dark:text-green-400">
                      ✓ Vinhetas serão adicionadas automaticamente
                    </span>
                  )}
                </>
              ) : (
                "Clique em \"Extrair e Baixar\" para processar os clips automaticamente."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {serverOnline && !useLocalServer && (
              <Button 
                variant="outline" 
                onClick={() => {
                  setUseLocalServer(true);
                  handleExtractWithLocalServer();
                }}
              >
                <Server className="mr-2 h-4 w-4" />
                Usar Servidor Local
              </Button>
            )}
            <AlertDialogAction onClick={handleExtractAndExport} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {exportProgress || 'Extraindo...'}
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Extrair e Baixar ({pendingExport.length})
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// Clip Section Component
interface ClipSectionProps {
  title: string;
  clips: PlaylistItem[];
  getThumbnail: (id: string) => { imageUrl: string } | undefined;
  onPlayClip: (clipId: string) => void;
  onToggleSelection: (clipId: string) => void;
  hasVideo: boolean;
}

function ClipSection({ 
  title, 
  clips, 
  getThumbnail, 
  onPlayClip, 
  onToggleSelection,
  hasVideo 
}: ClipSectionProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      {clips.map(clip => {
        const thumbnail = getThumbnail(clip.id);
        return (
          <div 
            key={clip.id} 
            className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
              clip.selected 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:bg-muted/50'
            }`}
          >
            <Checkbox 
              checked={clip.selected}
              onCheckedChange={() => onToggleSelection(clip.id)}
              className="flex-shrink-0"
            />
            {clip.selected && clip.order > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold flex-shrink-0">
                {clip.order}
              </span>
            )}
            <div 
              className="flex h-12 w-16 items-center justify-center rounded bg-muted overflow-hidden cursor-pointer flex-shrink-0"
              onClick={() => hasVideo && onPlayClip(clip.id)}
            >
              {thumbnail?.imageUrl ? (
                <img src={thumbnail.imageUrl} alt={clip.title} className="w-full h-full object-cover" />
              ) : (
                <Video className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{clip.title}</p>
              <p className="text-xs text-muted-foreground">
                {clip.minute}' • 15 segundos
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="icon-sm"
              disabled={!hasVideo}
              onClick={() => onPlayClip(clip.id)}
            >
              <Play className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
