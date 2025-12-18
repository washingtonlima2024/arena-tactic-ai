import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useTeams } from '@/hooks/useTeams';
import { MatchSetupData } from './MatchSetupCard';
import { VideoSegment } from './VideoSegmentCard';
import { CoverageTimeline } from './CoverageTimeline';
import { ArrowLeft, Play, Calendar, Trophy, MapPin, FileVideo, Link2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AnalysisSummaryProps {
  matchData: MatchSetupData;
  segments: VideoSegment[];
  onBack: () => void;
  onStartAnalysis: () => void;
  isLoading: boolean;
  isTranscribing?: boolean;
  transcriptionProgress?: string;
}

export function AnalysisSummary({ matchData, segments, onBack, onStartAnalysis, isLoading, isTranscribing, transcriptionProgress }: AnalysisSummaryProps) {
  const { data: teams } = useTeams();
  
  const homeTeam = teams?.find(t => t.id === matchData.homeTeamId);
  const awayTeam = teams?.find(t => t.id === matchData.awayTeamId);

  const formatMatchDate = () => {
    if (!matchData.matchDate) return 'Data não informada';
    const date = new Date(matchData.matchDate);
    const formattedDate = format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
    return matchData.matchTime ? `${formattedDate} às ${matchData.matchTime}` : formattedDate;
  };

  const videoTypeLabels: Record<string, string> = {
    full: 'Completo',
    first_half: '1º Tempo',
    second_half: '2º Tempo',
    clip: 'Trecho',
  };

  const hasReadySegments = segments.some(s => s.status === 'complete' || s.status === 'ready');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Match Summary Card */}
      <Card variant="glass">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Resumo da Partida
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Teams */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-2"
                style={{ 
                  backgroundColor: homeTeam?.primary_color || 'hsl(var(--muted))',
                  borderColor: homeTeam?.secondary_color || 'hsl(var(--border))',
                  color: homeTeam?.secondary_color || 'hsl(var(--foreground))'
                }}
              >
                {homeTeam?.short_name || '?'}
              </div>
              <span className="text-sm font-medium mt-2">{homeTeam?.name || 'Time Casa'}</span>
            </div>

            <span className="text-2xl font-bold text-muted-foreground">VS</span>

            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-2"
                style={{ 
                  backgroundColor: awayTeam?.primary_color || 'hsl(var(--muted))',
                  borderColor: awayTeam?.secondary_color || 'hsl(var(--border))',
                  color: awayTeam?.secondary_color || 'hsl(var(--foreground))'
                }}
              >
                {awayTeam?.short_name || '?'}
              </div>
              <span className="text-sm font-medium mt-2">{awayTeam?.name || 'Time Visitante'}</span>
            </div>
          </div>

          <Separator />

          {/* Match Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {matchData.competition && (
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <span>{matchData.competition}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{formatMatchDate()}</span>
            </div>
            {matchData.venue && (
              <div className="flex items-center gap-2 col-span-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{matchData.venue}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Videos Summary Card */}
      <Card variant="glass">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileVideo className="h-5 w-5 text-emerald-400" />
            Vídeos ({segments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Video List */}
          <div className="space-y-2">
            {segments.map((segment, index) => (
              <div key={segment.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </div>
                {segment.isLink ? (
                  <Link2 className="h-4 w-4 text-blue-400" />
                ) : (
                  <FileVideo className="h-4 w-4 text-emerald-400" />
                )}
                <span className="flex-1 truncate text-sm">{segment.title || segment.name}</span>
                <Badge variant="outline" className="text-xs">
                  {videoTypeLabels[segment.videoType]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {segment.startMinute}' - {segment.endMinute || '?'}'
                </span>
              </div>
            ))}
          </div>

          <Separator />

          {/* Coverage Timeline */}
          <CoverageTimeline segments={segments} />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-4">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button 
          onClick={onStartAnalysis} 
          disabled={!hasReadySegments || isLoading || isTranscribing}
          className="flex-1"
          size="lg"
        >
          {isTranscribing ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
              {transcriptionProgress || 'Transcrevendo áudio...'}
            </>
          ) : isLoading ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
              Analisando...
            </>
          ) : (
            <>
              <Play className="mr-2 h-5 w-5" />
              Iniciar Análise Completa
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
