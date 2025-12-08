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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EventEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: {
    id: string;
    event_type: string;
    minute: number | null;
    second: number | null;
    description: string | null;
    metadata: { team?: string } | null;
  } | null;
  homeTeam?: string;
  awayTeam?: string;
  onSave: () => void;
}

const eventTypes = [
  { value: 'goal', label: 'Gol' },
  { value: 'shot', label: 'Finalização' },
  { value: 'shot_on_target', label: 'Finalização no Gol' },
  { value: 'foul', label: 'Falta' },
  { value: 'yellow_card', label: 'Cartão Amarelo' },
  { value: 'red_card', label: 'Cartão Vermelho' },
  { value: 'corner', label: 'Escanteio' },
  { value: 'offside', label: 'Impedimento' },
  { value: 'substitution', label: 'Substituição' },
  { value: 'high_press', label: 'Pressão Alta' },
  { value: 'transition', label: 'Transição' },
  { value: 'ball_recovery', label: 'Recuperação de Bola' },
  { value: 'Escanteio', label: 'Escanteio' },
  { value: 'Finalização', label: 'Finalização' },
  { value: 'Falta', label: 'Falta' },
];

export function EventEditDialog({
  isOpen,
  onClose,
  event,
  homeTeam = 'Time Casa',
  awayTeam = 'Time Visitante',
  onSave
}: EventEditDialogProps) {
  const [eventType, setEventType] = useState('');
  const [minute, setMinute] = useState('');
  const [second, setSecond] = useState('');
  const [description, setDescription] = useState('');
  const [team, setTeam] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (event) {
      setEventType(event.event_type || '');
      setMinute(event.minute?.toString() || '');
      setSecond(event.second?.toString() || '');
      setDescription(event.description || '');
      setTeam(event.metadata?.team || '');
    }
  }, [event]);

  const handleSave = async () => {
    if (!event) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('match_events')
        .update({
          event_type: eventType,
          minute: minute ? parseInt(minute) : null,
          second: second ? parseInt(second) : null,
          description: description || null,
          metadata: { team, aiGenerated: false, edited: true }
        })
        .eq('id', event.id);

      if (error) throw error;

      toast.success('Evento atualizado com sucesso!');
      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Erro ao atualizar evento');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    
    if (!confirm('Tem certeza que deseja excluir este evento?')) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('match_events')
        .delete()
        .eq('id', event.id);

      if (error) throw error;

      toast.success('Evento excluído!');
      onSave();
      onClose();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Erro ao excluir evento');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Evento</DialogTitle>
          <DialogDescription>
            Corrija as informações extraídas do vídeo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event Type */}
          <div className="space-y-2">
            <Label>Tipo de Evento</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Minuto</Label>
              <Input
                type="number"
                min="0"
                max="120"
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Segundo</Label>
              <Input
                type="number"
                min="0"
                max="59"
                value={second}
                onChange={(e) => setSecond(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Team */}
          <div className="space-y-2">
            <Label>Time</Label>
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={homeTeam}>{homeTeam}</SelectItem>
                <SelectItem value={awayTeam}>{awayTeam}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o evento..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              className="gap-2"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Excluir
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="arena"
              onClick={handleSave}
              disabled={isSaving || isDeleting}
              className="gap-2"
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
