import { useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Video, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { useMatchEvents, useMatchAnalysis } from '@/hooks/useMatchDetails';
import { useDynamicMatchStats } from '@/hooks/useDynamicMatchStats';
import { useEventBasedAnalysis } from '@/hooks/useEventBasedAnalysis';
import { apiClient, normalizeStorageUrl } from '@/lib/apiClient';
import { getApiBase } from '@/lib/apiMode';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getEventIcon } from '@/lib/eventLabels';
import { cn } from '@/lib/utils';

import { MatchCenterHeader } from '@/components/match-center/MatchCenterHeader';
import { FuturisticVideoPlayer } from '@/components/match-center/FuturisticVideoPlayer';
import { EventsFeed } from '@/components/match-center/EventsFeed';
import { ClipsGallery } from '@/components/match-center/ClipsGallery';
import { PlaylistBuilder } from '@/components/match-center/PlaylistBuilder';
import { MatchAnalyticsSection } from '@/components/match-center/MatchAnalyticsSection';
import { FanForumSection } from '@/components/match-center/FanForumSection';

export default function MatchCenter() {
  const { currentMatchId, selectedMatch, matches, isLoading: matchesLoading } = useMatchSelection();
  const { data: events = [] } = useMatchEvents(currentMatchId);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isGeneratingComments, setIsGeneratingComments] = useState(false);

  // Team info
  const homeTeam = selectedMatch?.home_team;
  const awayTeam = selectedMatch?.away_team;
  const homeTeamName = homeTeam?.name || 'Time Casa';
  const awayTeamName = awayTeam?.name || 'Time Visitante';
  const homeTeamShort = homeTeam?.short_name || homeTeamName.slice(0, 3).toUpperCase();
  const awayTeamShort = awayTeam?.short_name || awayTeamName.slice(0, 3).toUpperCase();
  const homeTeamColor = homeTeam?.primary_color || '#10b981';
  const awayTeamColor = awayTeam?.primary_color || '#3b82f6';

  // Dynamic stats
  const dynamicStats = useDynamicMatchStats(events, homeTeamName, awayTeamName);
  const eventAnalysis = useEventBasedAnalysis(events, homeTeam, awayTeam);

  // Tactical analysis from server
  const { data: analysisData } = useMatchAnalysis(currentMatchId);

  // Video
  const { data: matchVideo } = useQuery({
    queryKey: ['match-video', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return null;
      const videos = await apiClient.getVideos(currentMatchId);
      return videos?.[0] || null;
    },
    enabled: !!currentMatchId,
  });

  // Thumbnails
  const { data: thumbnails = [] } = useQuery({
    queryKey: ['thumbnails', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId) return [];
      return await apiClient.getThumbnails(currentMatchId) || [];
    },
    enabled: !!currentMatchId,
  });

  // Highlights
  const highlights = useMemo(() =>
    events.filter((e: any) => ['goal', 'red_card', 'penalty', 'yellow_card'].includes(e.event_type))
      .sort((a: any, b: any) => (a.minute || 0) - (b.minute || 0)),
    [events]
  );

  const seekToEvent = useCallback((event: any) => {
    setSelectedEventId(event.id);
  }, []);

  const handlePlayClip = useCallback((event: any) => {
    // If has clip_url, could open modal - for now just scroll to video
    setSelectedEventId(event.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Generate AI comments
  const generateComments = useCallback(async () => {
    if (!currentMatchId || events.length === 0) return;
    setIsGeneratingComments(true);

    try {
      const eventsWithoutComments = events.filter((e: any) => !(e.metadata as any)?.ai_comment);
      if (eventsWithoutComments.length === 0) {
        toast.info('Todos os eventos já possuem comentários.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-event-comments', {
        body: {
          match_id: currentMatchId,
          events: eventsWithoutComments.map((e: any) => ({
            id: e.id,
            event_type: e.event_type,
            minute: e.minute,
            description: e.description,
            metadata: e.metadata,
          })),
          home_team: homeTeamName,
          away_team: awayTeamName,
        },
      });

      if (error) throw error;
      toast.success(`${data?.generated || 0} comentários gerados!`);
      // Refetch events
      window.location.reload();
    } catch (err: any) {
      console.error('Error generating comments:', err);
      if (err?.message?.includes('429')) {
        toast.error('Limite de requisições atingido. Tente novamente em alguns minutos.');
      } else if (err?.message?.includes('402')) {
        toast.error('Créditos insuficientes. Adicione créditos ao workspace.');
      } else {
        toast.error('Erro ao gerar comentários: ' + (err?.message || 'Erro desconhecido'));
      }
    } finally {
      setIsGeneratingComments(false);
    }
  }, [currentMatchId, events, homeTeamName, awayTeamName]);

  if (matchesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground animate-pulse">Carregando partida...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (matches.length === 0) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md border-primary/30">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Video className="h-16 w-16 text-primary mb-4" />
              <h2 className="text-2xl font-bold mb-2">Nenhuma Partida</h2>
              <p className="text-muted-foreground mb-6">Importe sua primeira partida para acessar o Match Center</p>
              <Button asChild><Link to="/upload?mode=new"><Zap className="mr-2 h-5 w-5" />Importar</Link></Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen p-3 md:p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* 1. Header */}
        <MatchCenterHeader
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          homeTeamShort={homeTeamShort}
          awayTeamShort={awayTeamShort}
          homeTeamColor={homeTeamColor}
          awayTeamColor={awayTeamColor}
          homeTeamLogo={homeTeam?.logo_url}
          awayTeamLogo={awayTeam?.logo_url}
          homeScore={dynamicStats.score.home}
          awayScore={dynamicStats.score.away}
          competition={selectedMatch?.competition}
          matchDate={selectedMatch?.match_date}
          venue={selectedMatch?.venue}
          totalEvents={events.length}
        />

        {/* 2. Video + Events side by side — events locked to video height */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6">
            <FuturisticVideoPlayer
              videoUrl={matchVideo?.file_url}
              events={events}
              matchId={currentMatchId}
              onSeekToEvent={seekToEvent}
              selectedEventId={selectedEventId}
            />
          </div>
          {/* On mobile: fixed 350px. On desktop: match video aspect-ratio height via aspect-video trick */}
          <div className="lg:col-span-6 h-[350px] lg:h-auto lg:max-h-none" style={{ maxHeight: 'calc(56.25vw * 6 / 12)' }}>
            <EventsFeed
              events={events}
              thumbnails={thumbnails}
              selectedEventId={selectedEventId}
              onSelectEvent={seekToEvent}
              isGeneratingComments={isGeneratingComments}
              onGenerateComments={generateComments}
            />
          </div>
        </div>

        {/* 3. Highlights strip */}
        {highlights.length > 0 && (
          <Card className="p-4 border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-primary" />
              <span className="font-semibold">Momentos Importantes</span>
              <Badge variant="secondary" className="ml-auto text-xs">{highlights.length}</Badge>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {highlights.map((event: any) => {
                const thumb = thumbnails.find((t: any) => t.event_id === event.id);
                return (
                  <button
                    key={event.id}
                    onClick={() => seekToEvent(event)}
                    className={cn(
                      "flex-shrink-0 w-28 rounded-xl overflow-hidden border-2 transition-all hover:scale-105",
                      selectedEventId === event.id ? "border-primary shadow-lg shadow-primary/20" : "border-transparent"
                    )}
                  >
                    <div className="aspect-video flex items-center justify-center bg-muted/50 relative">
                      {thumb?.image_url ? (
                        <img src={normalizeStorageUrl(thumb.image_url) || ''} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl">{getEventIcon(event.event_type)}</span>
                      )}
                    </div>
                    <div className="bg-card px-2 py-1.5 text-center">
                      <span className="text-xs font-semibold">{event.minute}'</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {/* 4. Clips Gallery */}
        <ClipsGallery events={events} thumbnails={thumbnails} onPlayClip={handlePlayClip} />

        {/* 4.5. Playlist Builder */}
        <PlaylistBuilder events={events} thumbnails={thumbnails} matchId={currentMatchId} />

        {/* 5. Analytics & Stats */}
        <MatchAnalyticsSection
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          homeTeamColor={homeTeamColor}
          awayTeamColor={awayTeamColor}
          dynamicStats={dynamicStats}
          eventAnalysis={eventAnalysis}
          tacticalAnalysis={analysisData?.tacticalAnalysis}
        />

        {/* 6. Fan Forum */}
        {currentMatchId && (
          <FanForumSection
            matchId={currentMatchId}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
            homeTeamShort={homeTeamShort}
            awayTeamShort={awayTeamShort}
            homeScore={dynamicStats.score.home}
            awayScore={dynamicStats.score.away}
            events={events}
            tacticalAnalysis={analysisData?.tacticalAnalysis?.tacticalOverview}
          />
        )}
      </div>
    </AppLayout>
  );
}
