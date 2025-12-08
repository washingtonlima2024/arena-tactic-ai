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
import { Loader2, Save, Target, Trophy, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface MatchEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  match: {
    id: string;
    home_score: number | null;
    away_score: number | null;
    home_team?: { name: string } | null;
    away_team?: { name: string } | null;
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
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
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
        e.event_type === 'shot_on_target' ||
        e.event_type === 'Finalização'
      ).length;
      const fouls = events.filter(e => 
        e.event_type === 'foul' || 
        e.event_type === 'Falta' ||
        e.event_type === 'fault'
      ).length;
      const yellowCards = events.filter(e => e.event_type === 'yellow_card').length;
      const redCards = events.filter(e => e.event_type === 'red_card').length;
      const corners = events.filter(e => 
        e.event_type === 'corner' || 
        e.event_type === 'Escanteio'
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

  useEffect(() => {
    if (match) {
      setHomeScore(match.home_score?.toString() || '0');
      setAwayScore(match.away_score?.toString() || '0');
    }
  }, [match]);

  if (!isAdmin) return null;

  const handleSave = async () => {
    if (!match) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('matches')
        .update({
          home_score: parseInt(homeScore) || 0,
          away_score: parseInt(awayScore) || 0,
        })
        .eq('id', match.id);

      if (error) throw error;

      toast.success('Placar atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['completed-matches'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating match:', error);
      toast.error('Erro ao atualizar placar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncFromEvents = async () => {
    if (!match?.id) return;
    
    setIsSaving(true);
    try {
      const { data: goalEvents } = await supabase
        .from('match_events')
        .select('metadata')
        .eq('match_id', match.id)
        .eq('event_type', 'goal');
      
      let homeGoals = 0;
      let awayGoals = 0;
      
      goalEvents?.forEach(goal => {
        const metadata = goal.metadata as Record<string, any> | null;
        const team = metadata?.team || metadata?.scoring_team;
        if (team === 'home' || team === match.home_team?.name) {
          homeGoals++;
        } else if (team === 'away' || team === match.away_team?.name) {
          awayGoals++;
        } else {
          // Default distribution
          if (homeGoals <= awayGoals) homeGoals++;
          else awayGoals++;
        }
      });
      
      setHomeScore(homeGoals.toString());
      setAwayScore(awayGoals.toString());
      
      toast.success(`Placar sincronizado: ${homeGoals} x ${awayGoals}`);
    } catch (error) {
      console.error('Error syncing score:', error);
      toast.error('Erro ao sincronizar placar');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Editar Partida
          </DialogTitle>
          <DialogDescription>
            Ajuste o placar e visualize as métricas da partida
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="score" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="score">Placar</TabsTrigger>
            <TabsTrigger value="stats">Estatísticas</TabsTrigger>
          </TabsList>
          
          <TabsContent value="score" className="space-y-6 pt-4">
            {/* Scores */}
            <div className="flex items-center justify-center gap-6">
              <div className="space-y-2 text-center">
                <Label className="text-sm text-muted-foreground">
                  {match?.home_team?.name || 'Casa'}
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
                  {match?.away_team?.name || 'Visitante'}
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