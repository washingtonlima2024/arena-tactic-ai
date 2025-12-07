import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamFormDialog } from '@/components/teams/TeamFormDialog';
import { TeamCard } from '@/components/teams/TeamCard';
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam, type Team } from '@/hooks/useTeams';
import { useApiSettings, useUpsertApiSetting } from '@/hooks/useApiSettings';
import { toast } from 'sonner';
import { 
  Settings as SettingsIcon, 
  User,
  Bell,
  Palette,
  Database,
  Key,
  Globe,
  Zap,
  Plus,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';

export default function Settings() {
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deleteConfirmTeam, setDeleteConfirmTeam] = useState<Team | null>(null);

  // Profile settings
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileOrg, setProfileOrg] = useState('');
  
  // Appearance settings
  const [darkMode, setDarkMode] = useState(true);
  const [animations, setAnimations] = useState(true);

  // Notification settings
  const [notifyAnalysis, setNotifyAnalysis] = useState(true);
  const [notifyInsights, setNotifyInsights] = useState(true);
  const [notifyErrors, setNotifyErrors] = useState(true);
  const [notifyUpdates, setNotifyUpdates] = useState(false);

  // Teams
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  // API Settings
  const { data: apiSettings, isLoading: settingsLoading } = useApiSettings();
  const upsertApiSetting = useUpsertApiSetting();

  // Load settings from database
  useEffect(() => {
    if (apiSettings) {
      setProfileName(apiSettings.find(s => s.setting_key === 'profile_name')?.setting_value || '');
      setProfileEmail(apiSettings.find(s => s.setting_key === 'profile_email')?.setting_value || '');
      setProfileOrg(apiSettings.find(s => s.setting_key === 'profile_org')?.setting_value || '');
      setDarkMode(apiSettings.find(s => s.setting_key === 'dark_mode')?.setting_value !== 'false');
      setAnimations(apiSettings.find(s => s.setting_key === 'animations')?.setting_value !== 'false');
      setNotifyAnalysis(apiSettings.find(s => s.setting_key === 'notify_analysis')?.setting_value !== 'false');
      setNotifyInsights(apiSettings.find(s => s.setting_key === 'notify_insights')?.setting_value !== 'false');
      setNotifyErrors(apiSettings.find(s => s.setting_key === 'notify_errors')?.setting_value !== 'false');
      setNotifyUpdates(apiSettings.find(s => s.setting_key === 'notify_updates')?.setting_value === 'true');
    }
  }, [apiSettings]);

  const handleSaveAllSettings = async () => {
    try {
      await Promise.all([
        upsertApiSetting.mutateAsync({ key: 'profile_name', value: profileName }),
        upsertApiSetting.mutateAsync({ key: 'profile_email', value: profileEmail }),
        upsertApiSetting.mutateAsync({ key: 'profile_org', value: profileOrg }),
        upsertApiSetting.mutateAsync({ key: 'dark_mode', value: String(darkMode) }),
        upsertApiSetting.mutateAsync({ key: 'animations', value: String(animations) }),
        upsertApiSetting.mutateAsync({ key: 'notify_analysis', value: String(notifyAnalysis) }),
        upsertApiSetting.mutateAsync({ key: 'notify_insights', value: String(notifyInsights) }),
        upsertApiSetting.mutateAsync({ key: 'notify_errors', value: String(notifyErrors) }),
        upsertApiSetting.mutateAsync({ key: 'notify_updates', value: String(notifyUpdates) }),
      ]);
      toast.success('Todas as configurações foram salvas!');
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    }
  };

  const handleCreateTeam = async (data: any) => {
    try {
      await createTeam.mutateAsync(data);
      toast.success('Time criado com sucesso!');
      setTeamDialogOpen(false);
    } catch (error) {
      toast.error('Erro ao criar time');
    }
  };

  const handleUpdateTeam = async (data: any) => {
    try {
      await updateTeam.mutateAsync(data);
      toast.success('Time atualizado!');
      setTeamDialogOpen(false);
      setEditingTeam(null);
    } catch (error) {
      toast.error('Erro ao atualizar time');
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    try {
      await deleteTeam.mutateAsync(team.id);
      toast.success('Time removido!');
      setDeleteConfirmTeam(null);
    } catch (error) {
      toast.error('Erro ao remover time');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-display text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie times, preferências e configurações do sistema
          </p>
        </div>

        <Tabs defaultValue="teams" className="space-y-6">
          <TabsList>
            <TabsTrigger value="teams">
              <Shield className="mr-2 h-4 w-4" />
              Times
            </TabsTrigger>
            <TabsTrigger value="general">
              <SettingsIcon className="mr-2 h-4 w-4" />
              Geral
            </TabsTrigger>
            <TabsTrigger value="api">
              <Key className="mr-2 h-4 w-4" />
              APIs
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="mr-2 h-4 w-4" />
              Notificações
            </TabsTrigger>
          </TabsList>

          {/* Teams Tab */}
          <TabsContent value="teams" className="space-y-6">
            <Card variant="glow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Gerenciar Times
                    </CardTitle>
                    <CardDescription>
                      Cadastre e gerencie os times para análise
                    </CardDescription>
                  </div>
                  <Button 
                    variant="arena" 
                    onClick={() => {
                      setEditingTeam(null);
                      setTeamDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Time
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {teamsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : teams && teams.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {teams.map((team) => (
                      <TeamCard
                        key={team.id}
                        team={team}
                        onEdit={(t) => {
                          setEditingTeam(t);
                          setTeamDialogOpen(true);
                        }}
                        onDelete={(t) => setDeleteConfirmTeam(t)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Nenhum time cadastrado ainda
                    </p>
                    <Button 
                      variant="arena-outline" 
                      onClick={() => setTeamDialogOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Cadastrar Primeiro Time
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Delete Confirmation */}
            {deleteConfirmTeam && (
              <Card variant="glass" className="border-destructive/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      <p>
                        Confirma a exclusão de <strong>{deleteConfirmTeam.name}</strong>?
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setDeleteConfirmTeam(null)}
                      >
                        Cancelar
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDeleteTeam(deleteConfirmTeam)}
                        disabled={deleteTeam.isPending}
                      >
                        {deleteTeam.isPending ? 'Removendo...' : 'Confirmar'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-6">
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Perfil
                </CardTitle>
                <CardDescription>
                  Informações da sua conta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input 
                      value={profileName} 
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Seu nome"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input 
                      value={profileEmail} 
                      onChange={(e) => setProfileEmail(e.target.value)}
                      type="email" 
                      placeholder="seu@email.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Organização</Label>
                  <Input 
                    value={profileOrg} 
                    onChange={(e) => setProfileOrg(e.target.value)}
                    placeholder="Nome da organização"
                  />
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Aparência
                </CardTitle>
                <CardDescription>
                  Personalize a interface do sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Tema Escuro</p>
                    <p className="text-sm text-muted-foreground">Ativar modo escuro</p>
                  </div>
                  <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Animações</p>
                    <p className="text-sm text-muted-foreground">Ativar efeitos visuais</p>
                  </div>
                  <Switch checked={animations} onCheckedChange={setAnimations} />
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Idioma e Região
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Idioma</Label>
                    <Input defaultValue="Português (Brasil)" readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Fuso Horário</Label>
                    <Input defaultValue="America/Sao_Paulo (GMT-3)" readOnly />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Tab */}
          <TabsContent value="api" className="space-y-6">
            <Card variant="glow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Integrações de IA
                </CardTitle>
                <CardDescription>
                  A análise de vídeo e áudio utiliza IA integrada do Lovable Cloud
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <p className="font-medium text-primary">Lovable AI Ativo</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    O sistema utiliza modelos avançados (Gemini 2.5 Flash) para análise de vídeo 
                    e transcrição de áudio, sem necessidade de configuração adicional.
                  </p>
                </div>

                <Separator />

                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Funcionalidades disponíveis:
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      { name: 'Análise de Vídeo', desc: 'Detecção de jogadores, bola e jogadas' },
                      { name: 'Transcrição de Áudio', desc: 'Conversão de narração em texto' },
                      { name: 'Geração de Insights', desc: 'Análise tática automatizada' },
                      { name: 'Extração de Eventos', desc: 'Identificação automática de gols, faltas, etc.' },
                    ].map((feature) => (
                      <div key={feature.name} className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{feature.name}</p>
                          <p className="text-xs text-muted-foreground">{feature.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Banco de Dados
                </CardTitle>
                <CardDescription>
                  Status do armazenamento
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <p className="font-medium text-primary">Lovable Cloud Conectado</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Times, partidas e análises são salvos automaticamente no banco de dados.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Preferências de Notificação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Análise Concluída</p>
                    <p className="text-sm text-muted-foreground">Quando uma análise de vídeo for finalizada</p>
                  </div>
                  <Switch checked={notifyAnalysis} onCheckedChange={setNotifyAnalysis} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Novos Insights</p>
                    <p className="text-sm text-muted-foreground">Quando insights táticos importantes forem detectados</p>
                  </div>
                  <Switch checked={notifyInsights} onCheckedChange={setNotifyInsights} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Erros de Processamento</p>
                    <p className="text-sm text-muted-foreground">Quando ocorrer um erro no processamento</p>
                  </div>
                  <Switch checked={notifyErrors} onCheckedChange={setNotifyErrors} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Atualizações do Sistema</p>
                    <p className="text-sm text-muted-foreground">Sobre novas funcionalidades e melhorias</p>
                  </div>
                  <Switch checked={notifyUpdates} onCheckedChange={setNotifyUpdates} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Cancelar
          </Button>
          <Button 
            variant="arena" 
            onClick={handleSaveAllSettings}
            disabled={upsertApiSetting.isPending}
          >
            {upsertApiSetting.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Alterações'
            )}
          </Button>
        </div>
      </div>

      <TeamFormDialog
        open={teamDialogOpen}
        onOpenChange={setTeamDialogOpen}
        team={editingTeam}
        onSubmit={editingTeam ? handleUpdateTeam : handleCreateTeam}
        isLoading={createTeam.isPending || updateTeam.isPending}
      />
    </AppLayout>
  );
}
