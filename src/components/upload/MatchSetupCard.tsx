import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useTeams } from '@/hooks/useTeams';
import { ArrowRight, Trophy, MapPin, Calendar, Clock } from 'lucide-react';

export interface MatchSetupData {
  homeTeamId: string;
  awayTeamId: string;
  competition: string;
  matchDate: string;
  matchTime: string;
  venue: string;
}

interface MatchSetupCardProps {
  data: MatchSetupData;
  onChange: (data: MatchSetupData) => void;
  onContinue: () => void;
}

export function MatchSetupCard({ data, onChange, onContinue }: MatchSetupCardProps) {
  const { data: teams, isLoading: teamsLoading } = useTeams();

  const updateField = (field: keyof MatchSetupData, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const canContinue = data.homeTeamId && data.awayTeamId && data.homeTeamId !== data.awayTeamId;

  const homeTeam = teams?.find(t => t.id === data.homeTeamId);
  const awayTeam = teams?.find(t => t.id === data.awayTeamId);

  return (
    <Card variant="glass" className="max-w-3xl mx-auto">
      <CardHeader className="text-center pb-2">
        <div className="w-full h-24 bg-gradient-to-b from-emerald-500/20 to-transparent rounded-t-lg flex items-center justify-center mb-4">
          <div className="flex items-center gap-8">
            {/* Home Team Badge */}
            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-2"
                style={{ 
                  backgroundColor: homeTeam?.primary_color || 'hsl(var(--muted))',
                  borderColor: homeTeam?.secondary_color || 'hsl(var(--border))',
                  color: homeTeam?.secondary_color || 'hsl(var(--foreground))'
                }}
              >
                {homeTeam?.short_name?.[0] || '🏠'}
              </div>
              <span className="text-xs text-muted-foreground mt-1">Casa</span>
            </div>

            <span className="text-2xl font-bold text-muted-foreground">VS</span>

            {/* Away Team Badge */}
            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-2"
                style={{ 
                  backgroundColor: awayTeam?.primary_color || 'hsl(var(--muted))',
                  borderColor: awayTeam?.secondary_color || 'hsl(var(--border))',
                  color: awayTeam?.secondary_color || 'hsl(var(--foreground))'
                }}
              >
                {awayTeam?.short_name?.[0] || '🏃'}
              </div>
              <span className="text-xs text-muted-foreground mt-1">Visitante</span>
            </div>
          </div>
        </div>
        <CardTitle className="text-xl">Configurar Partida</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Teams Selection */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              Time da Casa
            </Label>
            <Select 
              value={data.homeTeamId} 
              onValueChange={(v) => updateField('homeTeamId', v)}
              disabled={teamsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o time da casa" />
              </SelectTrigger>
              <SelectContent>
                {teams?.map((team) => (
                  <SelectItem key={team.id} value={team.id} disabled={team.id === data.awayTeamId}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: team.primary_color || '#10b981' }}
                      />
                      {team.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              Time Visitante
            </Label>
            <Select 
              value={data.awayTeamId} 
              onValueChange={(v) => updateField('awayTeamId', v)}
              disabled={teamsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o time visitante" />
              </SelectTrigger>
              <SelectContent>
                {teams?.map((team) => (
                  <SelectItem key={team.id} value={team.id} disabled={team.id === data.homeTeamId}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: team.primary_color || '#10b981' }}
                      />
                      {team.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Competition */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Competição
          </Label>
          <Input
            value={data.competition}
            onChange={(e) => updateField('competition', e.target.value)}
            placeholder="Ex: Campeonato Brasileiro, Copa do Brasil..."
          />
        </div>

        {/* Date and Time */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Data da Partida
            </Label>
            <Input
              type="date"
              value={data.matchDate}
              onChange={(e) => updateField('matchDate', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Horário
            </Label>
            <Input
              type="time"
              value={data.matchTime}
              onChange={(e) => updateField('matchTime', e.target.value)}
            />
          </div>
        </div>

        {/* Venue */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Estádio (opcional)
          </Label>
          <Input
            value={data.venue}
            onChange={(e) => updateField('venue', e.target.value)}
            placeholder="Ex: Maracanã, Allianz Parque..."
          />
        </div>

        {/* Continue Button */}
        <div className="pt-4">
          <Button 
            onClick={onContinue}
            disabled={!canContinue}
            className="w-full"
            size="lg"
          >
            Continuar para Vídeos
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          {!canContinue && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Selecione os dois times para continuar
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
