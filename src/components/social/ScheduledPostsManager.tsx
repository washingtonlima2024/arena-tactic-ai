import { useState, useEffect } from 'react';
import { 
  Calendar,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Image,
  Video,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  Sparkles,
  CalendarClock
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, isPast, isToday, isTomorrow, addDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// X (Twitter) icon component
const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// TikTok icon component  
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
);

interface ScheduledPost {
  id: string;
  platform: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  scheduled_at: string;
  published_at: string | null;
  status: string;
  error_message: string | null;
  campaign_id: string | null;
  campaign?: { name: string };
}

interface Campaign {
  id: string;
  name: string;
}

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-500', bgColor: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400' },
  { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'text-blue-600', bgColor: 'bg-blue-600' },
  { id: 'x', name: 'X', icon: XIcon, color: 'text-foreground', bgColor: 'bg-black' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'text-blue-700', bgColor: 'bg-blue-700' },
  { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'text-red-600', bgColor: 'bg-red-600' },
  { id: 'tiktok', name: 'TikTok', icon: TikTokIcon, color: 'text-foreground', bgColor: 'bg-black' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  scheduled: { label: 'Agendado', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Clock },
  publishing: { label: 'Publicando', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: Loader2 },
  published: { label: 'Publicado', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
  failed: { label: 'Falhou', color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: XCircle },
  cancelled: { label: 'Cancelado', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: XCircle },
};

export function ScheduledPostsManager() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [publishing, setPublishing] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    platform: '',
    content: '',
    media_url: '',
    media_type: 'video',
    scheduled_at: null as Date | null,
    campaign_id: '',
  });

  useEffect(() => {
    fetchPosts();
    fetchCampaigns();
  }, []);

  const fetchPosts = async () => {
    try {
      let query = supabase
        .from('social_scheduled_posts')
        .select('*')
        .order('scheduled_at', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('social_campaigns')
        .select('id, name')
        .in('status', ['draft', 'active', 'paused']);

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    }
  };

  const openCreateDialog = () => {
    setEditingPost(null);
    const tomorrow = addDays(new Date(), 1);
    tomorrow.setHours(12, 0, 0, 0);
    setFormData({
      platform: 'instagram',
      content: '',
      media_url: '',
      media_type: 'video',
      scheduled_at: tomorrow,
      campaign_id: '',
    });
    setDialogOpen(true);
  };

  const openEditDialog = (post: ScheduledPost) => {
    setEditingPost(post);
    const scheduledAt = new Date(post.scheduled_at);
    setFormData({
      platform: post.platform,
      content: post.content,
      media_url: post.media_url || '',
      media_type: post.media_type || 'video',
      scheduled_at: scheduledAt,
      campaign_id: post.campaign_id || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.platform || !formData.content || !formData.scheduled_at) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }

    if (isPast(formData.scheduled_at)) {
      toast({ title: 'A data deve ser no futuro', variant: 'destructive' });
      return;
    }

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Você precisa estar logado', variant: 'destructive' });
        return;
      }

      if (editingPost) {
        const { error } = await supabase
          .from('social_scheduled_posts')
          .update({
            platform: formData.platform,
            content: formData.content,
            media_url: formData.media_url || null,
            media_type: formData.media_type || null,
            scheduled_at: formData.scheduled_at.toISOString(),
            campaign_id: formData.campaign_id || null,
          })
          .eq('id', editingPost.id);

        if (error) throw error;
        toast({ title: 'Post atualizado!' });
      } else {
        const { error } = await supabase
          .from('social_scheduled_posts')
          .insert({
            user_id: user.id,
            platform: formData.platform,
            content: formData.content,
            media_url: formData.media_url || null,
            media_type: formData.media_type || null,
            scheduled_at: formData.scheduled_at.toISOString(),
            campaign_id: formData.campaign_id || null,
          });

        if (error) throw error;
        toast({ title: 'Post agendado!' });
      }

      setDialogOpen(false);
      fetchPosts();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const publishNow = async (post: ScheduledPost) => {
    setPublishing(post.id);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Você precisa estar logado', variant: 'destructive' });
        setPublishing(null);
        return;
      }

      // Update status to publishing
      await supabase
        .from('social_scheduled_posts')
        .update({ status: 'publishing' })
        .eq('id', post.id);

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('social-publish', {
        body: {
          platform: post.platform,
          content: post.content,
          mediaUrl: post.media_url,
          userId: user.id,
        }
      });

      if (error) throw error;

      if (data.success) {
        await supabase
          .from('social_scheduled_posts')
          .update({ 
            status: 'published',
            published_at: new Date().toISOString(),
            external_post_id: data.result?.id || data.result?.data?.id
          })
          .eq('id', post.id);

        toast({ title: 'Publicado com sucesso!' });
      } else {
        throw new Error(data.error || 'Falha ao publicar');
      }
    } catch (error: any) {
      await supabase
        .from('social_scheduled_posts')
        .update({ 
          status: 'failed',
          error_message: error.message
        })
        .eq('id', post.id);

      toast({ title: 'Erro ao publicar', description: error.message, variant: 'destructive' });
    } finally {
      setPublishing(null);
      fetchPosts();
    }
  };

  const cancelPost = async (postId: string) => {
    try {
      const { error } = await supabase
        .from('social_scheduled_posts')
        .update({ status: 'cancelled' })
        .eq('id', postId);

      if (error) throw error;
      toast({ title: 'Post cancelado' });
      fetchPosts();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const deletePost = async (postId: string) => {
    if (!confirm('Excluir este post?')) return;

    try {
      const { error } = await supabase
        .from('social_scheduled_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
      toast({ title: 'Post excluído' });
      fetchPosts();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Hoje';
    if (isTomorrow(date)) return 'Amanhã';
    return format(date, "dd 'de' MMMM", { locale: ptBR });
  };

  const filteredPosts = posts.filter(post => {
    if (filterStatus !== 'all' && post.status !== filterStatus) return false;
    if (filterPlatform !== 'all' && post.platform !== filterPlatform) return false;
    return true;
  });

  // Group posts by date
  const groupedPosts = filteredPosts.reduce((acc, post) => {
    const dateKey = format(new Date(post.scheduled_at), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(post);
    return acc;
  }, {} as Record<string, ScheduledPost[]>);

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Posts Agendados
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie e agende publicações nas redes sociais
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterPlatform} onValueChange={setFilterPlatform}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Plataforma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {PLATFORMS.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="arena" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Agendar Post
          </Button>
        </div>
      </div>

      {/* Posts List */}
      {Object.keys(groupedPosts).length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum post agendado</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Agende sua primeira publicação
            </p>
            <Button variant="arena" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Agendar Post
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedPosts).sort().map(([dateKey, datePosts]) => (
            <div key={dateKey}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {getDateLabel(dateKey)}
              </h3>
              <div className="space-y-3">
                {datePosts.map((post) => {
                  const platform = PLATFORMS.find(p => p.id === post.platform);
                  const statusConfig = STATUS_CONFIG[post.status] || STATUS_CONFIG.scheduled;
                  const StatusIcon = statusConfig.icon;
                  const PlatformIcon = platform?.icon || Calendar;

                  return (
                    <Card key={post.id} className="overflow-hidden">
                      <div className="flex items-start gap-4 p-4">
                        {/* Platform Icon */}
                        <div className={`p-2 rounded-lg ${platform?.bgColor || 'bg-gray-500'} shrink-0`}>
                          <PlatformIcon className="h-5 w-5 text-white" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={statusConfig.color}>
                              <StatusIcon className={`h-3 w-3 mr-1 ${post.status === 'publishing' ? 'animate-spin' : ''}`} />
                              {statusConfig.label}
                            </Badge>
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(post.scheduled_at), 'HH:mm')}
                            </span>
                            {post.media_url && (
                              <Badge variant="outline" className="text-xs">
                                {post.media_type === 'video' ? <Video className="h-3 w-3 mr-1" /> : <Image className="h-3 w-3 mr-1" />}
                                {post.media_type}
                              </Badge>
                            )}
                          </div>

                          <p className="text-sm line-clamp-2">{post.content}</p>

                          {post.error_message && (
                            <div className="flex items-center gap-1 text-xs text-destructive">
                              <AlertCircle className="h-3 w-3" />
                              {post.error_message}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {post.status === 'scheduled' && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => publishNow(post)}
                                disabled={publishing === post.id}
                              >
                                {publishing === post.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4" />
                                )}
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => openEditDialog(post)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-destructive"
                                onClick={() => cancelPost(post.id)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {(post.status === 'failed' || post.status === 'cancelled') && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-destructive"
                              onClick={() => deletePost(post.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPost ? 'Editar Post Agendado' : 'Agendar Novo Post'}
            </DialogTitle>
            <DialogDescription>
              Configure o conteúdo e o horário da publicação
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Plataforma *</Label>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map(platform => {
                  const Icon = platform.icon;
                  return (
                    <Button
                      key={platform.id}
                      type="button"
                      variant={formData.platform === platform.id ? 'default' : 'outline'}
                      className="justify-start"
                      onClick={() => setFormData(prev => ({ ...prev, platform: platform.id }))}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {platform.name}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Conteúdo *</Label>
              <Textarea
                id="content"
                placeholder="Escreva o texto do post..."
                rows={4}
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground text-right">
                {formData.content.length} caracteres
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="media_url">URL da Mídia (opcional)</Label>
              <Input
                id="media_url"
                placeholder="https://..."
                value={formData.media_url}
                onChange={(e) => setFormData(prev => ({ ...prev, media_url: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                Data e Hora *
              </Label>
              <DateTimePicker
                date={formData.scheduled_at || undefined}
                onDateChange={(date) => setFormData(prev => ({ ...prev, scheduled_at: date || null }))}
                placeholder="Selecionar data e hora"
                minDate={startOfDay(new Date())}
              />
            </div>

            {campaigns.length > 0 && (
              <div className="space-y-2">
                <Label>Campanha (opcional)</Label>
                <Select 
                  value={formData.campaign_id} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, campaign_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar campanha" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhuma</SelectItem>
                    {campaigns.map(campaign => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="arena" onClick={handleSubmit}>
              {editingPost ? 'Salvar' : 'Agendar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
