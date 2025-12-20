import { useState } from 'react';
import { Match } from '@/types/arena';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, BarChart3, Clock, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { VideoPlayerModal } from '@/components/media/VideoPlayerModal';
import { MatchEditDialog } from '@/components/matches/MatchEditDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { TeamBadge } from '@/components/teams/TeamBadge';

interface MatchCardProps {
  match: Match;
}

const statusLabels = {
  scheduled: 'Agendada',
  live: 'Ao Vivo',
  completed: 'Concluída',
  analyzing: 'Analisando',
  analyzed: 'Analisada',
  pending: 'Pendente',
};

const statusColors = {
  scheduled: 'secondary',
  live: 'destructive',
  completed: 'success',
  analyzing: 'arena',
  analyzed: 'success',
  pending: 'secondary',
} as const;

export function MatchCard({ match }: MatchCardProps) {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [showVignette, setShowVignette] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Fetch video for this match - prioritize 'full' type, fallback to any video
  const { data: matchVideo } = useQuery({
    queryKey: ['match-video', match.id],
    queryFn: async () => {
      // First try to get 'full' video
      const { data: fullVideo } = await supabase
        .from('videos')
        .select('*')
        .eq('match_id', match.id)
        .eq('video_type', 'full')
        .maybeSingle();
      
      if (fullVideo) return fullVideo;
      
      // Fallback to any video associated with this match
      const { data: anyVideo } = await supabase
        .from('videos')
        .select('*')
        .eq('match_id', match.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      return anyVideo;
    },
    enabled: match.status === 'completed' || match.status === 'analyzing' || match.status === 'analyzed',
  });

  // Check if match came from live stream
  const { data: isFromLive } = useQuery({
    queryKey: ['match-from-live', match.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('analysis_jobs')
        .select('result')
        .eq('match_id', match.id)
        .maybeSingle();
      
      const result = data?.result as { source?: string } | null;
      return result?.source === 'live';
    },
    enabled: match.status === 'completed' || match.status === 'analyzed',
  });

  const formattedDate = new Date(match.date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = new Date(match.date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleOpenVideo = () => {
    setShowVignette(true);
    setShowVideoPlayer(true);
  };

  const handleCloseVideo = () => {
    setShowVideoPlayer(false);
    setShowVignette(true);
  };

  const handleSaveMatch = () => {
    queryClient.invalidateQueries({ queryKey: ['matches'] });
  };

  // Check if video URL is embeddable (iframe) or direct file
  const isEmbedUrl = matchVideo?.file_url && (
    matchVideo.file_url.includes('youtube') ||
    matchVideo.file_url.includes('vimeo') ||
    matchVideo.file_url.includes('embed') ||
    matchVideo.file_url.includes('player')
  );

  // Generate thumbnail from video or use placeholder
  const getVideoThumbnail = () => {
    if (!matchVideo?.file_url) return null;
    
    // For YouTube videos, extract thumbnail
    if (matchVideo.file_url.includes('youtube') || matchVideo.file_url.includes('youtu.be')) {
      const videoId = matchVideo.file_url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1];
      if (videoId) {
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }
    }
    
    return null;
  };

  const thumbnailUrl = getVideoThumbnail();

  return (
    <>
      <Card variant="glow" className="overflow-hidden">
        {/* Live Indicator */}
        {match.status === 'live' && (
          <div className="absolute left-2 top-2 z-10">
            <Badge variant="destructive" className="animate-pulse gap-1">
              <span className="h-2 w-2 rounded-full bg-white animate-ping" />
              🔴 AO VIVO
            </Badge>
          </div>
        )}
        
        {/* Video Preview - Shows embedded player if video exists */}
        <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-arena/20 to-arena-dark/40">
          {matchVideo ? (
            // Embedded video player
            <>
              {isEmbedUrl ? (
                <iframe
                  src={matchVideo.file_url}
                  className="absolute inset-0 w-full h-full"
                  frameBorder="0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  title={`${match.homeTeam.name} vs ${match.awayTeam.name}`}
                />
              ) : (
                <video
                  src={matchVideo.file_url}
                  className="absolute inset-0 w-full h-full object-cover"
                  muted
                  playsInline
                  onMouseEnter={(e) => e.currentTarget.play()}
                  onMouseLeave={(e) => {
                    e.currentTarget.pause();
                    e.currentTarget.currentTime = 0;
                  }}
                />
              )}
              {/* Overlay with match info */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TeamBadge team={match.homeTeam} size="sm" />
                    <span className="text-sm font-bold text-white">
                      {match.score.home} - {match.score.away}
                    </span>
                    <TeamBadge team={match.awayTeam} size="sm" />
                  </div>
                  <div className="flex items-center gap-1">
                    {isFromLive && (
                      <Badge variant="secondary" className="text-[10px]">
                        📺 Live
                      </Badge>
                    )}
                    <Badge variant="arena" className="text-[10px]">
                      {match.status === 'completed' || match.status === 'analyzed' ? 'Finalizado' : match.status === 'live' ? '🔴 Ao vivo' : 'Ao vivo'}
                    </Badge>
                  </div>
                </div>
              </div>
              {/* Expand button */}
              <button
                onClick={handleOpenVideo}
                className="absolute top-2 right-2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-arena"
              >
                <Play className="h-4 w-4 fill-current" />
              </button>
            </>
          ) : (
            // Placeholder when no video
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-arena/10 via-background to-arena-dark/20">
              <div className="text-center">
                <div className="mb-3 flex items-center justify-center gap-6">
                  <div className="flex flex-col items-center gap-1">
                    <TeamBadge team={match.homeTeam} size="xl" showGlow />
                    <span className="text-xs font-medium text-muted-foreground">{match.homeTeam.shortName}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-3xl font-bold text-foreground">
                      {match.score.home} - {match.score.away}
                    </span>
                    <Badge 
                      variant={match.status === 'live' ? 'destructive' : 'arena'} 
                      className={`mt-1 text-[10px] ${match.status === 'live' ? 'animate-pulse' : ''}`}
                    >
                      {match.status === 'live' ? '🔴 AO VIVO' : match.status === 'completed' || match.status === 'analyzed' ? 'Finalizado' : match.status === 'analyzing' ? 'Analisando' : 'Agendado'}
                    </Badge>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <TeamBadge team={match.awayTeam} size="xl" showGlow />
                    <span className="text-xs font-medium text-muted-foreground">{match.awayTeam.shortName}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{match.competition}</p>
              </div>
              {/* No video indicator - only show if not live */}
              {match.status !== 'live' && (
                <div className="absolute bottom-2 right-2 rounded bg-muted/80 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Sem vídeo
                </div>
              )}
            </div>
          )}
        </div>
        
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Badge variant={statusColors[match.status]}>
              {statusLabels[match.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">{match.competition}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Teams */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-center gap-2">
              <TeamBadge team={match.homeTeam} size="lg" />
              <span className="text-sm font-medium">{match.homeTeam.shortName}</span>
            </div>

            <div className="flex flex-col items-center">
              {match.status === 'completed' || match.status === 'analyzing' ? (
                <div className="group relative flex items-center gap-2 text-2xl font-bold">
                  <span>{match.score.home}</span>
                  <span className="text-muted-foreground">-</span>
                  <span>{match.score.away}</span>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute -right-8 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => setShowEditDialog(true)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-lg font-semibold">{formattedTime}</p>
                  <p className="text-xs text-muted-foreground">{formattedDate}</p>
                </div>
              )}
              {match.status === 'analyzing' && match.analysisProgress !== undefined && (
                <div className="mt-2 w-full">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div 
                      className="h-full bg-gradient-arena transition-all duration-500"
                      style={{ width: `${match.analysisProgress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-center text-xs text-muted-foreground">
                    {match.analysisProgress}% analisado
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-2">
              <TeamBadge team={match.awayTeam} size="lg" />
              <span className="text-sm font-medium">{match.awayTeam.shortName}</span>
            </div>
          </div>

          {/* Venue */}
          <p className="text-center text-xs text-muted-foreground">{match.venue}</p>

          {/* Actions */}
          <div className="flex gap-2">
            {match.status === 'live' && (
              <>
                <Button variant="arena" size="sm" className="flex-1 animate-pulse" asChild>
                  <Link to={`/live`}>
                    <Play className="mr-1 h-4 w-4" />
                    Ver Ao Vivo
                  </Link>
                </Button>
                <Button variant="arena-outline" size="sm" className="flex-1" asChild>
                  <Link to={`/analysis?match=${match.id}`}>
                    <BarChart3 className="mr-1 h-4 w-4" />
                    Análise Parcial
                  </Link>
                </Button>
              </>
            )}
            {(match.status === 'completed' || match.status === 'analyzed') && (
              <>
                <Button variant="arena-outline" size="sm" className="flex-1" asChild>
                  <Link to={`/analysis?match=${match.id}`}>
                    <BarChart3 className="mr-1 h-4 w-4" />
                    Análise
                  </Link>
                </Button>
                <Button 
                  variant="arena" 
                  size="sm" 
                  className="flex-1"
                  onClick={handleOpenVideo}
                  disabled={!matchVideo}
                >
                  <Play className="mr-1 h-4 w-4" />
                  Vídeo
                </Button>
              </>
            )}
            {match.status === 'analyzing' && (
              <Button variant="secondary" size="sm" className="flex-1" disabled>
                <Clock className="mr-1 h-4 w-4 animate-spin" />
                Processando...
              </Button>
            )}
            {match.status === 'pending' && (
              <Button variant="arena" size="sm" className="flex-1" asChild>
                <Link to={`/events?match=${match.id}`}>
                  <BarChart3 className="mr-1 h-4 w-4" />
                  Ver Análise
                </Link>
              </Button>
            )}
            {match.status === 'scheduled' && (
              <Button variant="arena-outline" size="sm" className="flex-1" asChild>
                <Link to="/upload">
                  Importar Vídeo
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Video Player Modal */}
      <VideoPlayerModal
        isOpen={showVideoPlayer}
        onClose={handleCloseVideo}
        clip={matchVideo ? {
          id: matchVideo.id,
          title: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
          type: 'full_match',
          minute: 0,
          description: `${match.competition} - ${formattedDate}`,
        } : null}
        matchVideo={matchVideo ? {
          file_url: matchVideo.file_url,
          start_minute: matchVideo.start_minute || 0,
        } : null}
        homeTeam={match.homeTeam.name}
        awayTeam={match.awayTeam.name}
        homeScore={match.score.home}
        awayScore={match.score.away}
        showVignette={false}
        onVignetteComplete={() => setShowVignette(false)}
      />

      {/* Match Edit Dialog (Admin only) */}
      <MatchEditDialog
        isOpen={showEditDialog}
        onClose={() => setShowEditDialog(false)}
        match={{
          id: match.id,
          home_score: match.score.home,
          away_score: match.score.away,
          home_team: { name: match.homeTeam.name },
          away_team: { name: match.awayTeam.name },
        }}
        onSave={handleSaveMatch}
      />
    </>
  );
}
