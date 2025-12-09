import { useState } from 'react';
import { Play, GripVertical, Clock, Tag } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface SmartClip {
  id: string;
  start_second: number;
  end_second: number;
  title: string | null;
  event_type: string | null;
  confidence: number | null;
  is_enabled: boolean;
  sort_order: number | null;
}

interface ClipsListProps {
  clips: SmartClip[];
  onToggleClip: (clipId: string, enabled: boolean) => void;
  onPreviewClip?: (clip: SmartClip) => void;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getEventTypeColor = (type: string | null): string => {
  switch (type?.toLowerCase()) {
    case 'gol':
    case 'goal':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'comentário':
    case 'comment':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'reação':
    case 'reaction':
      return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
    case 'engraçado':
    case 'funny':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'importante':
    case 'important':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

export const ClipsList = ({
  clips,
  onToggleClip,
  onPreviewClip
}: ClipsListProps) => {
  const enabledCount = clips.filter(c => c.is_enabled).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          Clips Detectados
        </h3>
        <Badge variant="outline" className="text-arena-green border-arena-green/30">
          {enabledCount} de {clips.length} selecionados
        </Badge>
      </div>

      <div className="space-y-2">
        {clips.map((clip, index) => (
          <div
            key={clip.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
              clip.is_enabled 
                ? 'bg-card border-arena-green/30' 
                : 'bg-muted/30 border-border opacity-60'
            }`}
          >
            <div className="cursor-grab text-muted-foreground hover:text-foreground">
              <GripVertical className="w-4 h-4" />
            </div>

            <Checkbox
              checked={clip.is_enabled}
              onCheckedChange={(checked) => onToggleClip(clip.id, !!checked)}
              className="border-arena-green data-[state=checked]:bg-arena-green"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">
                  #{index + 1}
                </span>
                <p className="text-sm font-medium text-foreground truncate">
                  {clip.title || `Clip ${index + 1}`}
                </p>
              </div>
              
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatTime(clip.start_second)} - {formatTime(clip.end_second)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({Math.round(clip.end_second - clip.start_second)}s)
                </span>
              </div>
            </div>

            {clip.event_type && (
              <Badge 
                variant="outline" 
                className={`text-xs ${getEventTypeColor(clip.event_type)}`}
              >
                <Tag className="w-3 h-3 mr-1" />
                {clip.event_type}
              </Badge>
            )}

            {clip.confidence && (
              <span className="text-xs text-muted-foreground">
                {Math.round(clip.confidence * 100)}%
              </span>
            )}

            {onPreviewClip && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPreviewClip(clip)}
                className="text-arena-green hover:text-arena-green hover:bg-arena-green/10"
              >
                <Play className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}

        {clips.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhum clip detectado ainda.</p>
            <p className="text-sm mt-1">Faça upload de um vídeo para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClipsList;
