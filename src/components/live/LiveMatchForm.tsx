import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTeams } from "@/hooks/useTeams";
import { useMatches, Match } from "@/hooks/useMatches";
import { MatchInfo } from "@/hooks/useLiveBroadcast";
import { Users, Trophy, Calendar, PlusSquare, ListPlus } from "lucide-react";
import { format } from "date-fns";

interface LiveMatchFormProps {
  matchInfo: MatchInfo;
  onMatchInfoChange: (info: MatchInfo) => void;
  disabled: boolean;
  selectedMatchId?: string | null;
  onMatchIdChange?: (matchId: string | null) => void;
}

type MatchMode = "new" | "existing" | null;

export const LiveMatchForm = ({
  matchInfo,
  onMatchInfoChange,
  disabled,
  selectedMatchId,
  onMatchIdChange,
}: LiveMatchFormProps) => {
  const { data: teams } = useTeams();
  const { data: matches } = useMatches();
  const [mode, setMode] = useState<MatchMode>(null);

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

  // Handle existing match selection
  const handleExistingMatchSelect = (matchId: string) => {
    const match = matches?.find(m => m.id === matchId);
    if (match) {
      onMatchInfoChange({
        homeTeam: match.home_team?.name || "",
        awayTeam: match.away_team?.name || "",
        homeTeamId: match.home_team_id || undefined,
        awayTeamId: match.away_team_id || undefined,
        competition: match.competition || "",
        matchDate: match.match_date ? match.match_date.slice(0, 16) : new Date().toISOString().slice(0, 16),
      });
      onMatchIdChange?.(matchId);
    }
  };

  const handleModeSelect = (selectedMode: MatchMode) => {
    setMode(selectedMode);
    if (selectedMode === "new") {
      // Reset to empty for new match
      onMatchInfoChange({
        homeTeam: "",
        awayTeam: "",
        homeTeamId: undefined,
        awayTeamId: undefined,
        competition: "",
        matchDate: new Date().toISOString().slice(0, 16),
      });
      onMatchIdChange?.(null);
    }
  };

  // Mode Selection UI
  if (mode === null && !disabled) {
    return (
      <div className="glass-card p-6 rounded-xl space-y-6">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Como deseja prosseguir?</h3>
          <p className="text-sm text-muted-foreground">
            Crie uma nova partida ou selecione uma partida existente
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* New Match Option */}
          <button
            type="button"
            onClick={() => handleModeSelect("new")}
            className="group relative p-6 rounded-xl border-2 border-border/50 bg-card/50 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 text-left"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <PlusSquare className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-foreground">Nova Partida</h4>
                <p className="text-sm text-muted-foreground">
                  Criar uma nova partida e iniciar transmissão ao vivo
                </p>
              </div>
            </div>
          </button>

          {/* Existing Match Option */}
          <button
            type="button"
            onClick={() => handleModeSelect("existing")}
            className="group relative p-6 rounded-xl border-2 border-border/50 bg-card/50 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 text-left"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <ListPlus className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-foreground">Partida Existente</h4>
                <p className="text-sm text-muted-foreground">
                  Vincular a transmissão a uma partida já criada
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Existing Match Selection
  if (mode === "existing" && !disabled) {
    return (
      <div className="glass-card p-6 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2 text-foreground">
            <ListPlus className="h-5 w-5 text-primary" />
            Selecionar Partida Existente
          </h3>
          <button
            type="button"
            onClick={() => setMode(null)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Voltar
          </button>
        </div>

        <div className="space-y-2">
          <Label>Partida</Label>
          <Select
            value={selectedMatchId || ""}
            onValueChange={handleExistingMatchSelect}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma partida">
                {selectedMatchId && matches?.find(m => m.id === selectedMatchId) 
                  ? `${matches.find(m => m.id === selectedMatchId)?.home_team?.name || "?"} vs ${matches.find(m => m.id === selectedMatchId)?.away_team?.name || "?"}`
                  : "Selecione uma partida"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {matches?.map((match) => (
                <SelectItem key={match.id} value={match.id}>
                  <div className="flex items-center gap-2">
                    <span>{match.home_team?.name || "Time 1"}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span>{match.away_team?.name || "Time 2"}</span>
                    {match.match_date && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({format(new Date(match.match_date), "dd/MM/yyyy")})
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Show selected match info */}
        {selectedMatchId && matchInfo.homeTeam && (
          <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Casa:</span>
                <span className="ml-2 font-medium">{matchInfo.homeTeam}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Fora:</span>
                <span className="ml-2 font-medium">{matchInfo.awayTeam}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Competição:</span>
                <span className="ml-2 font-medium">{matchInfo.competition || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Data:</span>
                <span className="ml-2 font-medium">
                  {matchInfo.matchDate ? format(new Date(matchInfo.matchDate), "dd/MM/yyyy HH:mm") : "-"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // New Match Form (existing form, with back button when not disabled)
  return (
    <div className="glass-card p-6 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2 text-foreground">
          <Users className="h-5 w-5 text-primary" />
          {mode === "new" ? "Nova Partida" : "Informações da Partida"}
        </h3>
        {mode === "new" && !disabled && (
          <button
            type="button"
            onClick={() => setMode(null)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Voltar
          </button>
        )}
      </div>

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
