import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  X, 
  Instagram, 
  Facebook, 
  Youtube,
  Linkedin,
  Send,
  Calendar as CalendarIcon,
  Clock,
  Check,
  Share2,
  Video,
  Megaphone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '@/lib/apiClient';
import { useAuth } from '@/hooks/useAuth';

interface Campaign {
  id: string;
  name: string;
  status: string;
}

// Social networks configuration
const SOCIAL_NETWORKS = [
  { 
    id: 'instagram', 
    name: 'Instagram', 
    icon: Instagram,
    color: 'from-[#833AB4] via-[#FD1D1D] to-[#F77737]',
    bgColor: 'bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737]',
    formats: ['9:16', '1:1', '4:5']
  },
  { 
    id: 'facebook', 
    name: 'Facebook', 
    icon: Facebook,
    color: 'from-[#1877F2] to-[#1877F2]',
    bgColor: 'bg-[#1877F2]',
    formats: ['16:9', '1:1', '4:5', '9:16']
  },
  { 
    id: 'x', 
    name: 'X (Twitter)', 
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    color: 'from-black to-black',
    bgColor: 'bg-black',
    formats: ['16:9', '1:1', '9:16']
  },
  { 
    id: 'linkedin', 
    name: 'LinkedIn', 
    icon: Linkedin,
    color: 'from-[#0A66C2] to-[#0A66C2]',
    bgColor: 'bg-[#0A66C2]',
    formats: ['16:9', '1:1', '4:5']
  },
  { 
    id: 'youtube', 
    name: 'YouTube', 
    icon: Youtube,
    color: 'from-[#FF0000] to-[#FF0000]',
    bgColor: 'bg-[#FF0000]',
    formats: ['16:9', '9:16']
  },
  { 
    id: 'tiktok', 
    name: 'TikTok', 
    icon: () => (
      <Video className="h-5 w-5" />
    ),
    color: 'from-black to-black',
    bgColor: 'bg-black',
    formats: ['9:16']
  },
];

interface SocialSharePanelProps {
  isOpen: boolean;
  onClose: () => void;
  clipCount: number;
  matchTitle: string;
  clipUrl?: string | null;
  matchId?: string;
  eventId?: string;
}

export function SocialSharePanel({
  isOpen,
  onClose,
  clipCount,
  matchTitle,
  clipUrl,
  matchId,
  eventId
}: SocialSharePanelProps) {
  const { user } = useAuth();
  const [selectedNetworks, setSelectedNetworks] = useState<Set<string>>(new Set());
  const [shareMode, setShareMode] = useState<'now' | 'schedule'>('now');
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState('12:00');
  const [caption, setCaption] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('none');

  // Fetch active campaigns from local API
  useEffect(() => {
    if (isOpen && user) {
      fetchActiveCampaigns();
    }
  }, [isOpen, user]);

  const fetchActiveCampaigns = async () => {
    if (!user) return;
    try {
      const data = await apiClient.get<Campaign[]>('/api/social/campaigns');
      setCampaigns((data || []).filter(c => c.status === 'active' || c.status === 'draft'));
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    }
  };

  if (!isOpen) return null;

  const toggleNetwork = (networkId: string) => {
    setSelectedNetworks(prev => {
      const next = new Set(prev);
      if (next.has(networkId)) {
        next.delete(networkId);
      } else {
        next.add(networkId);
      }
      return next;
    });
  };

  const selectAllNetworks = () => {
    if (selectedNetworks.size === SOCIAL_NETWORKS.length) {
      setSelectedNetworks(new Set());
    } else {
      setSelectedNetworks(new Set(SOCIAL_NETWORKS.map(n => n.id)));
    }
  };

  const handleShare = async () => {
    if (selectedNetworks.size === 0) {
      toast.error('Selecione pelo menos uma rede social');
      return;
    }

    if (!user) {
      toast.error('Você precisa estar logado para compartilhar');
      return;
    }

    setIsSharing(true);

    try {
      const networkNames = Array.from(selectedNetworks)
        .map(id => SOCIAL_NETWORKS.find(n => n.id === id)?.name)
        .filter(Boolean)
        .join(', ');

      if (shareMode === 'schedule') {
        if (!scheduleDate) {
          toast.error('Selecione uma data para agendar');
          setIsSharing(false);
          return;
        }

        // Create scheduled posts via local API
        const [hours, minutes] = scheduleTime.split(':').map(Number);
        const scheduledAt = new Date(scheduleDate);
        scheduledAt.setHours(hours, minutes, 0, 0);

        const posts = Array.from(selectedNetworks).map(platform => ({
          user_id: user.id,
          platform,
          content: caption || `⚽ Melhores momentos: ${matchTitle}`,
          media_url: clipUrl || null,
          media_type: clipUrl ? 'video' : null,
          scheduled_at: scheduledAt.toISOString(),
          status: 'scheduled',
          match_id: matchId || null,
          event_id: eventId || null,
          campaign_id: selectedCampaignId !== 'none' ? selectedCampaignId : null,
        }));

        await apiClient.post('/api/social/scheduled-posts', posts);

        toast.success(`${posts.length} publicação(ões) agendada(s) para ${format(scheduledAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} em: ${networkNames}`);
      } else {
        // Publish immediately via local API
        const platformLabels: Record<string, string> = {
          instagram: 'Instagram',
          facebook: 'Facebook',
          tiktok: 'TikTok',
          youtube: 'YouTube',
          x: 'X (Twitter)',
          linkedin: 'LinkedIn',
        };

        const successes: string[] = [];
        const failures: { platform: string; error: string }[] = [];

        for (const platform of selectedNetworks) {
          try {
            const result = await apiClient.post<{ success?: boolean; error?: string }>('/api/social/publish', {
              platform,
              content: caption || `⚽ Melhores momentos: ${matchTitle}`,
              mediaUrl: clipUrl || null,
              userId: user.id,
            });

            if (result.success === false) {
              failures.push({ platform, error: result.error || 'Erro desconhecido' });
            } else {
              successes.push(platform);
            }
          } catch (e: any) {
            failures.push({ platform, error: e.message || 'Erro de conexão' });
          }
        }

        // Feedback correto baseado nos resultados reais
        if (successes.length > 0) {
          const names = successes.map(p => platformLabels[p] || p).join(', ');
          toast.success(`Conteúdo compartilhado em: ${names}`);
        }
        if (failures.length > 0) {
          const failDetails = failures.map(f => `${platformLabels[f.platform] || f.platform}: ${f.error}`).join('\n');
          toast.error(`Falha ao publicar:\n${failDetails}`);
        }
        if (successes.length === 0 && failures.length > 0) {
          // Não fechar o painel se tudo falhou
          setIsSharing(false);
          return;
        }
      }

      onClose();
    } catch (error: any) {
      console.error('Error sharing:', error);
      toast.error(error.message || 'Erro ao compartilhar');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <Card className="w-full max-w-lg mx-4 bg-card/95 border-border/50 backdrop-blur-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Share2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Compartilhar nas Redes</h2>
              <p className="text-sm text-muted-foreground">
                {clipCount} clip{clipCount !== 1 ? 's' : ''} selecionado{clipCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <ScrollArea className="max-h-[70vh]">
          <CardContent className="p-4 space-y-6">
            {/* Social Networks Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Redes Sociais</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={selectAllNetworks}
                >
                  {selectedNetworks.size === SOCIAL_NETWORKS.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SOCIAL_NETWORKS.map((network) => {
                  const isSelected = selectedNetworks.has(network.id);
                  const IconComponent = network.icon;
                  
                  return (
                    <button
                      key={network.id}
                      onClick={() => toggleNetwork(network.id)}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
                        isSelected
                          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                          : "border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-border"
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                      
                      <div className={cn(
                        "h-12 w-12 rounded-full flex items-center justify-center text-white transition-transform",
                        network.bgColor,
                        isSelected && "scale-110"
                      )}>
                        <IconComponent />
                      </div>
                      
                      <span className={cn(
                        "text-sm font-medium",
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {network.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campaign Selector */}
            {campaigns.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Megaphone className="h-4 w-4 text-primary" />
                  Campanha (opcional)
                </Label>
                <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vincular a uma campanha..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma campanha</SelectItem>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        <div className="flex items-center gap-2">
                          <span>{campaign.name}</span>
                          <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                            {campaign.status === 'active' ? 'Ativa' : 'Rascunho'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {clipUrl && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Mídia Selecionada</Label>
                <div className="rounded-lg overflow-hidden border border-border/50 bg-muted/30">
                  <video 
                    src={clipUrl} 
                    className="w-full h-32 object-cover"
                    muted
                  />
                  <div className="p-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Video className="h-3 w-3" />
                    <span>Clip de vídeo anexado</span>
                  </div>
                </div>
              </div>
            )}

            {/* Caption */}
            <div className="space-y-2">
              <Label htmlFor="caption" className="text-sm font-medium">Legenda (opcional)</Label>
              <textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={`⚽ Melhores momentos: ${matchTitle}`}
                className="w-full min-h-[80px] rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            {/* Share Mode */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Quando publicar?</Label>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShareMode('now')}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 transition-all",
                    shareMode === 'now'
                      ? "border-primary bg-primary/10"
                      : "border-border/50 bg-muted/30 hover:bg-muted/50"
                  )}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    shareMode === 'now' ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <Send className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Agora</p>
                    <p className="text-xs text-muted-foreground">Publicar imediatamente</p>
                  </div>
                </button>

                <button
                  onClick={() => setShareMode('schedule')}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 transition-all",
                    shareMode === 'schedule'
                      ? "border-primary bg-primary/10"
                      : "border-border/50 bg-muted/30 hover:bg-muted/50"
                  )}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    shareMode === 'schedule' ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <CalendarIcon className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Agendar</p>
                    <p className="text-xs text-muted-foreground">Escolher data e hora</p>
                  </div>
                </button>
              </div>

              {/* Schedule Options */}
              {shareMode === 'schedule' && (
                <div className="flex gap-3 mt-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal",
                          !scheduleDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {scheduleDate 
                          ? format(scheduleDate, 'dd/MM/yyyy', { locale: ptBR }) 
                          : 'Selecionar data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={setScheduleDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="pl-9 w-32"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border/50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedNetworks.size} rede{selectedNetworks.size !== 1 ? 's' : ''} selecionada{selectedNetworks.size !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleShare}
                disabled={selectedNetworks.size === 0 || isSharing}
                className="bg-gradient-to-r from-primary to-primary/80"
              >
                {isSharing ? (
                  <>Compartilhando...</>
                ) : shareMode === 'schedule' ? (
                  <>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    Agendar
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Compartilhar Agora
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
