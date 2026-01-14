import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Loader2,
  AlertCircle,
  ExternalLink
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
import { apiClient, normalizeStorageUrl } from '@/lib/apiClient';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type MediaSourceType = 'url' | 'upload' | 'clip' | 'playlist';

// Extended interface for clips with thumbnails from local server
interface ClipWithThumbnail {
  id: string;
  event_type: string;
  description: string | null;
  minute: number | null;
  clip_url: string | null;
  match_id: string;
  is_highlight?: boolean | null;
  thumbnail_url?: string | null;
}

interface Match {
  id: string;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  match_date: string | null;
  clips_count?: number;
  events_count?: number;
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
  const navigate = useNavigate();
  // Start on clips tab when matchId is provided (internal use)
  const [sourceType, setSourceType] = useState<MediaSourceType>(matchId ? 'clip' : 'url');
  const [clips, setClips] = useState<ClipWithThumbnail[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | undefined>(matchId);
  const [loadingClips, setLoadingClips] = useState(false);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(value);
  const [uploading, setUploading] = useState(false);

  // Determine if we're in "internal mode" (matchId provided = already in system)
  const isInternalMode = !!matchId;

  // Load matches for selection when no matchId is provided
  useEffect(() => {
    if (!matchId) {
      fetchMatches();
    }
  }, [matchId]);

  useEffect(() => {
    if (sourceType === 'clip') {
      fetchClipsWithThumbnails();
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
      // Fetch matches with clips count
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
      
      // Fetch clips count for each match
      const matchesWithCounts = await Promise.all(
        (data || []).map(async (match: any) => {
          const { count: eventsCount } = await supabase
            .from('match_events')
            .select('*', { count: 'exact', head: true })
            .eq('match_id', match.id)
            .in('event_type', ['goal', 'penalty', 'yellow_card', 'red_card', 'save', 'highlight', 'shot_on_target']);
          
          const { count: clipsCount } = await supabase
            .from('match_events')
            .select('*', { count: 'exact', head: true })
            .eq('match_id', match.id)
            .not('clip_url', 'is', null);
          
          return {
            ...match,
            events_count: eventsCount || 0,
            clips_count: clipsCount || 0
          };
        })
      );
      
      setMatches(matchesWithCounts as Match[]);
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoadingMatches(false);
    }
  };

  // Fetch clips from local server (same source as Media page) + thumbnails
  const fetchClipsWithThumbnails = async () => {
    const targetMatchId = selectedMatchId || matchId;
    if (!targetMatchId) {
      setClips([]);
      return;
    }
    
    setLoadingClips(true);
    try {
      // 1. Fetch events with clip_url from Supabase
      const { data: events, error } = await supabase
        .from('match_events')
        .select('id, event_type, description, minute, clip_url, match_id, is_highlight')
        .eq('match_id', targetMatchId)
        .not('clip_url', 'is', null)
        .in('event_type', ['goal', 'penalty', 'yellow_card', 'red_card', 'save', 'highlight', 'shot_on_target'])
        .order('minute', { ascending: true });

      if (error) throw error;

      // 2. Try to fetch thumbnails from local server storage
      let thumbnailMap: Record<string, string> = {};
      try {
        const imagesResult = await apiClient.listSubfolderFiles(targetMatchId, 'images');
        if (imagesResult?.files) {
          // Map event IDs to their thumbnail URLs
          for (const file of imagesResult.files) {
            // Thumbnails are named: {event_type}-{minute}m-{timestamp}.jpg or cover-{event_id}.jpg
            const eventId = events?.find(e => {
              const filename = file.filename.toLowerCase();
              // Check if thumbnail matches this event by minute and type
              return filename.includes(`${e.event_type}-${e.minute}m`) ||
                     filename.includes(e.id.substring(0, 8));
            })?.id;
            
            if (eventId) {
              thumbnailMap[eventId] = normalizeStorageUrl(file.url) || file.url;
            }
          }
        }
      } catch (e) {
        // Local server not available, continue without thumbnails
        console.log('Could not fetch thumbnails from local server:', e);
      }

      // 3. Merge events with thumbnails
      const clipsWithThumbnails: ClipWithThumbnail[] = (events || []).map(event => ({
        ...event,
        clip_url: normalizeStorageUrl(event.clip_url) || event.clip_url,
        thumbnail_url: thumbnailMap[event.id] || null
      }));

      setClips(clipsWithThumbnails);
    } catch (error) {
      console.error('Error fetching clips:', error);
      setClips([]);
    } finally {
      setLoadingClips(false);
    }
  };

  const fetchPlaylists = async () => {
    setLoadingPlaylists(true);
    try {
      // ONLY show playlists that are COMPILED (have video_url)
      let query = supabase
        .from('playlists')
        .select('*, team:teams(name, primary_color)')
        .not('video_url', 'is', null); // Only compiled playlists

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

  const handleSelectClip = (clip: ClipWithThumbnail) => {
    setSelectedClipId(clip.id);
    setSelectedPlaylistId(null);
    if (clip.clip_url) {
      onChange(clip.clip_url, 'video');
    } else {
      toast({ 
        title: 'Clip não gerado', 
        description: 'Este clip ainda não foi processado. Gere na página de Mídia.',
        variant: 'destructive' 
      });
    }
  };

  const handleSelectPlaylist = (playlist: Playlist) => {
    setSelectedPlaylistId(playlist.id);
    setSelectedClipId(null);
    if (playlist.video_url) {
      onChange(playlist.video_url, 'video');
    } else {
      toast({ 
        title: 'Playlist não compilada', 
        description: 'Esta playlist ainda não foi compilada.',
        variant: 'destructive' 
      });
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
    setSelectedClipId(null);
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

  // All clips in the list are ready (we filtered in the query)
  const readyClipsCount = clips.length;

  // Navigate to media page to generate clips
  const goToMediaPage = () => {
    navigate(`/media?match=${selectedMatchId || matchId}`);
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Film className="h-4 w-4 text-primary" />
        Mídia do Post {!isInternalMode && '(opcional)'}
      </Label>

      <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as MediaSourceType)}>
        {/* Show simplified tabs when in internal mode (matchId provided) */}
        {isInternalMode ? (
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="clip" className="text-xs gap-1">
              <Scissors className="h-3 w-3" />
              Clips Prontos
              {readyClipsCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1">
                  {readyClipsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="playlist" className="text-xs gap-1">
              <ListVideo className="h-3 w-3" />
              Playlists
              {playlists.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1">
                  {playlists.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        ) : (
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
        )}

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
          {/* Match Selector - only when no matchId provided */}
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
                      <div className="flex items-center gap-2">
                        <span>{getMatchLabel(match)}</span>
                        {match.clips_count !== undefined && match.clips_count > 0 && (
                          <Badge className="text-[10px] bg-primary/20 text-primary border-0">
                            {match.clips_count} clips
                          </Badge>
                        )}
                        {match.events_count !== undefined && match.events_count > 0 && match.clips_count === 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            {match.events_count} eventos
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}

          {loadingClips ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : clips.length === 0 ? (
            <Card className="border-dashed border-muted">
              <CardContent className="flex flex-col items-center justify-center py-6">
                <Scissors className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-center mb-1">
                  {selectedMatchId || matchId
                    ? 'Nenhum clip pronto'
                    : 'Selecione uma partida'}
                </p>
                <p className="text-xs text-muted-foreground text-center mb-3">
                  {selectedMatchId || matchId
                    ? 'Gere clips na página de Mídia'
                    : 'Escolha uma partida para ver os clips disponíveis'}
                </p>
                {(selectedMatchId || matchId) && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={goToMediaPage}
                    className="gap-2"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ir para Mídia
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[240px] border rounded-lg">
              <div className="p-2 space-y-1">
                {clips.map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => handleSelectClip(clip)}
                    className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${
                      selectedClipId === clip.id 
                        ? 'bg-primary/10 border border-primary' 
                        : 'hover:bg-muted'
                    }`}
                  >
                    {/* Thumbnail/Cover */}
                    <div className="h-12 w-16 rounded overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                      {clip.thumbnail_url ? (
                        <img 
                          src={clip.thumbnail_url} 
                          alt={clip.event_type}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Play className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {getEventTypeLabel(clip.event_type)}
                        </span>
                        {clip.minute !== null && (
                          <Badge variant="outline" className="text-xs">
                            {clip.minute}'
                          </Badge>
                        )}
                      </div>
                      {clip.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {clip.description}
                        </p>
                      )}
                    </div>
                    {selectedClipId === clip.id && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="playlist" className="mt-3 space-y-3">
          {/* Match Selector - only when no matchId provided */}
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
            <Card className="border-dashed border-muted">
              <CardContent className="flex flex-col items-center justify-center py-6">
                <ListVideo className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-center mb-1">
                  {selectedMatchId || matchId
                    ? 'Nenhuma playlist criada'
                    : 'Selecione uma partida'}
                </p>
                <p className="text-xs text-muted-foreground text-center mb-3">
                  {selectedMatchId || matchId
                    ? 'Crie compilações na página de Mídia'
                    : 'Escolha uma partida para ver as playlists'}
                </p>
                {(selectedMatchId || matchId) && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={goToMediaPage}
                    className="gap-2"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ir para Mídia
                  </Button>
                )}
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
                    } ${!playlist.video_url ? 'opacity-60' : ''}`}
                  >
                    <div 
                      className={`h-10 w-14 rounded flex items-center justify-center shrink-0 overflow-hidden ${
                        playlist.video_url ? 'bg-primary/20' : 'bg-muted'
                      }`}
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
                      ) : playlist.video_url ? (
                        <Play className="h-5 w-5 text-primary" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {playlist.name}
                        </span>
                        {!playlist.video_url && (
                          <Badge variant="secondary" className="text-xs">
                            Não compilada
                          </Badge>
                        )}
                        {playlist.video_url && (
                          <Badge className="text-xs bg-primary/20 text-primary border-0">
                            Pronta
                          </Badge>
                        )}
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
                    {selectedPlaylistId === playlist.id && playlist.video_url && (
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
