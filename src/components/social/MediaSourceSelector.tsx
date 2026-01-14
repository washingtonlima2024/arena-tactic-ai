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
  Clock,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type MediaSourceType = 'url' | 'upload' | 'clip' | 'playlist';

interface MatchEvent {
  id: string;
  event_type: string;
  description: string | null;
  minute: number | null;
  clip_url: string | null;
  match_id: string;
}

interface Match {
  id: string;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  match_date: string | null;
}

interface Playlist {
  id: string;
  name: string;
  video_url: string | null;
  thumbnail_url: string | null;
  target_duration_seconds: number;
  actual_duration_seconds: number | null;
  format: string;
  status: string;
  clip_ids: string[];
  team: { name: string; primary_color: string } | null;
}

interface MediaSourceSelectorProps {
  value: string;
  mediaType: string;
  matchId?: string;
  onChange: (url: string, type: string) => void;
}

export function MediaSourceSelector({ value, mediaType, matchId, onChange }: MediaSourceSelectorProps) {
  const [sourceType, setSourceType] = useState<MediaSourceType>('url');
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | undefined>(matchId);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(value);
  const [uploading, setUploading] = useState(false);

  // Load matches for selection when no matchId is provided
  useEffect(() => {
    if (!matchId) {
      fetchMatches();
    }
  }, [matchId]);

  useEffect(() => {
    if (sourceType === 'clip') {
      fetchEventsWithClips();
    } else if (sourceType === 'playlist') {
      fetchPlaylists();
    }
  }, [sourceType, selectedMatchId]);

  useEffect(() => {
    setUrlInput(value);
  }, [value]);

  const fetchMatches = async () => {
    setLoadingMatches(true);
    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          id, match_date,
          home_team:teams!matches_home_team_id_fkey(name),
          away_team:teams!matches_away_team_id_fkey(name)
        `)
        .eq('status', 'completed')
        .order('match_date', { ascending: false })
        .limit(20);

      if (error) throw error;
      setMatches((data as unknown as Match[]) || []);
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoadingMatches(false);
    }
  };

  const fetchEventsWithClips = async () => {
    setLoadingEvents(true);
    try {
      let query = supabase
        .from('match_events')
        .select('id, event_type, description, minute, clip_url, match_id')
        .not('clip_url', 'is', null);

      if (selectedMatchId) {
        query = query.eq('match_id', selectedMatchId);
      }

      const { data, error } = await query
        .order('minute', { ascending: true })
        .limit(100);

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchPlaylists = async () => {
    setLoadingPlaylists(true);
    try {
      let query = supabase
        .from('playlists')
        .select('*, team:teams(name, primary_color)')
        .eq('status', 'ready')
        .not('video_url', 'is', null);

      if (selectedMatchId) {
        query = query.eq('match_id', selectedMatchId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setPlaylists((data as unknown as Playlist[]) || []);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    } finally {
      setLoadingPlaylists(false);
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
        .from('smart-editor')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('smart-editor')
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
      setSelectedPlaylistId(null);
      onChange(event.clip_url, 'video');
    }
  };

  const handleSelectPlaylist = (playlist: Playlist) => {
    if (playlist.video_url) {
      setSelectedPlaylistId(playlist.id);
      setSelectedEventId(null);
      onChange(playlist.video_url, 'video');
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
      shot: '🎯 Chute',
      shot_on_target: '🎯 Chute no Gol',
    };
    return labels[type] || type;
  };

  const clearMedia = () => {
    setUrlInput('');
    setSelectedEventId(null);
    setSelectedPlaylistId(null);
    onChange('', 'video');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getMatchLabel = (match: Match) => {
    const home = match.home_team?.name || 'Time A';
    const away = match.away_team?.name || 'Time B';
    const date = match.match_date 
      ? format(new Date(match.match_date), 'dd/MM', { locale: ptBR })
      : '';
    return `${home} x ${away}${date ? ` (${date})` : ''}`;
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
          <TabsTrigger value="playlist" className="text-xs gap-1">
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

        <TabsContent value="clip" className="mt-3 space-y-3">
          {/* Match Selector */}
          {!matchId && (
            <Select 
              value={selectedMatchId || ''} 
              onValueChange={(v) => setSelectedMatchId(v || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma partida..." />
              </SelectTrigger>
              <SelectContent>
                {loadingMatches ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  matches.map((match) => (
                    <SelectItem key={match.id} value={match.id}>
                      {getMatchLabel(match)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}

          {loadingEvents ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Scissors className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground text-center">
                  {selectedMatchId 
                    ? 'Nenhum clip disponível para esta partida.'
                    : 'Selecione uma partida para ver os clips.'}
                  <br />
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
                        {event.minute !== null && (
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

        <TabsContent value="playlist" className="mt-3 space-y-3">
          {/* Match Selector */}
          {!matchId && (
            <Select 
              value={selectedMatchId || ''} 
              onValueChange={(v) => setSelectedMatchId(v || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma partida..." />
              </SelectTrigger>
              <SelectContent>
                {loadingMatches ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  matches.map((match) => (
                    <SelectItem key={match.id} value={match.id}>
                      {getMatchLabel(match)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}

          {loadingPlaylists ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : playlists.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <ListVideo className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground text-center">
                  {selectedMatchId 
                    ? 'Nenhuma playlist disponível para esta partida.'
                    : 'Selecione uma partida para ver as playlists.'}
                  <br />
                  Crie playlists na página de Mídia.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[200px] border rounded-lg">
              <div className="p-2 space-y-1">
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    onClick={() => handleSelectPlaylist(playlist)}
                    className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${
                      selectedPlaylistId === playlist.id 
                        ? 'bg-primary/10 border border-primary' 
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div 
                      className="h-10 w-14 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden"
                      style={playlist.team?.primary_color ? { 
                        backgroundColor: `${playlist.team.primary_color}20` 
                      } : undefined}
                    >
                      {playlist.thumbnail_url ? (
                        <img 
                          src={playlist.thumbnail_url} 
                          alt={playlist.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ListVideo className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {playlist.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(playlist.actual_duration_seconds || playlist.target_duration_seconds)}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1">
                          {playlist.format}
                        </Badge>
                        <span>{playlist.clip_ids?.length || 0} clips</span>
                      </div>
                    </div>
                    {selectedPlaylistId === playlist.id && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
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
