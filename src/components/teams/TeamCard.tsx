import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, Trash2 } from 'lucide-react';
import type { Team } from '@/hooks/useTeams';
import { TeamBadge } from '@/components/teams/TeamBadge';

interface TeamCardProps {
  team: Team;
  onEdit: (team: Team) => void;
  onDelete: (team: Team) => void;
}

export function TeamCard({ team, onEdit, onDelete }: TeamCardProps) {
  return (
    <Card variant="glass" className="group hover:border-primary/30 transition-all duration-300">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <TeamBadge team={team} size="xl" className="shrink-0 shadow-lg" />

          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold truncate">{team.name}</h3>
            {team.short_name && (
              <p className="text-sm text-muted-foreground">{team.short_name}</p>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => onEdit(team)}
              className="h-8 w-8"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => onDelete(team)}
              className="h-8 w-8 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
