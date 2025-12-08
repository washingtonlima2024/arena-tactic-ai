import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

interface LiveScoreDisplayProps {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  onScoreChange: (team: "home" | "away", delta: number) => void;
  disabled: boolean;
}

export const LiveScoreDisplay = ({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  onScoreChange,
  disabled,
}: LiveScoreDisplayProps) => {
  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center justify-between gap-4">
        {/* Home Team */}
        <div className="flex-1 text-center">
          <p className="text-sm text-muted-foreground mb-2 truncate">{homeTeam}</p>
          <div className="flex items-center justify-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => onScoreChange("home", -1)}
              disabled={disabled || homeScore <= 0}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-4xl font-bold text-foreground w-12">{homeScore}</span>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => onScoreChange("home", 1)}
              disabled={disabled}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Separator */}
        <span className="text-3xl font-bold text-muted-foreground">×</span>

        {/* Away Team */}
        <div className="flex-1 text-center">
          <p className="text-sm text-muted-foreground mb-2 truncate">{awayTeam}</p>
          <div className="flex items-center justify-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => onScoreChange("away", -1)}
              disabled={disabled || awayScore <= 0}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-4xl font-bold text-foreground w-12">{awayScore}</span>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => onScoreChange("away", 1)}
              disabled={disabled}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
