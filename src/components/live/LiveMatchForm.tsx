import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTeams } from "@/hooks/useTeams";
import { MatchInfo } from "@/hooks/useLiveBroadcast";
import { Users, Trophy, Calendar } from "lucide-react";

interface LiveMatchFormProps {
  matchInfo: MatchInfo;
  onMatchInfoChange: (info: MatchInfo) => void;
  disabled: boolean;
}

export const LiveMatchForm = ({
  matchInfo,
  onMatchInfoChange,
  disabled,
}: LiveMatchFormProps) => {
  const { data: teams } = useTeams();

  const updateField = (field: keyof MatchInfo, value: string) => {
    onMatchInfoChange({ ...matchInfo, [field]: value });
  };

  // Handle team selection - store both ID and name
  const handleHomeTeamChange = (teamId: string) => {
    const team = teams?.find(t => t.id === teamId);
    if (team) {
      onMatchInfoChange({ 
        ...matchInfo, 
        homeTeam: team.name,
        homeTeamId: team.id 
      });
    }
  };

  const handleAwayTeamChange = (teamId: string) => {
    const team = teams?.find(t => t.id === teamId);
    if (team) {
      onMatchInfoChange({ 
        ...matchInfo, 
        awayTeam: team.name,
        awayTeamId: team.id 
      });
    }
  };

  return (
    <div className="glass-card p-6 rounded-xl space-y-4">
      <h3 className="font-semibold flex items-center gap-2 text-foreground">
        <Users className="h-5 w-5 text-primary" />
        Informações da Partida
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Home Team */}
        <div className="space-y-2">
          <Label>Time Casa</Label>
          {teams && teams.length > 0 ? (
            <Select
              value={matchInfo.homeTeamId || ""}
              onValueChange={handleHomeTeamChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o time">
                  {matchInfo.homeTeam || "Selecione o time"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="Nome do time casa"
              value={matchInfo.homeTeam}
              onChange={(e) => updateField("homeTeam", e.target.value)}
              disabled={disabled}
            />
          )}
        </div>

        {/* Away Team */}
        <div className="space-y-2">
          <Label>Time Fora</Label>
          {teams && teams.length > 0 ? (
            <Select
              value={matchInfo.awayTeamId || ""}
              onValueChange={handleAwayTeamChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o time">
                  {matchInfo.awayTeam || "Selecione o time"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="Nome do time fora"
              value={matchInfo.awayTeam}
              onChange={(e) => updateField("awayTeam", e.target.value)}
              disabled={disabled}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Competition */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Competição
          </Label>
          <Input
            placeholder="Ex: Campeonato Brasileiro"
            value={matchInfo.competition}
            onChange={(e) => updateField("competition", e.target.value)}
            disabled={disabled}
          />
        </div>

        {/* Date/Time */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Data e Hora
          </Label>
          <Input
            type="datetime-local"
            value={matchInfo.matchDate}
            onChange={(e) => updateField("matchDate", e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
};
