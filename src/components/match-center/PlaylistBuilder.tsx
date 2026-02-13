import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ListVideo,
  Play,
  GripVertical,
  Plus,
  Trash2,
  Upload,
  Film,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Sparkles,
  Download,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEventLabel, getEventIcon } from '@/lib/eventLabels';
import { normalizeStorageUrl } from '@/lib/apiClient';
import { toast } from 'sonner';

interface PlaylistBuilderProps {
  events: any[];
  thumbnails: any[];
  matchId?: string;
}

interface PlaylistEntry {
  id: string;
  type: 'clip' | 'transition' | 'promo';
  eventId?: string;
  eventType?: string;
  minute?: number;
  clipUrl?: string;
  thumbnailUrl?: string | null;
  label: string;
  description?: string;
  file?: File;
  previewUrl?: string;
}

export function PlaylistBuilder({ events, thumbnails, matchId }: PlaylistBuilderProps) {
  const [entries, setEntries] = useState<PlaylistEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const eventsWithClips = useMemo(
    () => events.filter((e: any) => e.clip_url),
    [events]
  );

  const getThumbnail = useCallback(
    (eventId: string) => {
      const t = thumbnails.find((th: any) => th.event_id === eventId);
      return t?.image_url ? normalizeStorageUrl(t.image_url) : null;
    },
    [thumbnails]
  );

  const addClip = useCallback(
    (event: any) => {
      const alreadyAdded = entries.some((e) => e.eventId === event.id);
      if (alreadyAdded) {
        toast.info('Clip já adicionado à playlist');
        return;
      }
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'clip',
          eventId: event.id,
          eventType: event.event_type,
          minute: event.minute,
          clipUrl: event.clip_url,
          thumbnailUrl: getThumbnail(event.id),
          label: `${event.minute}' - ${getEventLabel(event.event_type)}`,
          description: (event.metadata as any)?.ai_comment || event.description,
        },
      ]);
    },
    [entries, getThumbnail]
  );

  const addTransition = useCallback(() => {
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: 'transition',
        label: 'Transição',
        description: 'Efeito entre clips',
      },
    ]);
  }, []);

  const handlePromoUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');

      if (!isVideo && !isImage) {
        toast.error('Formato não suportado. Use vídeo ou imagem.');
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'promo',
          label: file.name,
          description: isVideo ? 'Vídeo promocional' : 'Imagem promocional',
          file,
          previewUrl,
        },
      ]);
      // Reset input
      e.target.value = '';
    },
    []
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  const moveEntry = useCallback((index: number, direction: 'up' | 'down') => {
    setEntries((prev) => {
      const newEntries = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newEntries.length) return prev;
      [newEntries[index], newEntries[targetIndex]] = [newEntries[targetIndex], newEntries[index]];
      return newEntries;
    });
  }, []);

  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setEntries((prev) => {
      const newEntries = [...prev];
      const [dragged] = newEntries.splice(draggedIndex, 1);
      newEntries.splice(index, 0, dragged);
      return newEntries;
    });
    setDraggedIndex(index);
  };
  const handleDragEnd = () => setDraggedIndex(null);

  const clipCount = entries.filter((e) => e.type === 'clip').length;
  const promoCount = entries.filter((e) => e.type === 'promo').length;

  if (!isOpen) {
    return (
      <Card className="border-primary/20">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ListVideo className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Montar Playlist de Destaques</h3>
                <p className="text-sm text-muted-foreground">
                  Selecione clips, adicione transições e propaganda
                </p>
              </div>
            </div>
            <Button onClick={() => setIsOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Montar Playlist
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListVideo className="h-5 w-5 text-primary" />
            Playlist de Destaques
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{clipCount} clips</Badge>
            {promoCount > 0 && <Badge variant="outline">{promoCount} promos</Badge>}
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Available clips ── */}
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Film className="h-4 w-4" />
            Clips Disponíveis ({eventsWithClips.length})
          </Label>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {eventsWithClips.map((event: any) => {
              const thumb = getThumbnail(event.id);
              const alreadyAdded = entries.some((e) => e.eventId === event.id);
              return (
                <button
                  key={event.id}
                  onClick={() => addClip(event)}
                  disabled={alreadyAdded}
                  className={cn(
                    'flex-shrink-0 w-28 rounded-lg overflow-hidden border transition-all',
                    alreadyAdded
                      ? 'border-primary/40 opacity-50 cursor-not-allowed'
                      : 'border-border hover:border-primary/60 hover:scale-105'
                  )}
                >
                  <div className="aspect-video bg-muted/50 relative flex items-center justify-center">
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">{getEventIcon(event.event_type)}</span>
                    )}
                    {alreadyAdded && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Badge className="bg-primary text-primary-foreground text-[10px]">✓</Badge>
                      </div>
                    )}
                  </div>
                  <div className="p-1.5 bg-card text-center">
                    <span className="text-[11px] font-medium">{event.minute}' {getEventLabel(event.event_type)}</span>
                  </div>
                </button>
              );
            })}
            {eventsWithClips.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                Nenhum clip disponível. Processe os vídeos na página de eventos.
              </p>
            )}
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-2 border-t border-b border-border py-3">
          <Button variant="outline" size="sm" onClick={addTransition} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Transição
          </Button>
          <Label
            htmlFor="promo-upload"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Propaganda
          </Label>
          <input
            id="promo-upload"
            type="file"
            accept="video/*,image/*"
            className="hidden"
            onChange={handlePromoUpload}
          />
          {entries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={() => {
                entries.forEach((e) => e.previewUrl && URL.revokeObjectURL(e.previewUrl));
                setEntries([]);
              }}
            >
              Limpar tudo
            </Button>
          )}
        </div>

        {/* ── Playlist timeline ── */}
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ListVideo className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              Clique nos clips acima para adicioná-los à playlist
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Você pode reordenar arrastando e adicionar transições entre os clips
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {entries.map((entry, index) => (
              <div
                key={entry.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg border transition-all group',
                  entry.type === 'clip' && 'bg-card border-border hover:border-primary/30',
                  entry.type === 'transition' && 'bg-primary/5 border-primary/20',
                  entry.type === 'promo' && 'bg-accent/50 border-accent',
                  draggedIndex === index && 'opacity-50 scale-[0.98]'
                )}
              >
                {/* Drag handle */}
                <div className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                </div>

                {/* Order number */}
                <Badge variant="outline" className="h-6 w-6 p-0 flex items-center justify-center text-[10px] shrink-0">
                  {index + 1}
                </Badge>

                {/* Thumbnail / icon */}
                <div className="h-10 w-16 rounded overflow-hidden bg-muted/50 flex items-center justify-center shrink-0">
                  {entry.type === 'clip' && entry.thumbnailUrl ? (
                    <img src={entry.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : entry.type === 'clip' && entry.eventType ? (
                    <span className="text-lg">{getEventIcon(entry.eventType)}</span>
                  ) : entry.type === 'promo' && entry.previewUrl ? (
                    entry.file?.type.startsWith('image/') ? (
                      <img src={entry.previewUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Film className="h-4 w-4 text-muted-foreground" />
                    )
                  ) : entry.type === 'transition' ? (
                    <Sparkles className="h-4 w-4 text-primary" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.label}</p>
                  {entry.description && (
                    <p className="text-[11px] text-muted-foreground truncate">{entry.description}</p>
                  )}
                </div>

                {/* Type badge */}
                <Badge
                  variant={entry.type === 'clip' ? 'secondary' : entry.type === 'promo' ? 'outline' : 'default'}
                  className={cn(
                    'text-[10px] shrink-0',
                    entry.type === 'transition' && 'bg-primary/20 text-primary border-primary/30'
                  )}
                >
                  {entry.type === 'clip' ? 'Clip' : entry.type === 'transition' ? 'Transição' : 'Promo'}
                </Badge>

                {/* Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveEntry(index, 'up')}
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveEntry(index, 'down')}
                    disabled={index === entries.length - 1}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeEntry(entry.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Export button ── */}
        {entries.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {entries.length} itens na playlist
            </p>
            <Button
              className="gap-2"
              onClick={() => {
                toast.success(`Playlist com ${entries.length} itens pronta para exportação!`);
              }}
            >
              <Download className="h-4 w-4" />
              Exportar Playlist
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
