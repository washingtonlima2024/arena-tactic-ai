import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TeamBadge } from "@/components/teams/TeamBadge";
import { Minus, Plus } from "lucide-react";
import { useTeams } from "@/hooks/useTeams";
import { useMemo } from "react";

interface LiveScoreDisplayProps {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  onScoreChange: (team: "home" | "away", delta: number) => void;
  disabled: boolean;
  isRecording?: boolean;
  recordingTime?: number;
}

// Format seconds to MM:SS
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const LiveScoreDisplay = ({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  onScoreChange,
  disabled,
  isRecording = false,
  recordingTime,
}: LiveScoreDisplayProps) => {
  const { data: teams } = useTeams();

  // Find team data for badges
  const homeTeamData = useMemo(() => {
    const found = teams?.find(t => 
      t.name.toLowerCase() === homeTeam.toLowerCase() ||
      t.short_name?.toLowerCase() === homeTeam.toLowerCase()
    );
    return found || { name: homeTeam, short_name: homeTeam.slice(0, 3) };
  }, [teams, homeTeam]);

  const awayTeamData = useMemo(() => {
    const found = teams?.find(t => 
      t.name.toLowerCase() === awayTeam.toLowerCase() ||
      t.short_name?.toLowerCase() === awayTeam.toLowerCase()
    );
    return found || { name: awayTeam, short_name: awayTeam.slice(0, 3) };
  }, [teams, awayTeam]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      {/* Background glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 pointer-events-none" />
      
      <div className="relative p-6">
        {/* Live indicator */}
        {isRecording && (
          <div className="flex justify-center mb-4">
            <Badge className="bg-red-500 hover:bg-red-500 text-white gap-2 px-3 py-1 animate-pulse">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              AO VIVO
            </Badge>
          </div>
        )}

        {/* Teams and Score */}
        <div className="flex items-center justify-between gap-4">
          {/* Home Team */}
          <div className="flex-1 flex flex-col items-center gap-3">
            <div className="relative">
              <TeamBadge team={homeTeamData} size="xl" showGlow />
            </div>
            <p className="font-semibold text-center text-sm text-foreground truncate max-w-[100px]">
              {homeTeam}
            </p>
          </div>

          {/* Score Display */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              {/* Home Score Controls */}
              <div className="flex flex-col items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                  onClick={() => onScoreChange("home", 1)}
                  disabled={disabled}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-5xl font-black text-foreground tabular-nums w-12 text-center">
                  {homeScore}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30"
                  onClick={() => onScoreChange("home", -1)}
                  disabled={disabled || homeScore <= 0}
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </div>

              {/* VS Separator */}
              <div className="flex flex-col items-center px-2">
                <span className="text-xl font-bold text-muted-foreground">vs</span>
              </div>

              {/* Away Score Controls */}
              <div className="flex flex-col items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                  onClick={() => onScoreChange("away", 1)}
                  disabled={disabled}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-5xl font-black text-foreground tabular-nums w-12 text-center">
                  {awayScore}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30"
                  onClick={() => onScoreChange("away", -1)}
                  disabled={disabled || awayScore <= 0}
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Match Time */}
            {recordingTime !== undefined && recordingTime > 0 && (
              <Badge variant="outline" className="font-mono text-xs border-primary/30 bg-primary/5">
                ⏱️ {formatTime(recordingTime)}
              </Badge>
            )}
          </div>

          {/* Away Team */}
          <div className="flex-1 flex flex-col items-center gap-3">
            <div className="relative">
              <TeamBadge team={awayTeamData} size="xl" showGlow />
            </div>
            <p className="font-semibold text-center text-sm text-foreground truncate max-w-[100px]">
              {awayTeam}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
