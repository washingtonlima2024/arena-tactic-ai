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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, Trash2, CheckCircle, XCircle, Clock, Play, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface EventEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: {
    id: string | null;
    event_type: string;
    minute: number | null;
    second: number | null;
    description: string | null;
    metadata: { team?: string } | null;
    approval_status?: string | null;
    match_id?: string;
    isNew?: boolean;
  } | null;
  homeTeam?: string;
  awayTeam?: string;
  onSave: () => void;
  matchVideo?: { file_url: string; start_minute: number } | null;
  isCreating?: boolean;
  matchId?: string | null;
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
  { value: 'penalty', label: 'Pênalti' },
  { value: 'save', label: 'Defesa' },
  { value: 'assist', label: 'Assistência' },
  { value: 'cross', label: 'Cruzamento' },
  { value: 'dribble', label: 'Drible' },
  { value: 'tackle', label: 'Desarme' },
  { value: 'interception', label: 'Interceptação' },
  { value: 'clearance', label: 'Afastamento' },
];

export function EventEditDialog({
  isOpen,
  onClose,
  event,
  homeTeam = 'Time Casa',
  awayTeam = 'Time Visitante',
  onSave,
  matchVideo,
  isCreating = false,
  matchId
}: EventEditDialogProps) {
  const { isAdmin, user } = useAuth();
  const [eventType, setEventType] = useState('goal');
  const [minute, setMinute] = useState('');
  const [second, setSecond] = useState('');
  const [description, setDescription] = useState('');
  const [team, setTeam] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [positionX, setPositionX] = useState('');
  const [positionY, setPositionY] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  useEffect(() => {
    if (event) {
      setEventType(event.event_type || 'goal');
      setMinute(event.minute?.toString() || '');
      setSecond(event.second?.toString() || '');
      setDescription(event.description || '');
      setTeam(event.metadata?.team || homeTeam);
      setPlayerName('');
      setPositionX('');
      setPositionY('');
    }
  }, [event, homeTeam]);

  const handleSave = async () => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem editar eventos');
      return;
    }

    if (!eventType) {
      toast.error('Selecione o tipo de evento');
      return;
    }
    
    setIsSaving(true);
    try {
      if (isCreating || event?.isNew) {
        // Create new event
        const targetMatchId = matchId || event?.match_id;
        if (!targetMatchId) {
          toast.error('Selecione uma partida primeiro');
          setIsSaving(false);
          return;
        }

        const { error } = await supabase
          .from('match_events')
          .insert({
            match_id: targetMatchId,
            event_type: eventType,
            minute: minute ? parseInt(minute) : null,
            second: second ? parseInt(second) : null,
            description: description || null,
            metadata: { 
              team, 
              player: playerName || undefined,
              aiGenerated: false, 
              manual: true 
            },
            position_x: positionX ? parseFloat(positionX) : null,
            position_y: positionY ? parseFloat(positionY) : null,
            approval_status: 'approved',
            approved_by: user?.id,
            approved_at: new Date().toISOString(),
          });

        if (error) throw error;

        toast.success('Evento criado com sucesso!');
      } else {
        // Update existing event
        const { error } = await supabase
          .from('match_events')
          .update({
            event_type: eventType,
            minute: minute ? parseInt(minute) : null,
            second: second ? parseInt(second) : null,
            description: description || null,
            metadata: { 
              team, 
              player: playerName || undefined,
              aiGenerated: false, 
              edited: true 
            },
            position_x: positionX ? parseFloat(positionX) : null,
            position_y: positionY ? parseFloat(positionY) : null,
            approval_status: 'pending',
            approved_by: null,
            approved_at: null,
          })
          .eq('id', event!.id);

        if (error) throw error;

        toast.success('Evento atualizado! Aguardando aprovação.');
      }
      
      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving event:', error);
      toast.error('Erro ao salvar evento');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproval = async (approved: boolean) => {
    if (!event?.id || !isAdmin) return;
    
    setIsApproving(true);
    try {
      const { error } = await supabase
        .from('match_events')
        .update({
          approval_status: approved ? 'approved' : 'rejected',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', event.id);

      if (error) throw error;

      toast.success(approved ? 'Evento aprovado!' : 'Evento rejeitado');
      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating approval:', error);
      toast.error('Erro ao atualizar status');
    } finally {
      setIsApproving(false);
    }
  };

  const handleDelete = async () => {
    if (!event?.id) return;
    
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

  const getApprovalStatusBadge = () => {
    if (isCreating || event?.isNew) return null;
    if (!event?.approval_status) return null;
    
    switch (event.approval_status) {
      case 'approved':
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            Aprovado
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Rejeitado
          </Badge>
        );
      default:
        return (
          <Badge variant="warning" className="gap-1">
            <Clock className="h-3 w-3" />
            Pendente
          </Badge>
        );
    }
  };

  // Calculate video preview URL
  const getVideoPreviewUrl = () => {
    if (!matchVideo || !minute) return null;
    const eventMinute = parseInt(minute);
    const eventSeconds = (eventMinute - (matchVideo.start_minute || 0)) * 60 + (parseInt(second) || 0);
    const startSeconds = Math.max(0, eventSeconds - 5);
    const separator = matchVideo.file_url.includes('?') ? '&' : '?';
    return `${matchVideo.file_url}${separator}t=${startSeconds}`;
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {isCreating || event?.isNew ? (
                <>
                  <Plus className="h-5 w-5 text-primary" />
                  Criar Novo Evento
                </>
              ) : (
                'Editar Evento'
              )}
            </DialogTitle>
            {getApprovalStatusBadge()}
          </div>
          <DialogDescription>
            {isCreating || event?.isNew 
              ? 'Preencha os campos para criar um novo evento'
              : 'Corrija as informações e confirme se o evento está correto'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video Preview Link */}
          {matchVideo && minute && !isCreating && !event?.isNew && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Play className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">
                    Visualize o vídeo para confirmar
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = getVideoPreviewUrl();
                    if (url) window.open(url, '_blank');
                  }}
                >
                  Ver Vídeo
                </Button>
              </div>
            </div>
          )}

          {/* Event Type */}
          <div className="space-y-2">
            <Label>Tipo de Evento *</Label>
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

          {/* Player Name */}
          <div className="space-y-2">
            <Label>Nome do Jogador (opcional)</Label>
            <Input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Ex: Neymar Jr."
            />
          </div>

          {/* Position on field */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Posição X (0-100)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={positionX}
                onChange={(e) => setPositionX(e.target.value)}
                placeholder="50"
              />
            </div>
            <div className="space-y-2">
              <Label>Posição Y (0-100)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={positionY}
                onChange={(e) => setPositionY(e.target.value)}
                placeholder="50"
              />
            </div>
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

          {/* Admin Approval Actions - Only for existing pending events */}
          {!isCreating && !event?.isNew && event?.approval_status === 'pending' && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-3">
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                Aprovar este evento?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-green-500/50 text-green-600 hover:bg-green-500/10"
                  onClick={() => handleApproval(true)}
                  disabled={isApproving}
                >
                  {isApproving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Aprovar
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-red-500/50 text-red-600 hover:bg-red-500/10"
                  onClick={() => handleApproval(false)}
                  disabled={isApproving}
                >
                  {isApproving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="mr-2 h-4 w-4" />
                  )}
                  Rejeitar
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {!isCreating && !event?.isNew && (
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
            )}
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
              ) : isCreating || event?.isNew ? (
                <Plus className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isCreating || event?.isNew ? 'Criar' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
