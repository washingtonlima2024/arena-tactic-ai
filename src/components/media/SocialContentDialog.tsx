import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Smartphone, 
  Monitor, 
  Square, 
  RectangleVertical,
  RectangleHorizontal,
  Play,
  Sparkles,
  ListVideo,
  Film,
  Loader2,
  GripVertical,
  Check,
  Download,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoGeneration } from '@/hooks/useVideoGeneration';
import { VideoGenerationProgress } from './VideoGenerationProgress';
import { PlaylistPlayer } from './PlaylistPlayer';
import { toast } from 'sonner';

interface VideoFormat {
  id: string;
  name: string;
  ratio: string;
  width: number;
  height: number;
  orientation: 'vertical' | 'horizontal' | 'square';
  icon: React.ReactNode;
  platforms: string[];
}

const videoFormats: VideoFormat[] = [
  {
    id: '9:16',
    name: 'Stories/Reels',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    orientation: 'vertical',
    icon: <RectangleVertical className="h-8 w-12" />,
    platforms: ['Instagram Reels', 'TikTok', 'YouTube Shorts']
  },
  {
    id: '16:9',
    name: 'Widescreen',
    ratio: '16:9',
    width: 1920,
    height: 1080,
    orientation: 'horizontal',
    icon: <RectangleHorizontal className="h-6 w-12" />,
    platforms: ['YouTube', 'LinkedIn', 'Facebook']
  },
  {
    id: '1:1',
    name: 'Feed Quadrado',
    ratio: '1:1',
    width: 1080,
    height: 1080,
    orientation: 'square',
    icon: <Square className="h-8 w-8" />,
    platforms: ['Instagram Feed', 'Facebook', 'LinkedIn']
  },
  {
    id: '4:5',
    name: 'Feed Vertical',
    ratio: '4:5',
    width: 1080,
    height: 1350,
    orientation: 'vertical',
    icon: <RectangleVertical className="h-10 w-8" />,
    platforms: ['Instagram Feed', 'Facebook']
  }
];

interface Clip {
  id: string;
  title: string;
  type: string;
  startTime: number;
  endTime: number;
  description: string;
  minute: number;
  thumbnail?: string;
  clipUrl?: string | null;
}

interface TeamPlaylistData {
  teamName: string;
  teamType: 'home' | 'away';
  clips: Clip[];
}

interface SocialContentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  platform: string;
  homeTeamPlaylist: TeamPlaylistData;
  awayTeamPlaylist: TeamPlaylistData;
  onGenerate?: (config: GenerationConfig) => void;
  isGenerating?: boolean;
  matchVideoUrl?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  matchTitle?: string;
}

export interface GenerationConfig {
  format: VideoFormat;
  selectedClips: string[];
  includeVignettes: boolean;
  platform: string;
}

export function SocialContentDialog({
  isOpen,
  onClose,
  platform,
  homeTeamPlaylist,
  awayTeamPlaylist,
  onGenerate,
  isGenerating: externalIsGenerating = false,
  matchVideoUrl,
  homeTeam = homeTeamPlaylist.teamName,
  awayTeam = awayTeamPlaylist.teamName,
  homeScore = 0,
  awayScore = 0,
  matchTitle
}: SocialContentDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const [step, setStep] = useState<'format' | 'clips' | 'generating'>('format');
  const [selectedClips, setSelectedClips] = useState<string[]>([]);
  const [includeVignettes, setIncludeVignettes] = useState(true);
  const [showPlayer, setShowPlayer] = useState(false);
  const [activeTeam, setActiveTeam] = useState<'home' | 'away'>('home');

  const { 
    isGenerating, 
    progress, 
    generatedVideoUrl, 
    generateHighlightsVideo, 
    downloadVideo,
    reset: resetGeneration
  } = useVideoGeneration();

  const currentPlaylist = activeTeam === 'home' ? homeTeamPlaylist : awayTeamPlaylist;

  // Reset when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep('format');
      setSelectedFormat(null);
      setSelectedClips([]);
      setIncludeVignettes(true);
      resetGeneration();
    }
  }, [isOpen, resetGeneration]);

  const handleFormatSelect = (format: VideoFormat) => {
    setSelectedFormat(format);
    setStep('clips');
  };

  const handleClipToggle = (clipId: string) => {
    setSelectedClips(prev => 
      prev.includes(clipId) 
        ? prev.filter(id => id !== clipId)
        : [...prev, clipId]
    );
  };

  const handleSelectAll = () => {
    const allClipIds = currentPlaylist.clips.map(c => c.id);
    const allSelected = allClipIds.every(id => selectedClips.includes(id));
    
    if (allSelected) {
      setSelectedClips(prev => prev.filter(id => !allClipIds.includes(id)));
    } else {
      setSelectedClips(prev => [...new Set([...prev, ...allClipIds])]);
    }
  };

  const generateCollageImage = async () => {
    if (!selectedFormat) return;
    
    const allClips = [...homeTeamPlaylist.clips, ...awayTeamPlaylist.clips];
    const selectedClipData = selectedClips.map(id => allClips.find(c => c.id === id)).filter(Boolean);
    
    // Create canvas for collage
    const canvas = document.createElement('canvas');
    canvas.width = selectedFormat.width;
    canvas.height = selectedFormat.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#0a1628');
    gradient.addColorStop(1, '#1a2f4a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate grid layout
    const cols = Math.ceil(Math.sqrt(selectedClipData.length));
    const rows = Math.ceil(selectedClipData.length / cols);
    const padding = 20;
    const cellWidth = (canvas.width - padding * (cols + 1)) / cols;
    const cellHeight = (canvas.height - padding * (rows + 1) - 120) / rows;
    
    // Draw title
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⚽ MELHORES MOMENTOS', canvas.width / 2, 60);
    
    // Draw clip thumbnails
    for (let i = 0; i < selectedClipData.length; i++) {
      const clip = selectedClipData[i];
      if (!clip) continue;
      
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * (cellWidth + padding);
      const y = 100 + padding + row * (cellHeight + padding);
      
      // Draw cell background
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, cellWidth, cellHeight, 8);
      ctx.fill();
      ctx.stroke();
      
      // If thumbnail exists, draw it
      if (clip.thumbnail) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = clip.thumbnail!;
          });
          ctx.drawImage(img, x + 4, y + 4, cellWidth - 8, cellHeight - 40);
        } catch {
          // Draw placeholder
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillRect(x + 4, y + 4, cellWidth - 8, cellHeight - 40);
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x + 4, y + 4, cellWidth - 8, cellHeight - 40);
      }
      
      // Draw clip title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      const title = clip.title.length > 20 ? clip.title.substring(0, 20) + '...' : clip.title;
      ctx.fillText(title, x + 8, y + cellHeight - 12);
      
      // Draw minute badge
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`${clip.minute}'`, x + cellWidth - 30, y + 24);
    }
    
    // Draw footer
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${platform} • ${selectedFormat.ratio}`, canvas.width / 2, canvas.height - 20);
    
    // Convert to blob and download
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `collage_${platform.replace(/\s+/g, '_').toLowerCase()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Imagem de collage gerada com sucesso!');
      }
    }, 'image/png');
  };

  const handleGenerate = async () => {
    if (!selectedFormat || selectedClips.length === 0) return;
    
    const allClips = [...homeTeamPlaylist.clips, ...awayTeamPlaylist.clips];
    
    // Check if clips have pre-extracted URLs (much faster)
    const selectedClipData = selectedClips.map(id => allClips.find(c => c.id === id)).filter(Boolean);
    const clipsWithUrls = selectedClipData.filter(c => c?.clipUrl);
    const hasExtractedClips = clipsWithUrls.length > 0;
    
    // If we have pre-extracted clips, use those (MUCH faster - ~10MB each vs 100MB+ full video)
    if (hasExtractedClips) {
      setStep('generating');
      
      const clipsToProcess = clipsWithUrls.map(clip => ({
        id: clip!.id,
        url: clip!.clipUrl!,
        startTime: 0, // Clips already cut, no need to seek
        endTime: 20, // ~20 second clips
        title: clip!.title
      }));

      console.log(`[SocialExport] Using ${clipsToProcess.length} pre-extracted clips`);

      await generateHighlightsVideo({
        clips: clipsToProcess,
        format: {
          width: selectedFormat.width,
          height: selectedFormat.height,
          ratio: selectedFormat.ratio
        },
        includeVignettes,
        outputName: `highlights_${platform.replace(/\s+/g, '_').toLowerCase()}`
      });
    } else if (matchVideoUrl) {
      // Fallback to full video (slower, may timeout)
      toast.warning('Clips não extraídos. Usando vídeo completo (pode demorar).');
      setStep('generating');
      
      const clipsToProcess = selectedClips.map(id => {
        const clip = allClips.find(c => c.id === id);
        return clip ? {
          id: clip.id,
          url: matchVideoUrl,
          startTime: clip.startTime,
          endTime: clip.endTime,
          title: clip.title
        } : null;
      }).filter(Boolean) as { id: string; url: string; startTime: number; endTime: number; title: string }[];

      await generateHighlightsVideo({
        clips: clipsToProcess,
        format: {
          width: selectedFormat.width,
          height: selectedFormat.height,
          ratio: selectedFormat.ratio
        },
        includeVignettes,
        outputName: `highlights_${platform.replace(/\s+/g, '_').toLowerCase()}`
      });
    } else {
      // No video - generate image collage instead
      await generateCollageImage();
    }
    
    if (onGenerate) {
      onGenerate({
        format: selectedFormat,
        selectedClips,
        includeVignettes,
        platform
      });
    }
  };

  const handleBack = () => {
    if (step === 'clips') {
      setStep('format');
      setSelectedFormat(null);
    }
  };

  const handleClose = () => {
    setStep('format');
    setSelectedFormat(null);
    setSelectedClips([]);
    setIncludeVignettes(true);
    onClose();
  };

  const getOrientationIcon = (orientation: string) => {
    switch (orientation) {
      case 'vertical':
        return <Smartphone className="h-4 w-4" />;
      case 'horizontal':
        return <Monitor className="h-4 w-4" />;
      default:
        return <Square className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar Conteúdo para {platform}
          </DialogTitle>
          <DialogDescription>
            {step === 'format' 
              ? 'Escolha o formato de vídeo ideal para sua rede social'
              : step === 'generating'
              ? 'Processando seu vídeo de melhores momentos'
              : 'Selecione os clipes e configure a montagem do vídeo'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'generating' ? (
          <VideoGenerationProgress
            progress={progress}
            videoUrl={generatedVideoUrl}
            onDownload={() => generatedVideoUrl && downloadVideo(generatedVideoUrl, `${platform.replace(/\s+/g, '_')}_highlights.mp4`)}
            onPreview={() => {
              if (generatedVideoUrl) {
                window.open(generatedVideoUrl, '_blank');
              }
            }}
            onReset={() => {
              resetGeneration();
              setStep('clips');
            }}
          />
        ) : step === 'format' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione a orientação e proporção do vídeo:
            </p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {videoFormats.map((format) => (
                <Card 
                  key={format.id}
                  variant="glass"
                  className={cn(
                    "cursor-pointer transition-all hover:border-primary/50 hover:bg-primary/5",
                    format.platforms.some(p => p.toLowerCase().includes(platform.toLowerCase().split(' ')[0])) && "border-primary/30 bg-primary/5"
                  )}
                  onClick={() => handleFormatSelect(format)}
                >
                  <CardContent className="pt-6 text-center">
                    <div className="flex justify-center mb-3 text-primary">
                      {format.icon}
                    </div>
                    <h4 className="font-medium text-sm">{format.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{format.ratio}</p>
                    <div className="flex items-center justify-center gap-1 mt-2">
                      {getOrientationIcon(format.orientation)}
                      <span className="text-xs text-muted-foreground capitalize">
                        {format.orientation === 'vertical' ? 'Vertical' : 
                         format.orientation === 'horizontal' ? 'Horizontal' : 'Quadrado'}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {format.width}x{format.height}
                    </p>
                    {format.platforms.some(p => p.toLowerCase().includes(platform.toLowerCase().split(' ')[0])) && (
                      <Badge variant="arena" className="mt-2 text-[10px]">
                        Recomendado
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Selected Format Summary */}
            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="text-primary">
                  {selectedFormat?.icon}
                </div>
                <div>
                  <p className="font-medium text-sm">{selectedFormat?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedFormat?.ratio} • {selectedFormat?.width}x{selectedFormat?.height}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Alterar
              </Button>
            </div>

            {/* Team Selector */}
            <div className="flex gap-2">
              <Button
                variant={activeTeam === 'home' ? 'arena' : 'outline'}
                size="sm"
                onClick={() => setActiveTeam('home')}
                className="flex-1"
              >
                {homeTeamPlaylist.teamName}
              </Button>
              <Button
                variant={activeTeam === 'away' ? 'arena' : 'outline'}
                size="sm"
                onClick={() => setActiveTeam('away')}
                className="flex-1"
              >
                {awayTeamPlaylist.teamName}
              </Button>
            </div>

            {/* Clips Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-2">
                  <ListVideo className="h-4 w-4" />
                  Clipes de {currentPlaylist.teamName}
                </p>
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  {currentPlaylist.clips.every(c => selectedClips.includes(c.id)) 
                    ? 'Desmarcar Todos' 
                    : 'Selecionar Todos'
                  }
                </Button>
              </div>

              <ScrollArea className="h-[200px] border rounded-lg p-2">
                {currentPlaylist.clips.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p className="text-sm">Nenhum clipe disponível</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentPlaylist.clips.map((clip, index) => (
                      <div
                        key={clip.id}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer",
                          selectedClips.includes(clip.id) 
                            ? "border-primary bg-primary/10" 
                            : "border-transparent hover:bg-muted/50"
                        )}
                        onClick={() => handleClipToggle(clip.id)}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <Checkbox
                          checked={selectedClips.includes(clip.id)}
                          onCheckedChange={() => handleClipToggle(clip.id)}
                        />
                        {clip.thumbnail ? (
                          <img 
                            src={clip.thumbnail} 
                            alt={clip.title}
                            className="h-10 w-16 object-cover rounded"
                          />
                        ) : (
                          <div className="h-10 w-16 bg-muted rounded flex items-center justify-center">
                            <Play className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{clip.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {clip.minute}' • {clip.type}
                          </p>
                        </div>
                        {selectedClips.includes(clip.id) && (
                          <Badge variant="arena" className="text-[10px]">
                            #{selectedClips.indexOf(clip.id) + 1}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            <Separator />

            {/* Vignette Option */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Film className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Incluir vinhetas de transição</p>
                  <p className="text-xs text-muted-foreground">
                    Adiciona animações entre cada clipe
                  </p>
                </div>
              </div>
              <Checkbox
                checked={includeVignettes}
                onCheckedChange={(checked) => setIncludeVignettes(!!checked)}
              />
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedClips.length} clipe(s) selecionado(s)
              </span>
              <span className="text-muted-foreground">
                Duração estimada: ~{selectedClips.length * 15}s
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Voltar
              </Button>
              <Button 
                variant="outline"
                onClick={() => setShowPlayer(true)}
                disabled={selectedClips.length === 0}
                className="flex-1 gap-2 border-primary/50 text-primary hover:bg-primary/10"
              >
                <Eye className="h-4 w-4" />
                Preview Completo
              </Button>
              <Button 
                variant="arena" 
                onClick={handleGenerate}
                disabled={selectedClips.length === 0 || isGenerating || externalIsGenerating}
                className="flex-1 gap-2"
              >
                {isGenerating || externalIsGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Exportar Vídeo
                  </>
                )}
              </Button>
            </div>

            {/* No video info */}
            {!matchVideoUrl && selectedClips.length > 0 && (
              <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
                <p className="text-xs text-primary flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Sem vídeo: será gerada uma imagem collage com os thumbnails dos clipes selecionados.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* Immersive Playlist Player */}
      {showPlayer && (
        <PlaylistPlayer
          clips={(() => {
            const allClips = [...homeTeamPlaylist.clips, ...awayTeamPlaylist.clips];
            return selectedClips.map(id => {
              const clip = allClips.find(c => c.id === id);
              return clip ? {
                id: clip.id,
                title: clip.title,
                type: clip.type,
                minute: clip.minute,
                description: clip.description,
                thumbnail: clip.thumbnail,
                clipUrl: clip.clipUrl,
                videoUrl: matchVideoUrl,
                startTime: clip.startTime,
                endTime: clip.endTime
              } : null;
            }).filter(Boolean) as any[];
          })()}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={homeScore}
          awayScore={awayScore}
          matchTitle={matchTitle}
          includeVignettes={includeVignettes}
          onClose={() => setShowPlayer(false)}
        />
      )}
    </Dialog>
  );
}