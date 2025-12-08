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

interface MatchCardProps {
  match: Match;
}

const statusLabels = {
  scheduled: 'Agendada',
  live: 'Ao Vivo',
  completed: 'Concluída',
  analyzing: 'Analisando',
};

const statusColors = {
  scheduled: 'secondary',
  live: 'destructive',
  completed: 'success',
  analyzing: 'arena',
} as const;

export function MatchCard({ match }: MatchCardProps) {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [showVignette, setShowVignette] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Fetch video for this match
  const { data: matchVideo } = useQuery({
    queryKey: ['match-video', match.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('videos')
        .select('*')
        .eq('match_id', match.id)
        .eq('video_type', 'full')
        .single();
      return data;
    },
    enabled: match.status === 'completed' || match.status === 'analyzing',
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
        {/* Video Preview Thumbnail */}
        {matchVideo && (
          <div 
            className="relative aspect-video w-full cursor-pointer overflow-hidden bg-gradient-to-br from-arena/20 to-arena-dark/40"
            onClick={handleOpenVideo}
          >
            {thumbnailUrl ? (
              <img 
                src={thumbnailUrl} 
                alt={`${match.homeTeam.name} vs ${match.awayTeam.name}`}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-arena/10 via-background to-arena-dark/20">
                <div className="text-center">
                  <div className="mb-2 flex items-center justify-center gap-4">
                    <div 
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: match.homeTeam.primaryColor + '30', color: match.homeTeam.primaryColor }}
                    >
                      {match.homeTeam.shortName.slice(0, 2)}
                    </div>
                    <span className="text-xl font-bold text-foreground">
                      {match.score.home} - {match.score.away}
                    </span>
                    <div 
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: match.awayTeam.primaryColor + '30', color: match.awayTeam.primaryColor }}
                    >
                      {match.awayTeam.shortName.slice(0, 2)}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{match.competition}</p>
                </div>
              </div>
            )}
            {/* Play overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-300 hover:opacity-100">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-arena/90 text-white shadow-lg shadow-arena/50">
                <Play className="h-8 w-8 fill-current" />
              </div>
            </div>
            {/* Duration badge */}
            {matchVideo.duration_seconds && (
              <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
                {Math.floor(matchVideo.duration_seconds / 60)}:{String(matchVideo.duration_seconds % 60).padStart(2, '0')}
              </div>
            )}
          </div>
        )}
        
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
              <div 
                className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
                style={{ backgroundColor: match.homeTeam.primaryColor + '20', color: match.homeTeam.primaryColor }}
              >
                {match.homeTeam.shortName.slice(0, 2)}
              </div>
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
              <div 
                className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
                style={{ backgroundColor: match.awayTeam.primaryColor + '20', color: match.awayTeam.primaryColor }}
              >
                {match.awayTeam.shortName.slice(0, 2)}
              </div>
              <span className="text-sm font-medium">{match.awayTeam.shortName}</span>
            </div>
          </div>

          {/* Venue */}
          <p className="text-center text-xs text-muted-foreground">{match.venue}</p>

          {/* Actions */}
          <div className="flex gap-2">
            {match.status === 'completed' && (
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
