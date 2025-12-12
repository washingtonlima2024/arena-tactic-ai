import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Film, Trash2, Clock, FileVideo, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimeInput, formatTimeFromSeconds } from './TimeInput';
import { SyncSlider } from './SyncSlider';

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
  half?: 'first' | 'second'; // Which half this video belongs to
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
    return formatTimeFromSeconds(seconds);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // Suggest sync based on video duration
  const getSuggestion = () => {
    if (!segment.durationSeconds) return null;
    const mins = Math.floor(segment.durationSeconds / 60);
    if (mins >= 40 && mins <= 50) return 'Este vídeo parece ser 1 tempo (~45 min)';
    if (mins >= 85 && mins <= 100) return 'Este vídeo parece ser a partida completa (~90 min)';
    if (mins < 15) return `Trecho de ${mins} minutos`;
    return null;
  };

  const suggestion = getSuggestion();
  const isUploading = segment.status === 'uploading';
  const isComplete = segment.status === 'complete' || segment.status === 'ready';

  return (
    <Card variant="glass" className={cn(
      "relative transition-all",
      isUploading && "border-primary/50",
      segment.status === 'error' && "border-destructive/50",
      segment.half === 'first' && "border-l-4 border-l-blue-500",
      segment.half === 'second' && "border-l-4 border-l-orange-500"
    )}>
      {/* Index Badge */}
      <div className={cn(
        "absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white",
        segment.half === 'first' ? 'bg-blue-500' : segment.half === 'second' ? 'bg-orange-500' : 'bg-primary'
      )}>
        {index + 1}
      </div>

      <CardContent className="pt-6 space-y-4">
        {/* Header with name and actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {segment.isLink ? (
              <Link2 className="h-5 w-5 text-blue-400 shrink-0" />
            ) : (
              <FileVideo className={cn(
                "h-5 w-5 shrink-0",
                segment.half === 'first' ? 'text-blue-400' : segment.half === 'second' ? 'text-orange-400' : 'text-emerald-400'
              )} />
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
            {/* Suggestion */}
            {suggestion && (
              <div className="text-xs text-primary bg-primary/10 rounded-lg px-3 py-2 flex items-center gap-2">
                <Clock className="h-3 w-3" />
                {suggestion}
              </div>
            )}

            {/* Video Type Selector */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Tipo do Vídeo</Label>
              <ToggleGroup 
                type="single" 
                value={segment.videoType}
                onValueChange={(v) => v && handleTypeChange(v as VideoType)}
                className="justify-start"
              >
                <ToggleGroupItem value="first_half" size="sm" className="data-[state=on]:bg-blue-500 data-[state=on]:text-white">
                  1º Tempo
                </ToggleGroupItem>
                <ToggleGroupItem value="second_half" size="sm" className="data-[state=on]:bg-orange-500 data-[state=on]:text-white">
                  2º Tempo
                </ToggleGroupItem>
                <ToggleGroupItem value="full" size="sm" className="data-[state=on]:bg-emerald-500 data-[state=on]:text-white">
                  Completo
                </ToggleGroupItem>
                <ToggleGroupItem value="clip" size="sm" className="data-[state=on]:bg-purple-500 data-[state=on]:text-white">
                  Trecho
                </ToggleGroupItem>
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

            {/* Synchronization with Slider */}
            <div className="space-y-3 p-3 rounded-lg bg-muted/20 border border-border/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Film className="h-4 w-4 text-primary" />
                Sincronização com o Jogo
              </div>

              <SyncSlider
                startMinute={segment.startMinute}
                endMinute={segment.endMinute || 90}
                onStartChange={(v) => updateField('startMinute', v)}
                onEndChange={(v) => updateField('endMinute', v)}
              />

              {/* Mini Timeline Preview */}
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "absolute top-0 bottom-0 rounded-full",
                    segment.videoType === 'first_half' ? 'bg-blue-500' :
                    segment.videoType === 'second_half' ? 'bg-orange-500' :
                    segment.videoType === 'full' ? 'bg-emerald-500' : 'bg-purple-500'
                  )}
                  style={{
                    left: `${(segment.startMinute / 90) * 100}%`,
                    width: `${(((segment.endMinute || 90) - segment.startMinute) / 90) * 100}%`,
                  }}
                />
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border/50" />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
