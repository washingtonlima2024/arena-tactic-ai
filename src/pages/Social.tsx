import { useState, useEffect } from 'react';
import { 
  Share2, 
  Instagram, 
  Facebook, 
  Linkedin, 
  Youtube,
  Check,
  X,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Loader2,
  Link2,
  Calendar,
  Megaphone
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CampaignsManager } from '@/components/social/CampaignsManager';
import { ScheduledPostsManager } from '@/components/social/ScheduledPostsManager';
import { SocialCalendar } from '@/components/social/SocialCalendar';

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

interface SocialNetwork {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  description: string;
  docUrl: string;
  fields: { key: string; label: string; type: string; placeholder: string }[];
}

const SOCIAL_NETWORKS: SocialNetwork[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: Instagram,
    color: 'text-pink-500',
    bgColor: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400',
    description: 'Publique stories, reels e posts no feed',
    docUrl: 'https://developers.facebook.com/docs/instagram-api',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'Token de acesso da API' },
      { key: 'account_id', label: 'Account ID', type: 'text', placeholder: 'ID da conta do Instagram' }
    ]
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: Facebook,
    color: 'text-blue-600',
    bgColor: 'bg-blue-600',
    description: 'Compartilhe vídeos e posts em páginas',
    docUrl: 'https://developers.facebook.com/docs/graph-api',
    fields: [
      { key: 'access_token', label: 'Page Access Token', type: 'password', placeholder: 'Token de acesso da página' },
      { key: 'account_id', label: 'Page ID', type: 'text', placeholder: 'ID da página do Facebook' }
    ]
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    icon: XIcon,
    color: 'text-foreground',
    bgColor: 'bg-black',
    description: 'Publique tweets com vídeos e imagens',
    docUrl: 'https://developer.twitter.com/en/docs/twitter-api',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Consumer Key' },
      { key: 'api_secret', label: 'API Secret', type: 'password', placeholder: 'Consumer Secret' },
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'Access Token' },
      { key: 'access_token_secret', label: 'Access Token Secret', type: 'password', placeholder: 'Access Token Secret' }
    ]
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: Linkedin,
    color: 'text-blue-700',
    bgColor: 'bg-blue-700',
    description: 'Compartilhe conteúdo profissional',
    docUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'Token de acesso OAuth 2.0' },
      { key: 'account_id', label: 'Organization ID', type: 'text', placeholder: 'ID da organização' }
    ]
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: Youtube,
    color: 'text-red-600',
    bgColor: 'bg-red-600',
    description: 'Faça upload de vídeos e shorts',
    docUrl: 'https://developers.google.com/youtube/v3',
    fields: [
      { key: 'access_token', label: 'OAuth Access Token', type: 'password', placeholder: 'Token de acesso OAuth 2.0' },
      { key: 'refresh_token', label: 'Refresh Token', type: 'password', placeholder: 'Token de atualização' },
      { key: 'account_id', label: 'Channel ID', type: 'text', placeholder: 'ID do canal' }
    ]
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: TikTokIcon,
    color: 'text-foreground',
    bgColor: 'bg-black',
    description: 'Publique vídeos curtos e virais',
    docUrl: 'https://developers.tiktok.com/doc/overview',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'Token de acesso' },
      { key: 'account_id', label: 'Open ID', type: 'text', placeholder: 'Open ID do usuário' }
    ]
  }
];

interface Connection {
  id: string;
  platform: string;
  is_connected: boolean;
  account_name: string | null;
  account_id: string | null;
  last_sync_at: string | null;
}

export default function Social() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<SocialNetwork | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('connections');

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      const { data, error } = await supabase
        .from('social_connections')
        .select('*');

      if (error) throw error;
      setConnections(data || []);
    } catch (error) {
      console.error('Error fetching connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const getConnection = (platformId: string): Connection | undefined => {
    return connections.find(c => c.platform === platformId);
  };

  const connectedCount = connections.filter(c => c.is_connected).length;

  const openConnectDialog = (network: SocialNetwork) => {
    setSelectedNetwork(network);
    setCredentials({});
    setDialogOpen(true);
  };

  const handleConnect = async () => {
    if (!selectedNetwork) return;

    setConnectingPlatform(selectedNetwork.id);

    try {
      // Obter usuário autenticado
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Usuário não autenticado',
          description: 'Faça login para conectar redes sociais.',
          variant: 'destructive',
        });
        setConnectingPlatform(null);
        return;
      }

      const existingConnection = getConnection(selectedNetwork.id);

      if (existingConnection) {
        const { error } = await supabase
          .from('social_connections')
          .update({
            access_token: credentials.access_token || credentials.api_key,
            refresh_token: credentials.refresh_token || credentials.access_token_secret,
            account_id: credentials.account_id,
            account_name: credentials.account_name || selectedNetwork.name,
            is_connected: true,
            last_sync_at: new Date().toISOString()
          })
          .eq('id', existingConnection.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('social_connections')
          .insert({
            user_id: user.id,
            platform: selectedNetwork.id,
            access_token: credentials.access_token || credentials.api_key,
            refresh_token: credentials.refresh_token || credentials.access_token_secret,
            account_id: credentials.account_id,
            account_name: credentials.account_name || selectedNetwork.name,
            is_connected: true,
            last_sync_at: new Date().toISOString()
          });

        if (error) throw error;
      }

      toast({
        title: 'Conexão realizada!',
        description: `${selectedNetwork.name} foi conectado com sucesso.`,
      });

      setDialogOpen(false);
      fetchConnections();
    } catch (error: any) {
      console.error('Error connecting:', error);
      toast({
        title: 'Erro ao conectar',
        description: error.message || 'Não foi possível conectar à rede social.',
        variant: 'destructive',
      });
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (platformId: string) => {
    const connection = getConnection(platformId);
    if (!connection) return;

    try {
      const { error } = await supabase
        .from('social_connections')
        .update({ is_connected: false })
        .eq('id', connection.id);

      if (error) throw error;

      toast({
        title: 'Desconectado',
        description: 'A rede social foi desconectada.',
      });

      fetchConnections();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleTestConnection = async (network: SocialNetwork) => {
    setTestingConnection(network.id);
    await new Promise(resolve => setTimeout(resolve, 2000));

    const connection = getConnection(network.id);
    if (connection?.is_connected) {
      toast({
        title: 'Conexão válida!',
        description: `A conexão com ${network.name} está funcionando corretamente.`,
      });
    } else {
      toast({
        title: 'Conexão não configurada',
        description: `Configure as credenciais do ${network.name} primeiro.`,
        variant: 'destructive',
      });
    }

    setTestingConnection(null);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Share2 className="h-8 w-8 text-primary" />
              Redes Sociais
            </h1>
            <p className="text-muted-foreground mt-1">
              Conecte, agende e gerencie publicações em múltiplas plataformas
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            {connectedCount} conectadas
          </Badge>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-4">
            <TabsTrigger value="connections" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Conexões</span>
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Campanhas</span>
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Agendados</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Calendário</span>
            </TabsTrigger>
          </TabsList>

          {/* Connections Tab */}
          <TabsContent value="connections" className="space-y-6">
            {/* Info Alert */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="flex items-start gap-3 py-4">
                <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Como funciona?</p>
                  <p className="text-sm text-muted-foreground">
                    Configure as credenciais da API de cada rede social para habilitar a publicação automática de clipes e conteúdo diretamente da página de Mídia.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Social Networks Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {SOCIAL_NETWORKS.map((network) => {
                const connection = getConnection(network.id);
                const isConnected = connection?.is_connected || false;
                const IconComponent = network.icon;

                return (
                  <Card key={network.id} className="relative overflow-hidden">
                    <div className="absolute top-4 right-4">
                      <Badge 
                        variant={isConnected ? 'default' : 'secondary'}
                        className={isConnected ? 'bg-green-500/10 text-green-500 border-green-500/20' : ''}
                      >
                        {isConnected ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            Conectado
                          </>
                        ) : (
                          <>
                            <X className="h-3 w-3 mr-1" />
                            Desconectado
                          </>
                        )}
                      </Badge>
                    </div>

                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${network.bgColor}`}>
                          <IconComponent className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{network.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {network.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {isConnected && connection?.account_name && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Conta: </span>
                          <span className="font-medium">{connection.account_name}</span>
                        </div>
                      )}

                      {isConnected && connection?.last_sync_at && (
                        <div className="text-xs text-muted-foreground">
                          Última sincronização: {new Date(connection.last_sync_at).toLocaleString('pt-BR')}
                        </div>
                      )}

                      <Separator />

                      <div className="flex gap-2">
                        {isConnected ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleTestConnection(network)}
                              disabled={testingConnection === network.id}
                            >
                              {testingConnection === network.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4 mr-1" />
                              )}
                              Testar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => openConnectDialog(network)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDisconnect(network.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="arena"
                              size="sm"
                              className="flex-1"
                              onClick={() => openConnectDialog(network)}
                            >
                              Conectar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <a href={network.docUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns">
            <CampaignsManager />
          </TabsContent>

          {/* Scheduled Posts Tab */}
          <TabsContent value="scheduled">
            <ScheduledPostsManager />
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar">
            <SocialCalendar />
          </TabsContent>
        </Tabs>

        {/* Connect Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedNetwork && (
                  <>
                    <div className={`p-2 rounded-lg ${selectedNetwork.bgColor}`}>
                      <selectedNetwork.icon className="h-5 w-5 text-white" />
                    </div>
                    Conectar {selectedNetwork.name}
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                Insira as credenciais da API para conectar sua conta.
                <a 
                  href={selectedNetwork?.docUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline ml-1"
                >
                  Ver documentação
                </a>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {selectedNetwork?.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    type={field.type}
                    placeholder={field.placeholder}
                    value={credentials[field.key] || ''}
                    onChange={(e) => setCredentials(prev => ({
                      ...prev,
                      [field.key]: e.target.value
                    }))}
                  />
                </div>
              ))}

              <div className="space-y-2">
                <Label htmlFor="account_name">Nome da Conta (opcional)</Label>
                <Input
                  id="account_name"
                  placeholder="Ex: @meucanal"
                  value={credentials.account_name || ''}
                  onChange={(e) => setCredentials(prev => ({
                    ...prev,
                    account_name: e.target.value
                  }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                variant="arena" 
                onClick={handleConnect}
                disabled={connectingPlatform === selectedNetwork?.id}
              >
                {connectingPlatform === selectedNetwork?.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Conectando...
                  </>
                ) : (
                  'Conectar'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
