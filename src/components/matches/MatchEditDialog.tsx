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
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

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
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [isSaving, setIsSaving] = useState(false);

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
      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating match:', error);
      toast.error('Erro ao atualizar placar');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar Placar</DialogTitle>
          <DialogDescription>
            Ajuste o placar da partida
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
