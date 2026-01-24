import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, Target, Trophy, AlertTriangle, Users, Lock, Unlock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTeams } from '@/hooks/useTeams';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { syncMatchScoreFromEvents, setMatchScoreLock } from '@/lib/scoreSync';

interface MatchEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  match: {
    id: string;
    home_score: number | null;
    away_score: number | null;
    home_team_id?: string | null;
    away_team_id?: string | null;
    home_team?: { id?: string; name: string; logo_url?: string | null } | null;
    away_team?: { id?: string; name: string; logo_url?: string | null } | null;
  } | null;
  onSave: () => void;
}

export function MatchEditDialog({
  isOpen,
  onClose,
  match,
  onSave
}: MatchEditDialogProps) {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { data: teams = [] } = useTeams();
  
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [homeTeamId, setHomeTeamId] = useState<string>('');
  const [awayTeamId, setAwayTeamId] = useState<string>('');
  const [scoreLocked, setScoreLocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch event stats for this match
  const { data: eventStats } = useQuery({
    queryKey: ['match-event-stats', match?.id],
    queryFn: async () => {
      if (!match?.id) return null;
      
      const { data: events } = await supabase
        .from('match_events')
        .select('event_type, metadata')
        .eq('match_id', match.id);
      
      if (!events) return null;
      
      const goals = events.filter(e => e.event_type === 'goal').length;
      const shots = events.filter(e => 
        e.event_type === 'shot' || 
        e.event_type === 'shot_on_target'
      ).length;
      const fouls = events.filter(e => 
        e.event_type === 'foul'
      ).length;
      const yellowCards = events.filter(e => e.event_type === 'yellow_card').length;
      const redCards = events.filter(e => e.event_type === 'red_card').length;
      const corners = events.filter(e => 
        e.event_type === 'corner'
      ).length;
      
      return {
        goals,
        shots,
        fouls,
        yellowCards,
        redCards,
        corners,
        total: events.length
      };
    },
    enabled: !!match?.id && isOpen
  });

  // Fetch score_locked status
  const { data: matchLockStatus } = useQuery({
    queryKey: ['match-lock-status', match?.id],
    queryFn: async () => {
      if (!match?.id) return { score_locked: false };
      const { data } = await supabase
        .from('matches')
        .select('score_locked')
        .eq('id', match.id)
        .single();
      return data || { score_locked: false };
    },
    enabled: !!match?.id && isOpen
  });

  useEffect(() => {
    if (match) {
      setHomeScore(match.home_score?.toString() || '0');
      setAwayScore(match.away_score?.toString() || '0');
      setHomeTeamId(match.home_team_id || match.home_team?.id || '');
      setAwayTeamId(match.away_team_id || match.away_team?.id || '');
    }
  }, [match]);

  useEffect(() => {
    if (matchLockStatus) {
      setScoreLocked(matchLockStatus.score_locked || false);
    }
  }, [matchLockStatus]);

  if (!isAdmin) return null;

  const handleSave = async () => {
    if (!match) return;
    
    setIsSaving(true);
    try {
      // Update match with score_locked = true (admin is manually editing)
      const { error } = await supabase
        .from('matches')
        .update({
          home_score: parseInt(homeScore) || 0,
          away_score: parseInt(awayScore) || 0,
          home_team_id: homeTeamId || null,
          away_team_id: awayTeamId || null,
          score_locked: true, // Lock score when manually edited
        })
        .eq('id', match.id);

      if (error) throw error;
      setScoreLocked(true);

      // Get new team names
      const newHomeTeam = teams.find(t => t.id === homeTeamId);
      const newAwayTeam = teams.find(t => t.id === awayTeamId);

      // Update teamName in all events for this match
      if (newHomeTeam || newAwayTeam) {
        const { data: events } = await supabase
          .from('match_events')
          .select('id, metadata')
          .eq('match_id', match.id);

        if (events && events.length > 0) {
          for (const event of events) {
            const metadata = event.metadata as Record<string, any> | null;
            if (metadata) {
              const updatedMetadata = { ...metadata };
              if (metadata.team === 'home' && newHomeTeam) {
                updatedMetadata.teamName = newHomeTeam.name;
              } else if (metadata.team === 'away' && newAwayTeam) {
                updatedMetadata.teamName = newAwayTeam.name;
              }
              
              await supabase
                .from('match_events')
                .update({ metadata: updatedMetadata })
                .eq('id', event.id);
            }
          }
        }
      }

      toast.success('Partida atualizada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['completed-matches'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match-events', match.id] });
      queryClient.invalidateQueries({ queryKey: ['match', match.id] });
      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating match:', error);
      toast.error('Erro ao atualizar partida');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncFromEvents = async () => {
    if (!match?.id) return;
    
    setIsSaving(true);
    try {
      // Force sync (ignores lock) and unlock the score
      const result = await syncMatchScoreFromEvents(match.id, true);
      
      if (result) {
        setHomeScore(result.home.toString());
        setAwayScore(result.away.toString());
        setScoreLocked(false);
        
        queryClient.invalidateQueries({ queryKey: ['match-lock-status', match.id] });
        queryClient.invalidateQueries({ queryKey: ['completed-matches'] });
        queryClient.invalidateQueries({ queryKey: ['matches'] });
        
        toast.success(`Placar sincronizado: ${result.home} x ${result.away}`);
      } else {
        toast.error('Erro ao sincronizar placar');
      }
    } catch (error) {
      console.error('Error syncing score:', error);
      toast.error('Erro ao sincronizar placar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleScoreLock = async () => {
    if (!match?.id) return;
    
    const newLockState = !scoreLocked;
    const success = await setMatchScoreLock(match.id, newLockState);
    
    if (success) {
      setScoreLocked(newLockState);
      queryClient.invalidateQueries({ queryKey: ['match-lock-status', match.id] });
      toast.success(newLockState ? 'Placar travado' : 'Placar destravado');
    } else {
      toast.error('Erro ao alterar trava do placar');
    }
  };

  const selectedHomeTeam = teams.find(t => t.id === homeTeamId);
  const selectedAwayTeam = teams.find(t => t.id === awayTeamId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Editar Partida
          </DialogTitle>
          <DialogDescription>
            Ajuste o placar, times e visualize as métricas
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="score" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="score">Placar</TabsTrigger>
            <TabsTrigger value="teams">Times</TabsTrigger>
            <TabsTrigger value="stats">Estatísticas</TabsTrigger>
          </TabsList>
          
          <TabsContent value="score" className="space-y-6 pt-4">
            {/* Score Lock Status */}
            {scoreLocked && (
              <div className="flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm text-yellow-700 dark:text-yellow-400">
                    Placar editado manualmente (travado)
                  </span>
                </div>
                <Badge variant="outline" className="text-yellow-600 border-yellow-500/50">
                  Travado
                </Badge>
              </div>
            )}

            {/* Scores */}
            <div className="flex items-center justify-center gap-6">
              <div className="space-y-2 text-center">
                <Label className="text-sm text-muted-foreground">
                  {selectedHomeTeam?.name || match?.home_team?.name || 'Casa'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="99"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  className="h-16 w-20 text-center text-3xl font-bold"
                />
              </div>

              <span className="text-2xl font-bold text-muted-foreground">×</span>

              <div className="space-y-2 text-center">
                <Label className="text-sm text-muted-foreground">
                  {selectedAwayTeam?.name || match?.away_team?.name || 'Visitante'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="99"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  className="h-16 w-20 text-center text-3xl font-bold"
                />
              </div>
            </div>

            {/* Lock toggle */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm">
                {scoreLocked ? (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Unlock className="h-4 w-4 text-muted-foreground" />
                )}
                <span>Travar placar (evitar sincronização automática)</span>
              </div>
              <Switch
                checked={scoreLocked}
                onCheckedChange={handleToggleScoreLock}
              />
            </div>

            {/* Sync from events */}
            {eventStats && eventStats.goals > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-primary" />
                    <span>{eventStats.goals} gols detectados nos eventos</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSyncFromEvents}
                    disabled={isSaving}
                  >
                    Sincronizar
                  </Button>
                </div>
                {scoreLocked && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Sincronizar irá destravar o placar automaticamente
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button
                variant="arena"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 gap-2"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="teams" className="space-y-6 pt-4">
            {/* Team Selection */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Time da Casa
                </Label>
                <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar time">
                      {selectedHomeTeam && (
                        <div className="flex items-center gap-2">
                          {selectedHomeTeam.logo_url && (
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={selectedHomeTeam.logo_url} />
                              <AvatarFallback>{selectedHomeTeam.name.slice(0, 2)}</AvatarFallback>
                            </Avatar>
                          )}
                          {selectedHomeTeam.name}
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={team.id}>
                        <div className="flex items-center gap-2">
                          {team.logo_url && (
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={team.logo_url} />
                              <AvatarFallback>{team.name.slice(0, 2)}</AvatarFallback>
                            </Avatar>
                          )}
                          {team.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Time Visitante
                </Label>
                <Select value={awayTeamId} onValueChange={setAwayTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar time">
                      {selectedAwayTeam && (
                        <div className="flex items-center gap-2">
                          {selectedAwayTeam.logo_url && (
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={selectedAwayTeam.logo_url} />
                              <AvatarFallback>{selectedAwayTeam.name.slice(0, 2)}</AvatarFallback>
                            </Avatar>
                          )}
                          {selectedAwayTeam.name}
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={team.id}>
                        <div className="flex items-center gap-2">
                          {team.logo_url && (
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={team.logo_url} />
                              <AvatarFallback>{team.name.slice(0, 2)}</AvatarFallback>
                            </Avatar>
                          )}
                          {team.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {homeTeamId && awayTeamId && homeTeamId === awayTeamId && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Os times não podem ser iguais</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Ao alterar os times, os nomes dos times nos eventos serão atualizados automaticamente.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button
                variant="arena"
                onClick={handleSave}
                disabled={isSaving || (homeTeamId === awayTeamId && !!homeTeamId)}
                className="flex-1 gap-2"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="stats" className="space-y-4 pt-4">
            {eventStats ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{eventStats.goals}</p>
                  <p className="text-xs text-muted-foreground">Gols</p>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-2xl font-bold">{eventStats.shots}</p>
                  <p className="text-xs text-muted-foreground">Finalizações</p>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-2xl font-bold">{eventStats.fouls}</p>
                  <p className="text-xs text-muted-foreground">Faltas</p>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-2xl font-bold">{eventStats.corners}</p>
                  <p className="text-xs text-muted-foreground">Escanteios</p>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-500">{eventStats.yellowCards}</p>
                  <p className="text-xs text-muted-foreground">Amarelos</p>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-2xl font-bold text-red-500">{eventStats.redCards}</p>
                  <p className="text-xs text-muted-foreground">Vermelhos</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mb-2" />
                <p className="text-sm">Nenhum evento registrado</p>
              </div>
            )}
            
            {eventStats && (
              <p className="text-center text-xs text-muted-foreground">
                Total: {eventStats.total} eventos detectados
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}