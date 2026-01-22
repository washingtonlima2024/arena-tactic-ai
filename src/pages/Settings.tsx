import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamFormDialog } from '@/components/teams/TeamFormDialog';
import { TeamCard } from '@/components/teams/TeamCard';
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam, type Team } from '@/hooks/useTeams';
import { useApiSettings, useUpsertApiSetting } from '@/hooks/useApiSettings';
import { apiClient } from '@/lib/apiClient';
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
  Loader2,
  Server,
  Eye,
  EyeOff,
  Sparkles,
  Brain,
  Mic,
  Trash2,
  HardDrive,
  RefreshCw,
  Wifi
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiBase, getCloudflareUrl as getStoredCloudflareUrl, setCloudflareUrl as saveCloudflareUrl, isLovableEnvironment, getActiveConnectionMethod, autoDiscoverServer, resetDiscoveryCache } from '@/lib/apiMode';

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

  // AI Provider settings
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [geminiEnabled, setGeminiEnabled] = useState(true);
  
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini');
  const [openaiEnabled, setOpenaiEnabled] = useState(false);

  // ElevenLabs settings
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('');
  const [elevenlabsEnabled, setElevenlabsEnabled] = useState(true);

  // Ollama settings
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<Array<{name: string; size: string; family: string}>>([]);
  const [loadingOllamaModels, setLoadingOllamaModels] = useState(false);
  const [testingOllama, setTestingOllama] = useState(false);

  // Local Whisper settings (FREE transcription)
  const [localWhisperEnabled, setLocalWhisperEnabled] = useState(false);
  const [localWhisperModel, setLocalWhisperModel] = useState('base');

  // Ngrok URL setting (legacy - mantido para compatibilidade)
  const [ngrokUrl, setNgrokUrl] = useState('');
  
  // Cloudflare Tunnel URL setting (legacy - mantido para compatibilidade)
  const [cloudflareUrl, setCloudflareUrl] = useState('');

  const [showGeminiKey, setShowGeminiKey] = useState(false);
  
  // Storage cleanup state
  const [tempFolders, setTempFolders] = useState<{name: string; size_bytes: number}[]>([]);
  const [loadingTempFolders, setLoadingTempFolders] = useState(false);
  const [cleaningStorage, setCleaningStorage] = useState(false);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showElevenlabsKey, setShowElevenlabsKey] = useState(false);

  // API Mode - Sempre local
  const apiMode = 'local';

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
      
      // AI Provider settings
      setGeminiApiKey(apiSettings.find(s => s.setting_key === 'gemini_api_key')?.setting_value || '');
      setGeminiModel(apiSettings.find(s => s.setting_key === 'gemini_model')?.setting_value || 'gemini-2.5-flash');
      setGeminiEnabled(apiSettings.find(s => s.setting_key === 'gemini_enabled')?.setting_value !== 'false');
      
      setOpenaiApiKey(apiSettings.find(s => s.setting_key === 'openai_api_key')?.setting_value || '');
      setOpenaiModel(apiSettings.find(s => s.setting_key === 'openai_model')?.setting_value || 'gpt-4o-mini');
      setOpenaiEnabled(apiSettings.find(s => s.setting_key === 'openai_enabled')?.setting_value === 'true');
      
      // ElevenLabs settings
      setElevenlabsApiKey(apiSettings.find(s => s.setting_key === 'elevenlabs_api_key')?.setting_value || '');
      setElevenlabsEnabled(apiSettings.find(s => s.setting_key === 'elevenlabs_enabled')?.setting_value !== 'false');
      
      // Ollama settings
      setOllamaUrl(apiSettings.find(s => s.setting_key === 'ollama_url')?.setting_value || 'http://localhost:11434');
      setOllamaModel(apiSettings.find(s => s.setting_key === 'ollama_model')?.setting_value || 'llama3.2');
      setOllamaEnabled(apiSettings.find(s => s.setting_key === 'ollama_enabled')?.setting_value === 'true');
      
      // Local Whisper settings
      setLocalWhisperEnabled(apiSettings.find(s => s.setting_key === 'local_whisper_enabled')?.setting_value === 'true');
      setLocalWhisperModel(apiSettings.find(s => s.setting_key === 'local_whisper_model')?.setting_value || 'base');
      
      // Ngrok URL - legacy (não mais usado)
      const storedNgrokUrl = localStorage.getItem('ngrok_fallback_url') || '';
      setNgrokUrl(storedNgrokUrl);
      
      // Cloudflare Tunnel URL
      const storedCloudflareUrl = getStoredCloudflareUrl() || '';
      setCloudflareUrl(storedCloudflareUrl);
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
        // AI Provider settings - use correct key names for Python server
        upsertApiSetting.mutateAsync({ key: 'gemini_api_key', value: geminiApiKey }),
        upsertApiSetting.mutateAsync({ key: 'gemini_model', value: geminiModel }),
        upsertApiSetting.mutateAsync({ key: 'gemini_enabled', value: String(geminiEnabled) }),
        upsertApiSetting.mutateAsync({ key: 'openai_api_key', value: openaiApiKey }),
        upsertApiSetting.mutateAsync({ key: 'openai_model', value: openaiModel }),
        upsertApiSetting.mutateAsync({ key: 'openai_enabled', value: String(openaiEnabled) }),
        // ElevenLabs settings
        upsertApiSetting.mutateAsync({ key: 'elevenlabs_api_key', value: elevenlabsApiKey }),
        upsertApiSetting.mutateAsync({ key: 'elevenlabs_enabled', value: String(elevenlabsEnabled) }),
        // Ollama settings
        upsertApiSetting.mutateAsync({ key: 'ollama_url', value: ollamaUrl }),
        upsertApiSetting.mutateAsync({ key: 'ollama_model', value: ollamaModel }),
        upsertApiSetting.mutateAsync({ key: 'ollama_enabled', value: String(ollamaEnabled) }),
        // Local Whisper settings
        upsertApiSetting.mutateAsync({ key: 'local_whisper_enabled', value: String(localWhisperEnabled) }),
        upsertApiSetting.mutateAsync({ key: 'local_whisper_model', value: localWhisperModel }),
        // Also save with standard env var names for Python server compatibility
        ...(geminiApiKey ? [upsertApiSetting.mutateAsync({ key: 'GOOGLE_GENERATIVE_AI_API_KEY', value: geminiApiKey })] : []),
        ...(openaiApiKey ? [upsertApiSetting.mutateAsync({ key: 'OPENAI_API_KEY', value: openaiApiKey })] : []),
        ...(elevenlabsApiKey ? [upsertApiSetting.mutateAsync({ key: 'ELEVENLABS_API_KEY', value: elevenlabsApiKey })] : []),
        upsertApiSetting.mutateAsync({ key: 'OLLAMA_URL', value: ollamaUrl }),
        upsertApiSetting.mutateAsync({ key: 'OLLAMA_MODEL', value: ollamaModel }),
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

  // Storage cleanup functions
  const fetchTempFolders = async () => {
    setLoadingTempFolders(true);
    try {
      const baseUrl = localStorage.getItem('arenaApiUrl') || 
        (window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://75c7a7f57d85.ngrok-free.app');
      const response = await fetch(`${baseUrl}/api/storage/temp-folders`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (response.ok) {
        const data = await response.json();
        setTempFolders(data.folders || []);
      }
    } catch (error) {
      console.error('Failed to fetch temp folders:', error);
    } finally {
      setLoadingTempFolders(false);
    }
  };

  const handleCleanupStorage = async () => {
    setCleaningStorage(true);
    try {
      const baseUrl = localStorage.getItem('arenaApiUrl') || 
        (window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://75c7a7f57d85.ngrok-free.app');
      const response = await fetch(`${baseUrl}/api/storage/cleanup-temp`, {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Limpeza concluída! ${data.deleted_count || 0} pastas removidas, ${formatBytes(data.freed_bytes || 0)} liberados.`);
        setTempFolders([]);
      } else {
        toast.error('Erro ao limpar storage');
      }
    } catch (error) {
      toast.error('Servidor não disponível');
    } finally {
      setCleaningStorage(false);
    }
  };

  const handleCleanupOrphans = async () => {
    setCleaningOrphans(true);
    try {
      const result = await apiClient.cleanupOrphanRecords();
      if (result.success) {
        const deleted = result.deleted || {};
        const totalDeleted = Object.values(deleted).reduce((sum: number, val: number) => sum + (val || 0), 0);
        toast.success(`Limpeza concluída! ${totalDeleted} registros órfãos removidos.`);
      } else {
        toast.error('Erro ao limpar registros órfãos');
      }
    } catch (error) {
      console.error('Cleanup orphans error:', error);
      toast.error('Servidor não disponível');
    } finally {
      setCleaningOrphans(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalTempSize = tempFolders.reduce((sum, f) => sum + (f.size_bytes || 0), 0);

  // Testar conexão com servidor Python
  const testServerConnection = async () => {
    try {
      const urlToTest = getApiBase();
      
      const response = await fetch(`${urlToTest}/health?light=true`, {
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`Servidor conectado! Versão: ${data.version || 'N/A'}`);
      } else {
        toast.error('Servidor respondeu com erro');
      }
    } catch (error) {
      toast.error('Não foi possível conectar ao servidor');
    }
  };

  // Buscar modelos Ollama instalados
  const fetchOllamaModels = async () => {
    setLoadingOllamaModels(true);
    try {
      const data = await apiClient.getOllamaModels();
      if (data.connected && data.models.length > 0) {
        setOllamaModels(data.models);
        // Se modelo atual não está na lista, selecionar o primeiro
        const modelNames = data.models.map(m => m.name);
        if (!modelNames.includes(ollamaModel) && !modelNames.some(m => m.includes(ollamaModel))) {
          // Manter o modelo atual se for customizado
        }
      } else if (data.error) {
        console.warn('Ollama não disponível:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error);
    } finally {
      setLoadingOllamaModels(false);
    }
  };

  // Testar conexão Ollama
  const testOllamaConnection = async () => {
    setTestingOllama(true);
    try {
      const result = await apiClient.testOllamaConnection(ollamaUrl, ollamaModel);
      if (result.success) {
        toast.success(result.message || 'Ollama conectado!');
      } else {
        toast.error(result.error || 'Falha ao conectar');
      }
    } catch (error) {
      toast.error('Erro ao testar conexão');
    } finally {
      setTestingOllama(false);
    }
  };

  // Buscar modelos quando Ollama for ativado ou URL mudar
  useEffect(() => {
    if (ollamaEnabled) {
      fetchOllamaModels();
    }
  }, [ollamaEnabled]);

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
            {/* Google Gemini Configuration */}
            <Card variant="glow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-blue-500" />
                      Google Gemini
                    </CardTitle>
                    <CardDescription>
                      Modelos avançados para análise de vídeo e texto
                    </CardDescription>
                  </div>
                  <Switch 
                    checked={geminiEnabled} 
                    onCheckedChange={setGeminiEnabled}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Chave de API</Label>
                    <div className="relative">
                      <Input 
                        type={showGeminiKey ? 'text' : 'password'}
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="AIza..."
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                      >
                        {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Modelo</Label>
                    <Select value={geminiModel} onValueChange={setGeminiModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro (Mais preciso)</SelectItem>
                        <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (Balanceado)</SelectItem>
                        <SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Rápido)</SelectItem>
                        <SelectItem value="gemini-3-pro-preview">Gemini 3 Pro Preview</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${geminiEnabled && geminiApiKey ? 'border-green-500/30 bg-green-500/5' : 'border-muted bg-muted/30'}`}>
                  <div className="flex items-center gap-2">
                    {geminiEnabled && geminiApiKey ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-500">Configurado e ativo</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {!geminiEnabled ? 'Desativado' : 'Aguardando chave de API'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* OpenAI GPT Configuration */}
            <Card variant="glow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-green-500" />
                      OpenAI GPT
                    </CardTitle>
                    <CardDescription>
                      Modelos de linguagem para análise e geração de texto
                    </CardDescription>
                  </div>
                  <Switch 
                    checked={openaiEnabled} 
                    onCheckedChange={setOpenaiEnabled}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Chave de API</Label>
                    <div className="relative">
                      <Input 
                        type={showOpenaiKey ? 'text' : 'password'}
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                      >
                        {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Modelo</Label>
                    <Select value={openaiModel} onValueChange={setOpenaiModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-5">GPT-5 (Mais avançado)</SelectItem>
                        <SelectItem value="gpt-5-mini">GPT-5 Mini (Balanceado)</SelectItem>
                        <SelectItem value="gpt-5-nano">GPT-5 Nano (Rápido)</SelectItem>
                        <SelectItem value="gpt-4o">GPT-4o (Multimodal)</SelectItem>
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini (Custo-benefício)</SelectItem>
                        <SelectItem value="o3">O3 (Raciocínio avançado)</SelectItem>
                        <SelectItem value="o4-mini">O4 Mini (Raciocínio rápido)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${openaiEnabled && openaiApiKey ? 'border-green-500/30 bg-green-500/5' : 'border-muted bg-muted/30'}`}>
                  <div className="flex items-center gap-2">
                    {openaiEnabled && openaiApiKey ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-500">Configurado e ativo</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {!openaiEnabled ? 'Desativado' : 'Aguardando chave de API'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ElevenLabs Configuration */}
            <Card variant="glow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Mic className="h-5 w-5 text-purple-500" />
                      ElevenLabs
                    </CardTitle>
                    <CardDescription>
                      Transcrição de áudio e síntese de voz de alta qualidade
                    </CardDescription>
                  </div>
                  <Switch 
                    checked={elevenlabsEnabled} 
                    onCheckedChange={setElevenlabsEnabled}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Chave de API</Label>
                  <div className="relative">
                    <Input 
                      type={showElevenlabsKey ? 'text' : 'password'}
                      value={elevenlabsApiKey}
                      onChange={(e) => setElevenlabsApiKey(e.target.value)}
                      placeholder="sk_..."
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowElevenlabsKey(!showElevenlabsKey)}
                    >
                      {showElevenlabsKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Usado para transcrição de vídeos grandes (até 100MB) via ElevenLabs Scribe
                  </p>
                </div>
                <div className={`rounded-lg border p-3 ${elevenlabsEnabled && elevenlabsApiKey ? 'border-green-500/30 bg-green-500/5' : 'border-muted bg-muted/30'}`}>
                  <div className="flex items-center gap-2">
                    {elevenlabsEnabled && elevenlabsApiKey ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-500">Configurado e ativo</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {!elevenlabsEnabled ? 'Desativado' : 'Aguardando chave de API'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Local Whisper Configuration (FREE!) */}
            <Card variant="glow" className="border-emerald-500/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Mic className="h-5 w-5 text-emerald-500" />
                      Whisper Local
                      <Badge variant="outline" className="ml-2 text-emerald-500 border-emerald-500/50">
                        GRATUITO
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Transcrição 100% local e offline usando Faster-Whisper
                    </CardDescription>
                  </div>
                  <Switch 
                    checked={localWhisperEnabled} 
                    onCheckedChange={async (checked) => {
                      setLocalWhisperEnabled(checked);
                      try {
                        await upsertApiSetting.mutateAsync({ 
                          key: 'local_whisper_enabled', 
                          value: String(checked) 
                        });
                        toast.success(checked ? 'Whisper Local ativado!' : 'Whisper Local desativado');
                      } catch (error) {
                        setLocalWhisperEnabled(!checked);
                        toast.error('Erro ao salvar configuração');
                      }
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Select 
                    value={localWhisperModel} 
                    onValueChange={async (value) => {
                      setLocalWhisperModel(value);
                      try {
                        await upsertApiSetting.mutateAsync({ 
                          key: 'local_whisper_model', 
                          value 
                        });
                        toast.success(`Modelo alterado para ${value}`);
                      } catch (error) {
                        toast.error('Erro ao salvar modelo');
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiny">Tiny (~40MB) - Mais rápido, qualidade básica</SelectItem>
                      <SelectItem value="base">Base (~150MB) - Equilíbrio velocidade/qualidade</SelectItem>
                      <SelectItem value="small">Small (~500MB) - Boa qualidade</SelectItem>
                      <SelectItem value="medium">Medium (~1.5GB) - Alta qualidade</SelectItem>
                      <SelectItem value="large-v3">Large V3 (~3GB) - Qualidade profissional</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    O modelo será baixado automaticamente na primeira transcrição
                  </p>
                </div>
                
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-emerald-600">Vantagens:</p>
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        <li>• 100% gratuito - sem custos de API</li>
                        <li>• Funciona offline após download do modelo</li>
                        <li>• Sem limite de tamanho de arquivo</li>
                        <li>• Suporta aceleração GPU (CUDA) se disponível</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                <div className={`rounded-lg border p-3 ${localWhisperEnabled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-muted bg-muted/30'}`}>
                  <div className="flex items-center gap-2">
                    {localWhisperEnabled ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm text-emerald-500">Ativo (prioridade máxima na transcrição)</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Desativado - usando APIs pagas</span>
                      </>
                    )}
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Requer instalação: <code className="bg-muted px-1 rounded">pip install faster-whisper</code> no servidor Python
                </p>
              </CardContent>
            </Card>

            {/* Ollama Configuration */}
            <Card variant="glow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-orange-500" />
                      Ollama (Local)
                    </CardTitle>
                    <CardDescription>
                      Modelos de IA rodando localmente - gratuito e offline
                    </CardDescription>
                  </div>
                  <Switch 
                    checked={ollamaEnabled} 
                    onCheckedChange={setOllamaEnabled}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>URL do Servidor</Label>
                    <Input 
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Modelo</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchOllamaModels}
                        disabled={loadingOllamaModels}
                        className="h-6 px-2"
                      >
                        <RefreshCw className={`h-3 w-3 ${loadingOllamaModels ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                    <Select value={ollamaModel} onValueChange={setOllamaModel}>
                      <SelectTrigger>
                        <SelectValue placeholder={loadingOllamaModels ? "Carregando..." : "Selecione um modelo"} />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Modelos instalados dinamicamente */}
                        {ollamaModels.length > 0 ? (
                          <>
                            <SelectItem value="" disabled className="text-xs text-muted-foreground">
                              📦 Modelos Instalados
                            </SelectItem>
                            {ollamaModels.map(model => (
                              <SelectItem key={model.name} value={model.name}>
                                {model.name} ({model.size})
                              </SelectItem>
                            ))}
                          </>
                        ) : (
                          <>
                            {/* Fallback para lista estática se Ollama offline */}
                            <SelectItem value="llama3.2">Llama 3.2 (8B)</SelectItem>
                            <SelectItem value="llama3.2:1b">Llama 3.2 (1B - Rápido)</SelectItem>
                            <SelectItem value="llama3.1">Llama 3.1 (8B)</SelectItem>
                            <SelectItem value="mistral">Mistral (7B)</SelectItem>
                            <SelectItem value="qwen2.5">Qwen 2.5 (7B)</SelectItem>
                            <SelectItem value="gemma2">Gemma 2 (9B)</SelectItem>
                            <SelectItem value="deepseek-r1">DeepSeek R1</SelectItem>
                            <SelectItem value="phi3">Phi-3 (3.8B)</SelectItem>
                          </>
                        )}
                        
                        {/* Sempre incluir modelo atual se não estiver na lista */}
                        {ollamaModel && !ollamaModels.find(m => m.name === ollamaModel) && ollamaModels.length > 0 && (
                          <SelectItem value={ollamaModel}>{ollamaModel} (atual)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Botão de teste */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testOllamaConnection}
                    disabled={testingOllama || !ollamaEnabled}
                  >
                    {testingOllama ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Wifi className="h-4 w-4 mr-2" />
                    )}
                    Testar Conexão
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Verifica se o Ollama está rodando e o modelo responde
                  </p>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Instale o Ollama em <a href="https://ollama.com" target="_blank" className="text-primary hover:underline">ollama.com</a> e execute: <code className="bg-muted px-1 rounded">ollama pull {ollamaModel}</code>
                </p>
                <div className={`rounded-lg border p-3 ${ollamaEnabled ? 'border-orange-500/30 bg-orange-500/5' : 'border-muted bg-muted/30'}`}>
                  <div className="flex items-center gap-2">
                    {ollamaEnabled ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-orange-500" />
                        <span className="text-sm text-orange-500">Prioridade ativa (será usado primeiro)</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Desativado - usando APIs na nuvem</span>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Features Overview */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Funcionalidades de IA
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { name: 'Análise de Vídeo', desc: 'Detecção de jogadores, bola e jogadas', provider: 'Gemini' },
                    { name: 'Transcrição de Áudio', desc: 'Conversão de narração em texto', provider: 'Whisper/GPT' },
                    { name: 'Geração de Insights', desc: 'Análise tática automatizada', provider: 'Gemini/GPT' },
                    { name: 'Extração de Eventos', desc: 'Identificação de gols, faltas, etc.', provider: 'Gemini' },
                  ].map((feature) => (
                    <div key={feature.name} className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{feature.name}</p>
                        <p className="text-xs text-muted-foreground">{feature.desc}</p>
                        <p className="text-xs text-primary/70 mt-1">Provedor: {feature.provider}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Servidor Python - Configuração Híbrida */}
            <Card variant="glow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-green-500" />
                  Servidor Python
                </CardTitle>
                <CardDescription>
                  Servidor de processamento de vídeo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Indicador de modo atual */}
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium text-green-600">Modo Local Ativo</p>
                      <p className="text-sm text-muted-foreground">
                        IP Fixo: <code className="bg-muted px-1 rounded font-mono">10.0.0.20:5000</code>
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Cloudflare Tunnel (Opcional - para acesso remoto) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-orange-500" />
                        Cloudflare Tunnel (Opcional)
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use apenas para acesso fora da rede local
                      </p>
                    </div>
                    {cloudflareUrl && (
                      <Badge variant="outline">Configurado</Badge>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Input 
                      value={cloudflareUrl}
                      onChange={(e) => setCloudflareUrl(e.target.value)}
                      placeholder="https://api.arenaplay.kakttus.com"
                      className="flex-1"
                    />
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        if (cloudflareUrl) {
                          saveCloudflareUrl(cloudflareUrl);
                          toast.success('URL Cloudflare salva!');
                        } else {
                          saveCloudflareUrl('');
                          toast.info('URL Cloudflare removida');
                        }
                      }}
                    >
                      Salvar
                    </Button>
                  </div>

                  {isLovableEnvironment() && !cloudflareUrl && (
                    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-medium text-yellow-600">Acesso remoto</p>
                          <p className="text-muted-foreground">
                            Se estiver acessando de fora da rede local, configure a URL do 
                            Cloudflare Tunnel para conectar ao servidor.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Botões de ação */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={async () => {
                      toast.info('Buscando servidor...');
                      resetDiscoveryCache();
                      const discovered = await autoDiscoverServer();
                      if (discovered) {
                        toast.success(`Servidor encontrado: ${discovered.replace('http://', '')}`);
                      } else {
                        toast.error('Nenhum servidor encontrado na rede local');
                      }
                    }}
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Buscar Servidor
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={testServerConnection}
                    className="flex-1"
                  >
                    <Wifi className="h-4 w-4 mr-2" />
                    Testar Conexão
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Conexão ativa: {getActiveConnectionMethod().label}
                </p>
              </CardContent>
            </Card>

            {/* Storage Maintenance */}
            <Card variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-orange-500" />
                  Manutenção de Storage
                </CardTitle>
                <CardDescription>
                  Limpe arquivos temporários para liberar espaço em disco
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Pastas Temporárias (temp-*)</p>
                    <p className="text-sm text-muted-foreground">
                      {tempFolders.length > 0 
                        ? `${tempFolders.length} pastas ocupando ${formatBytes(totalTempSize)}`
                        : 'Clique em verificar para escanear'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchTempFolders}
                      disabled={loadingTempFolders}
                    >
                      {loadingTempFolders ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Verificar'
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleCleanupStorage}
                      disabled={cleaningStorage || tempFolders.length === 0}
                    >
                      {cleaningStorage ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Limpando...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Limpar
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {tempFolders.length > 0 && (
                  <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                    <p className="text-sm text-orange-500 mb-2">Pastas a serem removidas:</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {tempFolders.map((folder) => (
                        <div key={folder.name} className="flex justify-between text-xs text-muted-foreground">
                          <span>{folder.name}</span>
                          <span>{formatBytes(folder.size_bytes)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Pastas temp-* são criadas durante uploads interrompidos. É seguro removê-las.
                </p>

                <Separator className="my-4" />

                {/* Orphan Records Cleanup */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Registros Órfãos no Banco</p>
                    <p className="text-sm text-muted-foreground">
                      Remove eventos, vídeos e jobs sem partida associada
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleCleanupOrphans}
                    disabled={cleaningOrphans}
                  >
                    {cleaningOrphans ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Limpando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Limpar Órfãos
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Útil quando a deleção de partidas não removeu todos os registros relacionados.
                </p>
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
