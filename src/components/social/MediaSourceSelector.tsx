import { useState, useEffect } from 'react';
import {
  Link2,
  Upload,
  Film,
  ImageIcon,
  Play,
  Scissors,
  ListVideo,
  X,
  Check,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type MediaSourceType = 'url' | 'upload' | 'clip' | 'playlist';

interface MatchEvent {
  id: string;
  event_type: string;
  description: string | null;
  minute: number | null;
  clip_url: string | null;
  match_id: string;
}

interface MediaSourceSelectorProps {
  value: string;
  mediaType: string;
  onChange: (url: string, type: string) => void;
}

export function MediaSourceSelector({ value, mediaType, onChange }: MediaSourceSelectorProps) {
  const [sourceType, setSourceType] = useState<MediaSourceType>('url');
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(value);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (sourceType === 'clip') {
      fetchEventsWithClips();
    }
  }, [sourceType]);

  useEffect(() => {
    setUrlInput(value);
  }, [value]);

  const fetchEventsWithClips = async () => {
    setLoadingEvents(true);
    try {
      const { data, error } = await supabase
        .from('match_events')
        .select('id, event_type, description, minute, clip_url, match_id')
        .not('clip_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleUrlChange = (url: string) => {
    setUrlInput(url);
    const type = detectMediaType(url);
    onChange(url, type);
  };

  const detectMediaType = (url: string): string => {
    if (!url) return 'video';
    const lower = url.toLowerCase();
    if (lower.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/)) return 'image';
    if (lower.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/)) return 'video';
    return 'video';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      toast({ title: 'Arquivo inválido', description: 'Envie uma imagem ou vídeo', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `social-media/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      onChange(publicUrl, isVideo ? 'video' : 'image');
      toast({ title: 'Arquivo enviado!' });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSelectClip = (event: MatchEvent) => {
    if (event.clip_url) {
      setSelectedEventId(event.id);
      onChange(event.clip_url, 'video');
    }
  };

  const getEventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      goal: '⚽ Gol',
      penalty: '🎯 Pênalti',
      yellow_card: '🟨 Cartão Amarelo',
      red_card: '🟥 Cartão Vermelho',
      foul: '⚠️ Falta',
      corner: '📐 Escanteio',
      offside: '🚩 Impedimento',
      save: '🧤 Defesa',
      substitution: '🔄 Substituição',
      highlight: '⭐ Destaque',
    };
    return labels[type] || type;
  };

  const clearMedia = () => {
    setUrlInput('');
    setSelectedEventId(null);
    onChange('', 'video');
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Film className="h-4 w-4 text-primary" />
        Mídia do Post (opcional)
      </Label>

      <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as MediaSourceType)}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="url" className="text-xs gap-1">
            <Link2 className="h-3 w-3" />
            Link
          </TabsTrigger>
          <TabsTrigger value="upload" className="text-xs gap-1">
            <Upload className="h-3 w-3" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="clip" className="text-xs gap-1">
            <Scissors className="h-3 w-3" />
            Clips
          </TabsTrigger>
          <TabsTrigger value="playlist" className="text-xs gap-1" disabled>
            <ListVideo className="h-3 w-3" />
            Playlist
          </TabsTrigger>
        </TabsList>

        <TabsContent value="url" className="space-y-2 mt-3">
          <Input
            placeholder="https://..."
            value={urlInput}
            onChange={(e) => handleUrlChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Cole o link de uma imagem ou vídeo
          </p>
        </TabsContent>

        <TabsContent value="upload" className="mt-3">
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleFileUpload}
              className="hidden"
              id="media-upload"
              disabled={uploading}
            />
            <label htmlFor="media-upload" className="cursor-pointer">
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <span className="text-sm text-muted-foreground">Enviando...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">Clique para enviar</span>
                  <span className="text-xs text-muted-foreground">Imagem ou vídeo do computador</span>
                </div>
              )}
            </label>
          </div>
        </TabsContent>

        <TabsContent value="clip" className="mt-3">
          {loadingEvents ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Scissors className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground text-center">
                  Nenhum clip disponível.<br />
                  Gere clips na página de Eventos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[200px] border rounded-lg">
              <div className="p-2 space-y-1">
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => handleSelectClip(event)}
                    className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${
                      selectedEventId === event.id 
                        ? 'bg-primary/10 border border-primary' 
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                      <Play className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {getEventTypeLabel(event.event_type)}
                        </span>
                        {event.minute && (
                          <Badge variant="outline" className="text-xs">
                            {event.minute}'
                          </Badge>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {event.description}
                        </p>
                      )}
                    </div>
                    {selectedEventId === event.id && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="playlist" className="mt-3">
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <ListVideo className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground text-center">
                Em breve: selecione compilações<br />
                da playlist ArenaPlay
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Selected Media Preview */}
      {value && (
        <Card className="bg-muted/30">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="h-12 w-16 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
              {mediaType === 'image' ? (
                <img src={value} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <Film className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {mediaType === 'image' ? (
                    <><ImageIcon className="h-3 w-3 mr-1" /> Imagem</>
                  ) : (
                    <><Film className="h-3 w-3 mr-1" /> Vídeo</>
                  )}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-1">
                {value}
              </p>
            </div>
            <Button 
              type="button"
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 shrink-0"
              onClick={clearMedia}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
