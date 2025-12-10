import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Film, Trash2, Clock, FileVideo, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type VideoType = 'full' | 'first_half' | 'second_half' | 'clip';

export interface VideoSegment {
  id: string;
  name: string;
  size?: number;
  url?: string;
  videoType: VideoType;
  title: string;
  durationSeconds: number | null;
  startMinute: number;
  endMinute: number | null;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error' | 'ready';
  isLink?: boolean;
}

interface VideoSegmentCardProps {
  segment: VideoSegment;
  onChange: (segment: VideoSegment) => void;
  onRemove: () => void;
  index: number;
}

const videoTypeConfig: Record<VideoType, { label: string; color: string; defaultStart: number; defaultEnd: number }> = {
  full: { label: 'Completo', color: 'bg-emerald-500', defaultStart: 0, defaultEnd: 90 },
  first_half: { label: '1º Tempo', color: 'bg-blue-500', defaultStart: 0, defaultEnd: 45 },
  second_half: { label: '2º Tempo', color: 'bg-orange-500', defaultStart: 45, defaultEnd: 90 },
  clip: { label: 'Trecho', color: 'bg-purple-500', defaultStart: 0, defaultEnd: 10 },
};

export function VideoSegmentCard({ segment, onChange, onRemove, index }: VideoSegmentCardProps) {
  const config = videoTypeConfig[segment.videoType];

  const updateField = <K extends keyof VideoSegment>(field: K, value: VideoSegment[K]) => {
    onChange({ ...segment, [field]: value });
  };

  const handleTypeChange = (type: VideoType) => {
    if (!type) return;
    const newConfig = videoTypeConfig[type];
    onChange({
      ...segment,
      videoType: type,
      startMinute: newConfig.defaultStart,
      endMinute: newConfig.defaultEnd,
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const isUploading = segment.status === 'uploading';
  const isComplete = segment.status === 'complete' || segment.status === 'ready';

  return (
    <Card variant="glass" className={cn(
      "relative transition-all",
      isUploading && "border-primary/50",
      segment.status === 'error' && "border-destructive/50"
    )}>
      {/* Index Badge */}
      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
        {index + 1}
      </div>

      <CardContent className="pt-6 space-y-4">
        {/* Header with name and actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {segment.isLink ? (
              <Link2 className="h-5 w-5 text-blue-400 shrink-0" />
            ) : (
              <FileVideo className="h-5 w-5 text-emerald-400 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{segment.name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {segment.size && <span>{formatSize(segment.size)}</span>}
                {segment.durationSeconds && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(segment.durationSeconds)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className={cn("text-white", config.color)}>
              {config.label}
            </Badge>
            <Button variant="ghost" size="icon" onClick={onRemove}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-1">
            <Progress value={segment.progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              Enviando... {segment.progress}%
            </p>
          </div>
        )}

        {/* Configuration (only when upload complete) */}
        {isComplete && (
          <>
            {/* Video Type Selector */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Tipo do Vídeo</Label>
              <ToggleGroup 
                type="single" 
                value={segment.videoType}
                onValueChange={(v) => v && handleTypeChange(v as VideoType)}
                className="justify-start"
              >
                <ToggleGroupItem value="first_half" size="sm">1º Tempo</ToggleGroupItem>
                <ToggleGroupItem value="second_half" size="sm">2º Tempo</ToggleGroupItem>
                <ToggleGroupItem value="full" size="sm">Completo</ToggleGroupItem>
                <ToggleGroupItem value="clip" size="sm">Trecho</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Título</Label>
              <Input
                value={segment.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Ex: 1º Tempo - Brasil x Argentina"
              />
            </div>

            {/* Synchronization */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Film className="h-3 w-3" />
                  Minuto Inicial do Jogo
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={segment.startMinute}
                  onChange={(e) => updateField('startMinute', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Film className="h-3 w-3" />
                  Minuto Final do Jogo
                </Label>
                <Input
                  type="number"
                  min={segment.startMinute}
                  max={120}
                  value={segment.endMinute || ''}
                  onChange={(e) => updateField('endMinute', parseInt(e.target.value) || null)}
                  placeholder="90"
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
