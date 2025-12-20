import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Video, 
  FileText, 
  Calendar,
  Film,
  BarChart3,
  Radio,
  Trophy
} from 'lucide-react';

interface FinishResult {
  matchId: string;
  videoUrl: string | null;
  eventsCount: number;
  transcriptWords: number;
  duration: number;
}

interface LiveSummaryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: FinishResult | null;
  matchInfo: {
    homeTeam: string;
    awayTeam: string;
    competition: string;
  };
  score: {
    home: number;
    away: number;
  };
}

export function LiveSummaryDialog({
  isOpen,
  onClose,
  result,
  matchInfo,
  score,
}: LiveSummaryDialogProps) {
  const navigate = useNavigate();

  if (!result) return null;

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  const handleViewMatch = () => {
    onClose();
    navigate('/matches');
  };

  const handleGenerateClips = () => {
    onClose();
    navigate(`/media?match=${result.matchId}`);
  };

  const handleViewEvents = () => {
    onClose();
    navigate(`/events?match=${result.matchId}`);
  };

  const handleNewStream = () => {
    onClose();
    window.location.reload();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Partida Salva com Sucesso!
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            A transmissão foi finalizada e os dados foram salvos no sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Match Result */}
          <div className="flex items-center justify-center gap-4 py-3 bg-muted/50 rounded-lg">
            <span className="text-sm font-medium">{matchInfo.homeTeam || 'Casa'}</span>
            <span className="text-2xl font-bold text-primary">
              {score.home} - {score.away}
            </span>
            <span className="text-sm font-medium">{matchInfo.awayTeam || 'Fora'}</span>
          </div>

          {/* Checklist */}
          <div className="space-y-2">
            <ChecklistItem 
              icon={Video}
              label="Vídeo"
              value={result.videoUrl ? `${formatDuration(result.duration)}` : 'Não gravado'}
              success={!!result.videoUrl}
            />
            <ChecklistItem 
              icon={FileText}
              label="Transcrição"
              value={`${result.transcriptWords} palavras`}
              success={result.transcriptWords > 0}
            />
            <ChecklistItem 
              icon={Calendar}
              label="Eventos"
              value={`${result.eventsCount} registrados`}
              success={result.eventsCount > 0}
            />
            <ChecklistItem 
              icon={BarChart3}
              label="Análise"
              value="Concluída"
              success={true}
            />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-4">
            <Button variant="outline" onClick={handleViewMatch} className="flex-1">
              <Trophy className="h-4 w-4 mr-2" />
              Ver Partida
            </Button>
            <Button variant="arena" onClick={handleGenerateClips} className="flex-1">
              <Film className="h-4 w-4 mr-2" />
              Gerar Clips
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleViewEvents} className="flex-1">
              <Calendar className="h-4 w-4 mr-2" />
              Ver Eventos
            </Button>
            <Button variant="secondary" onClick={handleNewStream} className="flex-1">
              <Radio className="h-4 w-4 mr-2" />
              Nova Transmissão
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ChecklistItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  success: boolean;
}

function ChecklistItem({ icon: Icon, label, value, success }: ChecklistItemProps) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
      <div className="flex items-center gap-2">
        <CheckCircle2 className={`h-4 w-4 ${success ? 'text-green-500' : 'text-muted-foreground'}`} />
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Badge variant={success ? 'success' : 'secondary'} className="text-xs">
        {value}
      </Badge>
    </div>
  );
}
