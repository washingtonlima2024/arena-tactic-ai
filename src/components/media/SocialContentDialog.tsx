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
import { 
  Smartphone, 
  Monitor, 
  Square, 
  RectangleVertical,
  RectangleHorizontal,
  Play,
  Sparkles,
  ListVideo,
  Loader2,
  Check,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
  matchVideoUrl,
  homeTeam = homeTeamPlaylist.teamName,
  awayTeam = awayTeamPlaylist.teamName,
  homeScore = 0,
  awayScore = 0,
}: SocialContentDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const [step, setStep] = useState<'format' | 'clips' | 'preview'>('format');
  const [selectedClips, setSelectedClips] = useState<string[]>([]);
  const [includeVignettes, setIncludeVignettes] = useState(true);
  const [showPlayer, setShowPlayer] = useState(false);
  const [activeTeam, setActiveTeam] = useState<'home' | 'away'>('home');

  const currentPlaylist = activeTeam === 'home' ? homeTeamPlaylist : awayTeamPlaylist;

  // Reset when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep('format');
      setSelectedFormat(null);
      setSelectedClips([]);
      setIncludeVignettes(true);
    }
  }, [isOpen]);

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

  const handlePreview = () => {
    if (selectedClips.length === 0) {
      toast.error('Selecione pelo menos um clipe');
      return;
    }
    setShowPlayer(true);
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

  // Get clips for playlist player
  const getPlaylistClips = () => {
    const allClips = [...homeTeamPlaylist.clips, ...awayTeamPlaylist.clips];
    return selectedClips
      .map(id => allClips.find(c => c.id === id))
      .filter(Boolean) as Clip[];
  };

  return (
    <>
      <Dialog open={isOpen && !showPlayer} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Gerar Conteúdo para {platform}
            </DialogTitle>
            <DialogDescription>
              {step === 'format' 
                ? 'Escolha o formato de vídeo ideal para sua rede social'
                : 'Selecione os clipes e configure a montagem do vídeo'
              }
            </DialogDescription>
          </DialogHeader>

          {step === 'format' ? (
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
                      {selectedFormat?.width}x{selectedFormat?.height} • {selectedFormat?.ratio}
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
                >
                  {homeTeamPlaylist.teamName}
                </Button>
                <Button
                  variant={activeTeam === 'away' ? 'arena' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTeam('away')}
                >
                  {awayTeamPlaylist.teamName}
                </Button>
              </div>

              {/* Clips Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <ListVideo className="h-4 w-4" />
                    Clipes Disponíveis
                  </h4>
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    {currentPlaylist.clips.every(c => selectedClips.includes(c.id)) 
                      ? 'Desmarcar Todos' 
                      : 'Selecionar Todos'}
                  </Button>
                </div>

                <ScrollArea className="h-[250px] border rounded-lg p-2">
                  {currentPlaylist.clips.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhum clipe disponível
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {currentPlaylist.clips.map((clip) => (
                        <div
                          key={clip.id}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors",
                            selectedClips.includes(clip.id) 
                              ? "border-primary bg-primary/10" 
                              : "hover:bg-muted/50"
                          )}
                          onClick={() => handleClipToggle(clip.id)}
                        >
                          <Checkbox 
                            checked={selectedClips.includes(clip.id)}
                            onCheckedChange={() => handleClipToggle(clip.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{clip.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {clip.minute}' • {clip.type}
                            </p>
                          </div>
                          {selectedClips.includes(clip.id) && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Options */}
              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                <Checkbox
                  id="vignettes"
                  checked={includeVignettes}
                  onCheckedChange={(checked) => setIncludeVignettes(checked as boolean)}
                />
                <label htmlFor="vignettes" className="text-sm cursor-pointer">
                  Incluir vinhetas (abertura, transições, encerramento)
                </label>
              </div>

              {/* Actions */}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={handleBack}>
                  Voltar
                </Button>
                <Button 
                  variant="arena" 
                  onClick={handlePreview}
                  disabled={selectedClips.length === 0}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Visualizar Playlist ({selectedClips.length})
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Playlist Player */}
      {showPlayer && selectedFormat && (
        <PlaylistPlayer
          onClose={() => setShowPlayer(false)}
          clips={getPlaylistClips()}
          format={selectedFormat.ratio as '9:16' | '16:9' | '1:1' | '4:5'}
          includeVignettes={includeVignettes}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={homeScore}
          awayScore={awayScore}
        />
      )}
    </>
  );
}
