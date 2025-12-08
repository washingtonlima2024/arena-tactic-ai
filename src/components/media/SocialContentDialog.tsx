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
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoGeneration } from '@/hooks/useVideoGeneration';
import { VideoGenerationProgress } from './VideoGenerationProgress';

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
  matchVideoUrl
}: SocialContentDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const [step, setStep] = useState<'format' | 'clips' | 'generating'>('format');
  const [selectedClips, setSelectedClips] = useState<string[]>([]);
  const [includeVignettes, setIncludeVignettes] = useState(true);
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

  const handleGenerate = async () => {
    if (!selectedFormat || selectedClips.length === 0) return;
    
    // If we have a video URL, use FFmpeg to generate
    if (matchVideoUrl) {
      setStep('generating');
      
      // Get selected clips with their data
      const allClips = [...homeTeamPlaylist.clips, ...awayTeamPlaylist.clips];
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
    } else if (onGenerate) {
      // Fallback to external handler
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
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
                variant="arena" 
                onClick={handleGenerate}
                disabled={selectedClips.length === 0 || isGenerating || externalIsGenerating}
                className="flex-1"
              >
                {isGenerating || externalIsGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Gerar Melhores Momentos
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}