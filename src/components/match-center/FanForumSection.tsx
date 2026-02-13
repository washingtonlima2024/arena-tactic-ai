import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { TeamChatbotCard } from '@/components/audio/TeamChatbotCard';

interface FanForumSectionProps {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShort: string;
  awayTeamShort: string;
  homeScore: number;
  awayScore: number;
  events: any[];
  tacticalAnalysis?: string;
}

export function FanForumSection({
  matchId, homeTeamName, awayTeamName, homeTeamShort, awayTeamShort,
  homeScore, awayScore, events, tacticalAnalysis
}: FanForumSectionProps) {
  const matchContext = {
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeScore,
    awayScore,
    events,
    tacticalAnalysis,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold">Fórum de Torcedores</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TeamChatbotCard
          teamName={homeTeamName}
          teamShort={homeTeamShort}
          teamType="home"
          matchId={matchId}
          matchContext={matchContext}
        />
        <TeamChatbotCard
          teamName={awayTeamName}
          teamShort={awayTeamShort}
          teamType="away"
          matchId={matchId}
          matchContext={matchContext}
        />
      </div>
    </div>
  );
}
