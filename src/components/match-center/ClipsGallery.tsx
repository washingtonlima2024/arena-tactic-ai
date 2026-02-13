import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Play, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEventLabel, getEventIcon } from '@/lib/eventLabels';
import { normalizeStorageUrl } from '@/lib/apiClient';
import { ClipPlayerModal } from './ClipPlayerModal';

interface ClipsGalleryProps {
  events: any[];
  thumbnails: any[];
  onPlayClip?: (event: any) => void;
}

export function ClipsGallery({ events, thumbnails }: ClipsGalleryProps) {
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const eventsWithClips = events.filter((e: any) => e.clip_url);
  if (eventsWithClips.length === 0) return null;

  const getThumbnail = (eventId: string) => {
    const thumb = thumbnails.find((t: any) => t.event_id === eventId);
    return thumb?.image_url ? normalizeStorageUrl(thumb.image_url) : null;
  };

  const EVENT_COLORS: Record<string, string> = {
    goal: 'from-emerald-500/30 to-emerald-900/40',
    yellow_card: 'from-yellow-500/30 to-yellow-900/40',
    red_card: 'from-red-500/30 to-red-900/40',
    penalty: 'from-purple-500/30 to-purple-900/40',
    save: 'from-blue-500/30 to-blue-900/40',
    shot: 'from-pink-500/30 to-pink-900/40',
  };

  return (
    <>
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Film className="h-5 w-5 text-primary" />
            Galeria de Clips
            <Badge variant="secondary" className="ml-auto">{eventsWithClips.length} clips</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {eventsWithClips.map((event: any) => {
              const thumb = getThumbnail(event.id);
              const aiComment = (event.metadata as any)?.ai_comment;
              const gradientClass = EVENT_COLORS[event.event_type] || 'from-muted to-muted/50';

              return (
                <div
                  key={event.id}
                  className="group cursor-pointer rounded-xl overflow-hidden border border-border hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5"
                  onClick={() => setSelectedEvent(event)}
                >
                  {/* Thumbnail cover */}
                  <div className={cn("relative aspect-video bg-gradient-to-br overflow-hidden", gradientClass)}>
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-4xl drop-shadow-lg">{getEventIcon(event.event_type)}</span>
                      </div>
                    )}

                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 shadow-xl">
                        <Play className="h-5 w-5 text-black ml-0.5" fill="currentColor" />
                      </div>
                    </div>

                    {/* Minute badge */}
                    <Badge className="absolute top-2 right-2 bg-black/70 text-white border-0 text-xs backdrop-blur-sm">
                      {event.minute}'
                    </Badge>

                    {/* Event type badge */}
                    <div className="absolute bottom-2 left-2">
                      <Badge variant="secondary" className="bg-black/60 text-white border-0 text-[10px] backdrop-blur-sm gap-1">
                        <span>{getEventIcon(event.event_type)}</span>
                        <span className="hidden sm:inline">{getEventLabel(event.event_type)}</span>
                      </Badge>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-2.5 md:p-3 space-y-1.5 bg-card">
                    <span className="font-semibold text-sm text-foreground line-clamp-1">
                      {getEventLabel(event.event_type)}
                    </span>
                    {aiComment && (
                      <div className="flex items-start gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {aiComment}
                        </p>
                      </div>
                    )}
                    {!aiComment && event.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Clip Player Modal */}
      <ClipPlayerModal
        open={!!selectedEvent}
        onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}
        clipUrl={selectedEvent?.clip_url}
        eventType={selectedEvent?.event_type || ''}
        minute={selectedEvent?.minute}
        aiComment={(selectedEvent?.metadata as any)?.ai_comment}
        description={selectedEvent?.description}
        thumbnailUrl={selectedEvent ? getThumbnail(selectedEvent.id) : null}
      />
    </>
  );
}
