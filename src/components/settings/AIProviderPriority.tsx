import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  GripVertical, 
  ArrowUp, 
  ArrowDown,
  Sparkles,
  Brain,
  Server,
  Cloud,
  Zap,
  CheckCircle2,
  AlertCircle,
  Save
} from 'lucide-react';
import { useUpsertApiSetting, type ApiSetting } from '@/hooks/useApiSettings';

export interface AIProvider {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  priority: number;
  enabled: boolean;
  hasApiKey?: boolean;
}

interface AIProviderPriorityProps {
  apiSettings: ApiSetting[] | undefined;
  ollamaEnabled: boolean;
  geminiEnabled: boolean;
  geminiApiKey: string;
  openaiEnabled: boolean;
  openaiApiKey: string;
}

const DEFAULT_PROVIDERS: Omit<AIProvider, 'priority' | 'enabled' | 'hasApiKey'>[] = [
  {
    id: 'ollama',
    name: 'kakttus.ai Local',
    description: 'IA local e offline',
    icon: <Server className="h-5 w-5" />,
    color: 'orange',
  },
  {
    id: 'lovable',
    name: 'kakttus Cloud',
    description: 'Gateway na nuvem',
    icon: <Sparkles className="h-5 w-5" />,
    color: 'pink',
  },
  {
    id: 'gemini',
    name: 'kakttus Pro',
    description: 'Motor de análise avançado',
    icon: <Brain className="h-5 w-5" />,
    color: 'blue',
  },
  {
    id: 'openai',
    name: 'kakttus Vision',
    description: 'Motor de linguagem premium',
    icon: <Cloud className="h-5 w-5" />,
    color: 'green',
  },
];

export function AIProviderPriority({ 
  apiSettings,
  ollamaEnabled,
  geminiEnabled,
  geminiApiKey,
  openaiEnabled,
  openaiApiKey,
}: AIProviderPriorityProps) {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const upsertApiSetting = useUpsertApiSetting();

  // Load provider priorities from settings - ONLY on initial load
  useEffect(() => {
    if (apiSettings && !isInitialized) {
      const loadedProviders: AIProvider[] = DEFAULT_PROVIDERS.map((p, index) => {
        const priorityKey = `ai_provider_${p.id}_priority`;
        const storedPriority = apiSettings.find(s => s.setting_key === priorityKey)?.setting_value;
        const priority = storedPriority ? parseInt(storedPriority, 10) : index + 1;
        
        // Determine if enabled based on priority (0 = disabled) or existing settings
        let enabled = priority > 0;
        let hasApiKey = true;
        
        if (p.id === 'ollama') {
          enabled = ollamaEnabled && priority > 0;
        } else if (p.id === 'gemini') {
          enabled = geminiEnabled && priority > 0;
          hasApiKey = !!geminiApiKey;
        } else if (p.id === 'openai') {
          enabled = openaiEnabled && priority > 0;
          hasApiKey = !!openaiApiKey;
        } else if (p.id === 'lovable') {
          // Lovable AI is always available
          enabled = priority > 0;
          hasApiKey = true;
        }
        
        return {
          ...p,
          priority: priority || index + 1,
          enabled,
          hasApiKey,
        };
      });

      // Sort by priority
      loadedProviders.sort((a, b) => {
        if (a.priority === 0) return 1;
        if (b.priority === 0) return -1;
        return a.priority - b.priority;
      });

      setProviders(loadedProviders);
      setIsInitialized(true);
    }
  }, [apiSettings, ollamaEnabled, geminiEnabled, geminiApiKey, openaiEnabled, openaiApiKey, isInitialized]);

  // Separate effect to update hasApiKey status without resetting order
  useEffect(() => {
    if (!isInitialized) return;
    
    setProviders(prev => {
      if (prev.length === 0) return prev;
      
      return prev.map(p => {
        let hasApiKey = p.hasApiKey;
        
        if (p.id === 'gemini') {
          hasApiKey = !!geminiApiKey;
        } else if (p.id === 'openai') {
          hasApiKey = !!openaiApiKey;
        }
        
        // Only update if hasApiKey actually changed
        if (hasApiKey === p.hasApiKey) return p;
        return { ...p, hasApiKey };
      });
    });
  }, [geminiApiKey, openaiApiKey, isInitialized]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newProviders = [...providers];
    [newProviders[index - 1], newProviders[index]] = [newProviders[index], newProviders[index - 1]];
    updatePriorities(newProviders);
    setHasChanges(true);
  };

  const moveDown = (index: number) => {
    if (index === providers.length - 1) return;
    const newProviders = [...providers];
    [newProviders[index], newProviders[index + 1]] = [newProviders[index + 1], newProviders[index]];
    updatePriorities(newProviders);
    setHasChanges(true);
  };

  const toggleProvider = (index: number) => {
    const newProviders = [...providers];
    newProviders[index] = {
      ...newProviders[index],
      enabled: !newProviders[index].enabled,
      priority: newProviders[index].enabled ? 0 : index + 1,
    };
    updatePriorities(newProviders);
    setHasChanges(true);
  };

  const updatePriorities = (providerList: AIProvider[]) => {
    let priorityCounter = 1;
    const updated = providerList.map(p => ({
      ...p,
      priority: p.enabled ? priorityCounter++ : 0,
    }));
    setProviders(updated);
  };

  const savePriorities = async () => {
    try {
      const promises = providers.map(p => 
        upsertApiSetting.mutateAsync({ 
          key: `ai_provider_${p.id}_priority`, 
          value: String(p.priority) 
        })
      );
      await Promise.all(promises);
      setHasChanges(false);
      toast.success('Prioridades de IA salvas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar prioridades');
    }
  };

  const getColorClasses = (color: string, enabled: boolean) => {
    if (!enabled) return 'border-muted bg-muted/30 opacity-60';
    
    const colors: Record<string, string> = {
      orange: 'border-orange-500/30 bg-orange-500/5',
      pink: 'border-pink-500/30 bg-pink-500/5',
      blue: 'border-blue-500/30 bg-blue-500/5',
      green: 'border-green-500/30 bg-green-500/5',
    };
    return colors[color] || 'border-muted bg-muted/30';
  };

  const getIconColor = (color: string, enabled: boolean) => {
    if (!enabled) return 'text-muted-foreground';
    
    const colors: Record<string, string> = {
      orange: 'text-orange-500',
      pink: 'text-pink-500',
      blue: 'text-blue-500',
      green: 'text-green-500',
    };
    return colors[color] || 'text-muted-foreground';
  };

  const activeProviders = providers.filter(p => p.enabled);

  return (
    <Card variant="glow" className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Ordem de Prioridade dos Provedores de IA
            </CardTitle>
            <CardDescription>
              Configure a ordem de fallback dos provedores de IA para análise de transcrições
            </CardDescription>
          </div>
          {hasChanges && (
            <Button onClick={savePriorities} size="sm">
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info box */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Como funciona:</p>
              <p className="text-muted-foreground text-xs">
                O sistema tentará os provedores na ordem configurada. Se o primeiro falhar, 
                tentará o próximo ativo até conseguir uma resposta.
              </p>
            </div>
          </div>
        </div>

        {/* Provider list */}
        <div className="space-y-2">
          {providers.map((provider, index) => (
            <div
              key={provider.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${getColorClasses(provider.color, provider.enabled)}`}
            >
              {/* Drag handle / Priority number */}
              <div className="flex items-center gap-2 w-12">
                <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                {provider.enabled && (
                  <Badge variant="outline" className="h-6 w-6 p-0 flex items-center justify-center text-xs">
                    {provider.priority}
                  </Badge>
                )}
              </div>

              {/* Icon */}
              <div className={getIconColor(provider.color, provider.enabled)}>
                {provider.icon}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${!provider.enabled ? 'text-muted-foreground' : ''}`}>
                    {provider.name}
                  </span>
                  {!provider.hasApiKey && provider.id !== 'ollama' && provider.id !== 'lovable' && (
                    <Badge variant="outline" className="text-yellow-500 border-yellow-500/50 text-xs">
                      Sem chave
                    </Badge>
                  )}
                  {provider.id === 'lovable' && (
                    <Badge variant="outline" className="text-pink-500 border-pink-500/50 text-xs">
                      Sempre disponível
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{provider.description}</p>
              </div>

              {/* Move buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => moveUp(index)}
                  disabled={index === 0 || !provider.enabled}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => moveDown(index)}
                  disabled={index === providers.length - 1 || !provider.enabled}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>

              {/* Toggle */}
              <Switch
                checked={provider.enabled}
                onCheckedChange={() => toggleProvider(index)}
              />
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="rounded-lg border p-3 bg-muted/30">
          <div className="flex items-center gap-2">
            {activeProviders.length > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  <span className="font-medium">{activeProviders.length}</span> provedor(es) ativo(s): {' '}
                  {activeProviders.map((p, i) => (
                    <span key={p.id}>
                      <span className={getIconColor(p.color, true)}>{p.name}</span>
                      {i < activeProviders.length - 1 && ' → '}
                    </span>
                  ))}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive">
                  Nenhum provedor ativo! A análise não funcionará.
                </span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
