import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Play, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEventLabel, getEventIcon } from '@/lib/eventLabels';
import { normalizeStorageUrl } from '@/lib/apiClient';

interface ClipsGalleryProps {
  events: any[];
  thumbnails: any[];
  onPlayClip: (event: any) => void;
}

export function ClipsGallery({ events, thumbnails, onPlayClip }: ClipsGalleryProps) {
  // Only show events that have clips
  const eventsWithClips = events.filter((e: any) => e.clip_url);
  
  if (eventsWithClips.length === 0) return null;

  const getThumbnail = (eventId: string) => {
    const thumb = thumbnails.find((t: any) => t.event_id === eventId);
    return thumb?.image_url ? normalizeStorageUrl(thumb.image_url) : null;
  };

  const EVENT_COLORS: Record<string, string> = {
    goal: 'from-emerald-500/30 to-emerald-800/20',
    yellow_card: 'from-yellow-500/30 to-yellow-800/20',
    red_card: 'from-red-500/30 to-red-800/20',
    penalty: 'from-purple-500/30 to-purple-800/20',
    save: 'from-blue-500/30 to-blue-800/20',
    shot: 'from-pink-500/30 to-pink-800/20',
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Film className="h-5 w-5 text-primary" />
          Galeria de Clips
          <Badge variant="secondary" className="ml-auto">{eventsWithClips.length} clips</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {eventsWithClips.map((event: any) => {
            const thumb = getThumbnail(event.id);
            const aiComment = (event.metadata as any)?.ai_comment;
            const gradientClass = EVENT_COLORS[event.event_type] || 'from-muted to-muted/50';

            return (
              <div
                key={event.id}
                className="group cursor-pointer rounded-xl overflow-hidden border border-border hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10"
                onClick={() => onPlayClip(event)}
              >
                {/* Thumbnail / Cover */}
                <div className={cn("relative aspect-video bg-gradient-to-br", gradientClass)}>
                  {thumb ? (
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-4xl">{getEventIcon(event.event_type)}</span>
                    </div>
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                      <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                    </div>
                  </div>
                  {/* Minute badge */}
                  <Badge className="absolute top-2 right-2 bg-black/70 text-white border-0 text-xs">
                    {event.minute}'
                  </Badge>
                </div>

                {/* Info */}
                <div className="p-3 space-y-2 bg-card">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{getEventIcon(event.event_type)}</span>
                    <span className="font-semibold text-sm">{getEventLabel(event.event_type)}</span>
                  </div>
                  {aiComment && (
                    <div className="flex items-start gap-1.5">
                      <Sparkles className="h-3 w-3 text-primary mt-1 flex-shrink-0" />
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                        {aiComment}
                      </p>
                    </div>
                  )}
                  {!aiComment && event.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
