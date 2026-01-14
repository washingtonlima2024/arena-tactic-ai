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
      // 1. Fetch physical clips from local server (same as Media page)
      let clipsByHalf: { first_half: any[]; second_half: any[]; full: any[]; extra: any[] } | null = null;
      let imagesResult: { files: any[] } | null = null;
      
      try {
        clipsByHalf = await apiClient.getClipsByHalf(targetMatchId);
        imagesResult = await apiClient.listSubfolderFiles(targetMatchId, 'images');
      } catch (e) {
        console.log('Local server not available:', e);
      }

      // 2. Fetch events from Supabase for metadata (description, type, minute)
      const { data: events } = await supabase
        .from('match_events')
        .select('id, event_type, description, minute, clip_url, match_id, is_highlight, metadata')
        .eq('match_id', targetMatchId)
        .in('event_type', ['goal', 'penalty', 'yellow_card', 'red_card', 'save', 'highlight', 'shot_on_target', 'foul', 'corner', 'offside'])
        .order('minute', { ascending: true });

      // 3. Build thumbnail map from local images
      const thumbnailMap: Record<string, string> = {};
      const thumbnailByMinute: Record<string, string> = {};
      
      if (imagesResult?.files) {
        for (const file of imagesResult.files) {
          const filename = file.filename.toLowerCase();
          const normalizedUrl = normalizeStorageUrl(file.url) || file.url;
          
          // Extract minute from filename (e.g., goal-24m-xxx.jpg)
          const minuteMatch = filename.match(/-(\d+)m[-\.]/);
          if (minuteMatch) {
            const minute = minuteMatch[1];
            const eventType = filename.split('-')[0];
            thumbnailByMinute[`${eventType}-${minute}`] = normalizedUrl;
          }
        }
      }

      // 4. Combine clips from local server with Supabase metadata
      const allPhysicalClips = [
        ...(clipsByHalf?.first_half || []),
        ...(clipsByHalf?.second_half || []),
        ...(clipsByHalf?.full || []),
        ...(clipsByHalf?.extra || [])
      ];

      const clipsWithThumbnails: ClipWithThumbnail[] = [];
      const processedMinutes = new Set<string>();

      // First: Add clips from local server with metadata from Supabase
      for (const clip of allPhysicalClips) {
        const filename = clip.filename?.toLowerCase() || '';
        
        // Extract event type and minute from filename (e.g., goal-24m-1234567890.mp4)
        const parts = filename.split('-');
        const eventType = parts[0] || 'highlight';
        const minuteMatch = filename.match(/-(\d+)m[-\.]/);
        const clipMinute = minuteMatch ? parseInt(minuteMatch[1]) : null;
        
        // Find matching event in Supabase
        const matchingEvent = events?.find(e => 
          e.minute === clipMinute && 
          (e.event_type === eventType || eventType === 'highlight')
        ) || events?.find(e => e.minute === clipMinute);

        const clipId = matchingEvent?.id || `local-${filename}`;
        const key = `${eventType}-${clipMinute}`;
        
        if (processedMinutes.has(key)) continue;
        processedMinutes.add(key);

        clipsWithThumbnails.push({
          id: clipId,
          event_type: matchingEvent?.event_type || eventType,
          description: matchingEvent?.description || `${getEventTypeLabel(eventType)} ${clipMinute ? `(${clipMinute}')` : ''}`,
          minute: clipMinute,
          clip_url: normalizeStorageUrl(clip.url) || clip.url,
          match_id: targetMatchId,
          is_highlight: matchingEvent?.is_highlight,
          thumbnail_url: thumbnailByMinute[key] || null
        });
      }

      // Second: Add any Supabase events with clip_url not found in local server
      for (const event of (events || [])) {
        if (!event.clip_url) continue;
        
        const key = `${event.event_type}-${event.minute}`;
        if (processedMinutes.has(key)) continue;
        processedMinutes.add(key);

        clipsWithThumbnails.push({
          id: event.id,
          event_type: event.event_type,
          description: event.description,
          minute: event.minute,
          clip_url: normalizeStorageUrl(event.clip_url) || event.clip_url,
          match_id: targetMatchId,
          is_highlight: event.is_highlight,
          thumbnail_url: thumbnailByMinute[key] || null
        });
      }

      // Sort by minute
      clipsWithThumbnails.sort((a, b) => (a.minute || 0) - (b.minute || 0));

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
      // Show ALL playlists (compiled first, then pending)
      let query = supabase
        .from('playlists')
        .select('*, team:teams(name, primary_color)');

      if (selectedMatchId || matchId) {
        query = query.eq('match_id', selectedMatchId || matchId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      // Sort: compiled playlists first
      const sorted = (data || []).sort((a: any, b: any) => {
        if (a.video_url && !b.video_url) return -1;
        if (!a.video_url && b.video_url) return 1;
        return 0;
      });
      
      setPlaylists((sorted as unknown as Playlist[]) || []);
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
    if (playlist.video_url) {
      setSelectedPlaylistId(playlist.id);
      setSelectedClipId(null);
      onChange(playlist.video_url, 'video');
    } else {
      toast({ 
        title: 'Playlist não compilada', 
        description: 'Vá para a página de Mídia para compilar esta playlist.',
        variant: 'destructive' 
      });
    }
  };

  const getEventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      goal: 'Gol',
      penalty: 'Pênalti',
      yellow_card: 'Cartão Amarelo',
      red_card: 'Cartão Vermelho',
      foul: 'Falta',
      corner: 'Escanteio',
      offside: 'Impedimento',
      save: 'Defesa',
      substitution: 'Substituição',
      highlight: 'Destaque',
      shot: 'Chute',
      shot_on_target: 'Chute no Gol',
    };
    return labels[type] || type;
  };

  const getEventCategoryIcon = (type: string) => {
    const icons: Record<string, string> = {
      goal: '⚽',
      penalty: '🎯',
      yellow_card: '🟨',
      red_card: '🟥',
      foul: '⚠️',
      save: '🧤',
      shot: '🎯',
      shot_on_target: '🎯',
      highlight: '⭐',
    };
    return icons[type] || '📹';
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, { label: string; icon: string }> = {
      goals: { label: 'GOLS', icon: '⚽' },
      shots: { label: 'FINALIZAÇÕES', icon: '🎯' },
      cards: { label: 'CARTÕES', icon: '🟨' },
      defensive: { label: 'JOGADAS DEFENSIVAS', icon: '🧤' },
      highlights: { label: 'DESTAQUES', icon: '⭐' },
    };
    return labels[category] || { label: category.toUpperCase(), icon: '📹' };
  };

  // Group clips by category
  const groupedClips = clips.reduce((acc, clip) => {
    let category = 'highlights';
    if (clip.event_type === 'goal' || clip.event_type === 'penalty') {
      category = 'goals';
    } else if (clip.event_type === 'shot' || clip.event_type === 'shot_on_target') {
      category = 'shots';
    } else if (clip.event_type === 'yellow_card' || clip.event_type === 'red_card') {
      category = 'cards';
    } else if (clip.event_type === 'save' || clip.event_type === 'foul') {
      category = 'defensive';
    }
    
    if (!acc[category]) acc[category] = [];
    acc[category].push(clip);
    return acc;
  }, {} as Record<string, ClipWithThumbnail[]>);

  // Order categories
  const categoryOrder = ['goals', 'shots', 'cards', 'defensive', 'highlights'];

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
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-xs">
        <Film className="h-3.5 w-3.5 text-primary" />
        Mídia {!isInternalMode && '(opcional)'}
      </Label>

      <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as MediaSourceType)}>
        <TabsList className="grid grid-cols-4 w-full h-8">
          <TabsTrigger value="url" className="text-[10px] gap-1 px-1.5">
            <Link2 className="h-3 w-3" />
            <span className="hidden sm:inline">Link</span>
          </TabsTrigger>
          <TabsTrigger value="upload" className="text-[10px] gap-1 px-1.5">
            <Upload className="h-3 w-3" />
            <span className="hidden sm:inline">Upload</span>
          </TabsTrigger>
          <TabsTrigger value="clip" className="text-[10px] gap-1 px-1.5">
            <Scissors className="h-3 w-3" />
            <span className="hidden sm:inline">Clips</span>
            {readyClipsCount > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 h-4 min-w-4">
                {readyClipsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="playlist" className="text-[10px] gap-1 px-1.5">
            <ListVideo className="h-3 w-3" />
            <span className="hidden sm:inline">Playlists</span>
            {playlists.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 h-4 min-w-4">
                {playlists.filter(p => p.video_url).length}/{playlists.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="url" className="space-y-1.5 mt-2">
          <Input
            placeholder="https://..."
            className="h-8 text-xs"
            value={urlInput}
            onChange={(e) => handleUrlChange(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">
            Cole o link de uma imagem ou vídeo
          </p>
        </TabsContent>

        <TabsContent value="upload" className="mt-2">
          <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
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
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground">Enviando...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium">Clique para enviar</span>
                </div>
              )}
            </label>
          </div>
        </TabsContent>

        <TabsContent value="clip" className="mt-2 space-y-2">
          {/* Match Selector - only when no matchId provided */}
          {!matchId && (
            <Select 
              value={selectedMatchId || ''} 
              onValueChange={(v) => setSelectedMatchId(v || undefined)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione uma partida..." />
              </SelectTrigger>
              <SelectContent>
                {loadingMatches ? (
                  <div className="flex items-center justify-center p-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  matches.map((match) => (
                    <SelectItem key={match.id} value={match.id} className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <span>{getMatchLabel(match)}</span>
                        {match.clips_count !== undefined && match.clips_count > 0 && (
                          <Badge className="text-[9px] px-1 h-4 bg-primary/20 text-primary border-0">
                            {match.clips_count}
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
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : clips.length === 0 ? (
            <Card className="border-dashed border-muted">
              <CardContent className="flex flex-col items-center justify-center py-4">
                <Scissors className="h-6 w-6 text-muted-foreground mb-1.5" />
                <p className="text-xs font-medium text-center mb-0.5">
                  {selectedMatchId || matchId ? 'Nenhum clip pronto' : 'Selecione uma partida'}
                </p>
                {(selectedMatchId || matchId) && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="h-7 text-[10px] gap-1 mt-2"
                    onClick={goToMediaPage}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ir para Mídia
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[180px] border rounded-lg bg-background/50">
              <div className="p-2 grid grid-cols-2 gap-1.5">
                {clips.map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => handleSelectClip(clip)}
                    className={`flex items-center gap-1.5 p-1.5 rounded-md text-left transition-colors ${
                      selectedClipId === clip.id 
                        ? 'bg-primary/10 ring-1 ring-primary' 
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {/* Compact Thumbnail */}
                    <div className="h-8 w-12 rounded overflow-hidden shrink-0 bg-muted relative">
                      {clip.thumbnail_url ? (
                        <img 
                          src={clip.thumbnail_url} 
                          alt={clip.event_type}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-muted">
                          <Film className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      {selectedClipId === clip.id && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                      )}
                    </div>
                    
                    {/* Compact Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium truncate leading-tight">
                        {getEventTypeLabel(clip.event_type)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {clip.minute !== null ? `${clip.minute}'` : ''}
                      </p>
                    </div>
                    
                    {/* Type Icon */}
                    <span className="text-xs shrink-0">{getEventCategoryIcon(clip.event_type)}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="playlist" className="mt-2 space-y-2">
          {/* Match Selector - only when no matchId provided */}
          {!matchId && (
            <Select 
              value={selectedMatchId || ''} 
              onValueChange={(v) => setSelectedMatchId(v || undefined)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione uma partida..." />
              </SelectTrigger>
              <SelectContent>
                {loadingMatches ? (
                  <div className="flex items-center justify-center p-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  matches.map((match) => (
                    <SelectItem key={match.id} value={match.id} className="text-xs">
                      {getMatchLabel(match)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}

          {loadingPlaylists ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : playlists.length === 0 ? (
            <Card className="border-dashed border-muted">
              <CardContent className="flex flex-col items-center justify-center py-4">
                <ListVideo className="h-6 w-6 text-muted-foreground mb-1.5" />
                <p className="text-xs font-medium text-center mb-0.5">
                  {selectedMatchId || matchId ? 'Nenhuma playlist' : 'Selecione uma partida'}
                </p>
                {(selectedMatchId || matchId) && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="h-7 text-[10px] gap-1 mt-2"
                    onClick={goToMediaPage}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ir para Mídia
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[150px] border rounded-lg">
              <div className="p-1.5 space-y-1">
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    onClick={() => handleSelectPlaylist(playlist)}
                    className={`w-full flex items-center gap-2 p-1.5 rounded-md text-left transition-colors ${
                      selectedPlaylistId === playlist.id 
                        ? 'bg-primary/10 ring-1 ring-primary' 
                        : 'hover:bg-muted/50'
                    } ${!playlist.video_url ? 'opacity-60' : ''}`}
                  >
                    <div 
                      className={`h-8 w-12 rounded flex items-center justify-center shrink-0 overflow-hidden ${
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
                        <Play className="h-3 w-3 text-primary" />
                      ) : (
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium truncate leading-tight">
                        {playlist.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                        <span>{formatDuration(playlist.actual_duration_seconds || playlist.target_duration_seconds)}</span>
                        <span>•</span>
                        <span>{playlist.clip_ids?.length || 0} clips</span>
                      </div>
                    </div>
                    {selectedPlaylistId === playlist.id && playlist.video_url && (
                      <Check className="h-3 w-3 text-primary shrink-0" />
                    )}
                    {playlist.video_url && !selectedPlaylistId && (
                      <Badge className="text-[8px] px-1 h-4 bg-primary/20 text-primary border-0 shrink-0">
                        Pronta
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      {/* Compact Selected Media Preview */}
      {value && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border">
          <div className="h-8 w-12 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
            {mediaType === 'image' ? (
              <img src={value} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <Film className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <Badge variant="secondary" className="text-[9px] px-1 h-4">
              {mediaType === 'image' ? (
                <><ImageIcon className="h-2.5 w-2.5 mr-0.5" /> Imagem</>
              ) : (
                <><Film className="h-2.5 w-2.5 mr-0.5" /> Vídeo</>
              )}
            </Badge>
            <p className="text-[9px] text-muted-foreground truncate mt-0.5">
              {value.split('/').pop()?.substring(0, 30)}...
            </p>
          </div>
          <Button 
            type="button"
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 shrink-0"
            onClick={clearMedia}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
