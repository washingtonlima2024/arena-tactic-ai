import { useState, useEffect } from 'react';
import { 
  Calendar,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Target,
  Megaphone,
  MoreVertical,
  CalendarDays,
  Sparkles
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/apiClient';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  target_platforms: string[];
  tags: string[];
  created_at: string;
  posts_count?: number;
}

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', color: 'bg-pink-500' },
  { id: 'facebook', name: 'Facebook', color: 'bg-blue-600' },
  { id: 'x', name: 'X (Twitter)', color: 'bg-black' },
  { id: 'linkedin', name: 'LinkedIn', color: 'bg-blue-700' },
  { id: 'youtube', name: 'YouTube', color: 'bg-red-600' },
  { id: 'tiktok', name: 'TikTok', color: 'bg-gray-900' },
  { id: 'whatsapp', name: 'WhatsApp Business', color: 'bg-green-500' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Rascunho', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: Edit2 },
  active: { label: 'Ativa', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: Play },
  paused: { label: 'Pausada', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: Pause },
  completed: { label: 'Concluída', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: CheckCircle },
  cancelled: { label: 'Cancelada', color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: XCircle },
};

export function CampaignsManager() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: null as Date | null,
    end_date: null as Date | null,
    target_platforms: [] as string[],
    tags: '',
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const data = await apiClient.get<Campaign[]>('/api/social/campaigns');
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingCampaign(null);
    setFormData({
      name: '',
      description: '',
      start_date: null,
      end_date: null,
      target_platforms: [],
      tags: '',
    });
    setDialogOpen(true);
  };

  const openEditDialog = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      description: campaign.description || '',
      start_date: campaign.start_date ? new Date(campaign.start_date) : null,
      end_date: campaign.end_date ? new Date(campaign.end_date) : null,
      target_platforms: campaign.target_platforms || [],
      tags: (campaign.tags || []).join(', '),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }

    if (!user) {
      toast({ title: 'Usuário não autenticado', variant: 'destructive' });
      return;
    }

    try {
      const tagsArray = formData.tags.split(',').map(t => t.trim()).filter(Boolean);

      if (editingCampaign) {
        await apiClient.put(`/api/social/campaigns/${editingCampaign.id}`, {
          name: formData.name,
          description: formData.description || null,
          start_date: formData.start_date?.toISOString() || null,
          end_date: formData.end_date?.toISOString() || null,
          target_platforms: formData.target_platforms,
          tags: tagsArray,
        });
        toast({ title: 'Campanha atualizada!' });
      } else {
        await apiClient.post('/api/social/campaigns', {
          user_id: user.id,
          name: formData.name,
          description: formData.description || null,
          start_date: formData.start_date?.toISOString() || null,
          end_date: formData.end_date?.toISOString() || null,
          target_platforms: formData.target_platforms,
          tags: tagsArray,
        });
        toast({ title: 'Campanha criada!' });
      }

      setDialogOpen(false);
      fetchCampaigns();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const updateStatus = async (campaignId: string, status: string) => {
    try {
      await apiClient.put(`/api/social/campaigns/${campaignId}`, { status });
      toast({ title: `Status atualizado para ${STATUS_CONFIG[status].label}` });
      fetchCampaigns();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;
    try {
      await apiClient.delete(`/api/social/campaigns/${campaignId}`);
      toast({ title: 'Campanha excluída' });
      fetchCampaigns();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const togglePlatform = (platformId: string) => {
    setFormData(prev => ({
      ...prev,
      target_platforms: prev.target_platforms.includes(platformId)
        ? prev.target_platforms.filter(p => p !== platformId)
        : [...prev.target_platforms, platformId]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Campanhas
          </h2>
          <p className="text-sm text-muted-foreground">
            Organize seus posts em campanhas de marketing
          </p>
        </div>
        <Button variant="arena" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {/* Campaigns Grid */}
      {campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma campanha</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Crie sua primeira campanha para organizar seus posts
            </p>
            <Button variant="arena" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const statusConfig = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft;
            const StatusIcon = statusConfig.icon;

            return (
              <Card key={campaign.id} className="relative overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{campaign.name}</CardTitle>
                      {campaign.description && (
                        <CardDescription className="line-clamp-2">
                          {campaign.description}
                        </CardDescription>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(campaign)}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        {campaign.status === 'draft' && (
                          <DropdownMenuItem onClick={() => updateStatus(campaign.id, 'active')}>
                            <Play className="h-4 w-4 mr-2" />
                            Ativar
                          </DropdownMenuItem>
                        )}
                        {campaign.status === 'active' && (
                          <DropdownMenuItem onClick={() => updateStatus(campaign.id, 'paused')}>
                            <Pause className="h-4 w-4 mr-2" />
                            Pausar
                          </DropdownMenuItem>
                        )}
                        {campaign.status === 'paused' && (
                          <DropdownMenuItem onClick={() => updateStatus(campaign.id, 'active')}>
                            <Play className="h-4 w-4 mr-2" />
                            Retomar
                          </DropdownMenuItem>
                        )}
                        {(campaign.status === 'active' || campaign.status === 'paused') && (
                          <DropdownMenuItem onClick={() => updateStatus(campaign.id, 'completed')}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Concluir
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => deleteCampaign(campaign.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Status */}
                  <Badge className={statusConfig.color}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {statusConfig.label}
                  </Badge>

                  {/* Platforms */}
                  {campaign.target_platforms && campaign.target_platforms.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {campaign.target_platforms.map(platform => {
                        const platformInfo = PLATFORMS.find(p => p.id === platform);
                        return platformInfo ? (
                          <Badge key={platform} variant="outline" className="text-xs">
                            {platformInfo.name}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}

                  {/* Dates */}
                  {(campaign.start_date || campaign.end_date) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />
                      {campaign.start_date && format(new Date(campaign.start_date), 'dd/MM/yy', { locale: ptBR })}
                      {campaign.start_date && campaign.end_date && ' - '}
                      {campaign.end_date && format(new Date(campaign.end_date), 'dd/MM/yy', { locale: ptBR })}
                    </div>
                  )}

                  {/* Posts count */}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{campaign.posts_count || 0} posts agendados</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign ? 'Editar Campanha' : 'Nova Campanha'}
            </DialogTitle>
            <DialogDescription>
              {editingCampaign 
                ? 'Atualize as informações da campanha'
                : 'Crie uma campanha para organizar seus posts'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Campanha *</Label>
              <Input
                id="name"
                placeholder="Ex: Lançamento do Campeonato"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descreva os objetivos da campanha..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !formData.start_date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formData.start_date ? format(formData.start_date, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={formData.start_date || undefined}
                      onSelect={(date) => setFormData(prev => ({ ...prev, start_date: date || null }))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Data de Término</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !formData.end_date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formData.end_date ? format(formData.end_date, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={formData.end_date || undefined}
                      onSelect={(date) => setFormData(prev => ({ ...prev, end_date: date || null }))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Plataformas Alvo</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(platform => (
                  <div
                    key={platform.id}
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => togglePlatform(platform.id)}
                  >
                    <Checkbox
                      checked={formData.target_platforms.includes(platform.id)}
                      onCheckedChange={() => togglePlatform(platform.id)}
                    />
                    <span className="text-sm">{platform.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
              <Input
                id="tags"
                placeholder="Ex: campeonato, lancamento, destaque"
                value={formData.tags}
                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="arena" onClick={handleSubmit}>
              {editingCampaign ? 'Salvar' : 'Criar Campanha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
