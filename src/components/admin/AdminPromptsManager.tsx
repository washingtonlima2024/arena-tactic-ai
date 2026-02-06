import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Brain, RotateCcw, Save, Pencil, Server, Cloud, Mic, Zap, Plus, Trash2, ChevronRight } from 'lucide-react';
import { useAiPrompts, AiPrompt } from '@/hooks/useAiPrompts';
import { apiClient } from '@/lib/apiClient';
// Admin mostra nomes reais dos modelos (sem branding kakttus)
import { useQuery } from '@tanstack/react-query';

// Modelos com nomes reais para a área Admin
const GEMINI_MODELS = [
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
];

const GPT_MODELS = [
  { value: 'openai/gpt-5', label: 'GPT-5' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano' },
];

const WHISPER_MODELS = [
  { value: 'whisper-local/tiny', label: 'Whisper Tiny' },
  { value: 'whisper-local/base', label: 'Whisper Base' },
  { value: 'whisper-local/small', label: 'Whisper Small' },
  { value: 'whisper-local/medium', label: 'Whisper Medium' },
  { value: 'whisper-local/large-v3', label: 'Whisper Large v3' },
];

// Variáveis disponíveis para templates de relatório
const REPORT_VARIABLES = [
  '{homeTeam}', '{awayTeam}', '{homeScore}', '{awayScore}',
  '{competition}', '{matchDate}', '{venue}', '{stats}',
  '{bestPlayer}', '{patterns}', '{totalEvents}',
  '{firstHalfCount}', '{secondHalfCount}', '{eventsList}',
];

// Variáveis disponíveis para templates de eventos
const EVENT_VARIABLES = [
  '{home_team}', '{away_team}', '{half_desc}',
  '{game_start_minute}', '{game_end_minute}', '{transcription}',
  '{home_score}', '{away_score}',
  '{first_half_summary}', '{first_half_tactical}',
  '{second_half_summary}', '{second_half_tactical}',
];

// Tipos de evento disponíveis para sub-prompts
const EVENT_TYPES = [
  { value: 'goal', label: '⚽ Gol' },
  { value: 'penalty', label: '🎯 Pênalti' },
  { value: 'foul', label: '🦶 Falta' },
  { value: 'corner', label: '🚩 Escanteio' },
  { value: 'shot', label: '💥 Chute' },
  { value: 'save', label: '🧤 Defesa' },
  { value: 'chance', label: '⚡ Chance' },
  { value: 'substitution', label: '🔄 Substituição' },
];

const CATEGORY_LABELS: Record<string, string> = {
  chatbot: 'Chatbot',
  report: 'Relatório',
  transcription: 'Transcrição',
  events: 'Geração de Eventos',
};

const CATEGORY_ICONS: Record<string, typeof Brain> = {
  chatbot: Brain,
  report: Brain,
  transcription: Mic,
  events: Zap,
};

function getModelType(model: string): 'local' | 'cloud' | 'whisper' {
  if (model.startsWith('whisper-local/')) return 'whisper';
  if (model.startsWith('google/') || model.startsWith('openai/')) return 'cloud';
  return 'local';
}

// Helper para nome do modelo no card
function getModelDisplayName(
  modelValue: string,
  ollamaModels: Array<{ value: string; label: string }>
): string {
  const whisper = WHISPER_MODELS.find(m => m.value === modelValue);
  if (whisper) return whisper.label;
  const gemini = GEMINI_MODELS.find(m => m.value === modelValue);
  if (gemini) return gemini.label;
  const gpt = GPT_MODELS.find(m => m.value === modelValue);
  if (gpt) return gpt.label;
  const ollama = ollamaModels.find(m => m.value === modelValue);
  if (ollama) return ollama.label;
  return modelValue;
}

export default function AdminPromptsManager() {
  const { prompts, isLoading, updatePrompt, restoreDefault, createSubPrompt, deletePrompt } = useAiPrompts();
  const [editingPrompt, setEditingPrompt] = useState<AiPrompt | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editModel, setEditModel] = useState('');
  const [creatingSubPrompt, setCreatingSubPrompt] = useState<string | null>(null); // parent_prompt_id
  const [newSubName, setNewSubName] = useState('');
  const [newSubEventType, setNewSubEventType] = useState('');
  const [newSubValue, setNewSubValue] = useState('');

  // Buscar modelos Ollama dinamicamente
  const { data: ollamaData } = useQuery({
    queryKey: ['ollama-models'],
    queryFn: () => apiClient.getOllamaModels(),
    retry: 1,
    staleTime: 60000,
  });

  const ollamaModels = (ollamaData?.models || []).map(m => ({
    value: m.name,
    label: m.parameter_size ? `${m.name} (${m.parameter_size})` : m.name,
  }));

  // Separar prompts principais e sub-prompts
  const mainPrompts = prompts.filter(p => !p.parent_prompt_id);
  const subPromptsMap = prompts.reduce<Record<string, AiPrompt[]>>((acc, p) => {
    if (p.parent_prompt_id) {
      if (!acc[p.parent_prompt_id]) acc[p.parent_prompt_id] = [];
      acc[p.parent_prompt_id].push(p);
    }
    return acc;
  }, {});

  const handleEdit = (prompt: AiPrompt) => {
    setEditingPrompt(prompt);
    setEditValue(prompt.prompt_value);
    setEditModel(prompt.ai_model);
  };

  const handleSave = () => {
    if (!editingPrompt) return;
    updatePrompt.mutate(
      { id: editingPrompt.id, prompt_value: editValue, ai_model: editModel },
      { onSuccess: () => setEditingPrompt(null) }
    );
  };

  const handleRestore = (id: string) => {
    restoreDefault.mutate(id);
  };

  const handleCreateSubPrompt = (parentId: string) => {
    const parent = prompts.find(p => p.id === parentId);
    if (!parent || !newSubEventType || !newSubName) return;

    // Verificar se já existe sub-prompt para esse tipo
    const existingSub = subPromptsMap[parentId]?.find(s => s.event_type_filter === newSubEventType);
    if (existingSub) return;

    createSubPrompt.mutate({
      parent_prompt_id: parentId,
      prompt_key: `${parent.prompt_key}_${newSubEventType}`,
      prompt_name: newSubName,
      prompt_value: newSubValue || `Regras específicas para ${newSubEventType}`,
      event_type_filter: newSubEventType,
      description: `Sub-prompt de ${newSubEventType} vinculado a "${parent.prompt_name}"`,
      category: parent.category,
      ai_model: parent.ai_model,
    }, {
      onSuccess: () => {
        setCreatingSubPrompt(null);
        setNewSubName('');
        setNewSubEventType('');
        setNewSubValue('');
      }
    });
  };

  const handleDeleteSubPrompt = (id: string) => {
    deletePrompt.mutate(id);
  };

  // Agrupar prompts por categoria
  const grouped = mainPrompts.reduce<Record<string, AiPrompt[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Prompts e Modelos de IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Prompts e Modelos de IA
          </CardTitle>
          <CardDescription>
            Edite os prompts e escolha qual modelo processa cada funcionalidade. Prompts de eventos suportam sub-prompts por tipo (gol, falta, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(grouped).map(([category, categoryPrompts]) => {
            const Icon = CATEGORY_ICONS[category] || Brain;
            return (
              <div key={category} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {CATEGORY_LABELS[category] || category}
                </h3>
                {categoryPrompts.map(prompt => {
                  const modelType = getModelType(prompt.ai_model);
                  const subs = subPromptsMap[prompt.id] || [];
                  const isEventCategory = prompt.category === 'events';

                  return (
                    <div key={prompt.id} className="space-y-0">
                      {/* Prompt principal */}
                      <PromptCard
                        prompt={prompt}
                        modelType={modelType}
                        ollamaModels={ollamaModels}
                        onEdit={() => handleEdit(prompt)}
                        onRestore={() => handleRestore(prompt.id)}
                        isRestoring={restoreDefault.isPending}
                      />

                      {/* Sub-prompts */}
                      {subs.length > 0 && (
                        <div className="ml-6 border-l-2 border-muted pl-4 space-y-2 mt-2">
                          {subs.map(sub => (
                            <SubPromptCard
                              key={sub.id}
                              prompt={sub}
                              ollamaModels={ollamaModels}
                              onEdit={() => handleEdit(sub)}
                              onRestore={() => handleRestore(sub.id)}
                              onDelete={() => handleDeleteSubPrompt(sub.id)}
                              isRestoring={restoreDefault.isPending}
                              isDeleting={deletePrompt.isPending}
                            />
                          ))}
                        </div>
                      )}

                      {/* Botão adicionar sub-prompt (apenas para eventos) */}
                      {isEventCategory && (
                        <div className="ml-6 mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground"
                            onClick={() => setCreatingSubPrompt(prompt.id)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Adicionar sub-prompt por tipo de evento
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Dialog de edição */}
      <Dialog open={!!editingPrompt} onOpenChange={(open) => !open && setEditingPrompt(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingPrompt?.parent_prompt_id && (
                <Badge variant="outline" className="text-xs">Sub-prompt</Badge>
              )}
              Editar: {editingPrompt?.prompt_name}
            </DialogTitle>
            <DialogDescription>{editingPrompt?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Tipo de evento (para sub-prompts) */}
            {editingPrompt?.event_type_filter && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Badge variant="secondary" className="text-xs">
                  {EVENT_TYPES.find(e => e.value === editingPrompt.event_type_filter)?.label || editingPrompt.event_type_filter}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Este sub-prompt é aplicado quando o tipo de evento é <strong>{editingPrompt.event_type_filter}</strong>
                </span>
              </div>
            )}

            {/* Seletor de modelo */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Modelo de IA</label>
              <ModelSelector
                value={editModel}
                onChange={setEditModel}
                category={editingPrompt?.category || ''}
                defaultModel={editingPrompt?.default_model || ''}
                ollamaModels={ollamaModels}
              />
            </div>

            {/* Textarea do prompt */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Texto do Prompt</label>
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={16}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground text-right">
                {editValue.length} caracteres
              </p>
            </div>

            {/* Legenda de variáveis para relatório */}
            {editingPrompt?.category === 'report' && editingPrompt?.prompt_key === 'report_user_template' && (
              <VariablesLegend variables={REPORT_VARIABLES} />
            )}

            {/* Legenda de variáveis para eventos */}
            {editingPrompt?.category === 'events' && !editingPrompt?.parent_prompt_id && (
              <div className="space-y-2">
                <VariablesLegend variables={EVENT_VARIABLES} title="Variáveis disponíveis (usadas pelo video-processor):" />
                <p className="text-xs text-muted-foreground px-3">
                  ⚠️ Estes prompts são usados pelo video-processor local. Alterações aqui servem como referência e documentação.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingPrompt(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={updatePrompt.isPending}>
              <Save className="h-4 w-4 mr-1" />
              {updatePrompt.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de criação de sub-prompt */}
      <Dialog open={!!creatingSubPrompt} onOpenChange={(open) => !open && setCreatingSubPrompt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Sub-prompt por Tipo de Evento</DialogTitle>
            <DialogDescription>
              Crie regras específicas que serão anexadas ao prompt principal quando o tipo de evento correspondente for detectado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Evento</label>
              <Select value={newSubEventType} onValueChange={setNewSubEventType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES
                    .filter(et => {
                      // Filtrar tipos já criados
                      const existingSubs = creatingSubPrompt ? (subPromptsMap[creatingSubPrompt] || []) : [];
                      return !existingSubs.some(s => s.event_type_filter === et.value);
                    })
                    .map(et => (
                      <SelectItem key={et.value} value={et.value}>
                        {et.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Nome do Sub-prompt</label>
              <Input
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                placeholder="Ex: Prioridade de Gols"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Regras Específicas</label>
              <Textarea
                value={newSubValue}
                onChange={(e) => setNewSubValue(e.target.value)}
                rows={8}
                placeholder="Escreva as regras específicas para este tipo de evento..."
                className="font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingSubPrompt(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => creatingSubPrompt && handleCreateSubPrompt(creatingSubPrompt)}
              disabled={!newSubEventType || !newSubName || createSubPrompt.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              {createSubPrompt.isPending ? 'Criando...' : 'Criar Sub-prompt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Componentes auxiliares
// ═══════════════════════════════════════════════════════════════════

function PromptCard({
  prompt,
  modelType,
  ollamaModels,
  onEdit,
  onRestore,
  isRestoring,
}: {
  prompt: AiPrompt;
  modelType: 'local' | 'cloud' | 'whisper';
  ollamaModels: Array<{ value: string; label: string }>;
  onEdit: () => void;
  onRestore: () => void;
  isRestoring: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium">{prompt.prompt_name}</p>
          {prompt.is_default ? (
            <Badge variant="outline" className="text-xs">Padrão</Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Personalizado</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1 truncate">
          {prompt.description}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <ModelTypeBadge type={modelType} />
          <span className="text-xs text-muted-foreground">
            {getModelDisplayName(prompt.ai_model, ollamaModels)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        {!prompt.is_default && (
          <Button variant="ghost" size="sm" onClick={onRestore} disabled={isRestoring}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-1" />
          Editar
        </Button>
      </div>
    </div>
  );
}

function SubPromptCard({
  prompt,
  ollamaModels,
  onEdit,
  onRestore,
  onDelete,
  isRestoring,
  isDeleting,
}: {
  prompt: AiPrompt;
  ollamaModels: Array<{ value: string; label: string }>;
  onEdit: () => void;
  onRestore: () => void;
  onDelete: () => void;
  isRestoring: boolean;
  isDeleting: boolean;
}) {
  const eventLabel = EVENT_TYPES.find(e => e.value === prompt.event_type_filter)?.label || prompt.event_type_filter;

  return (
    <div className="flex items-center justify-between p-3 border border-dashed rounded-lg bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <p className="text-sm font-medium">{prompt.prompt_name}</p>
          <Badge variant="secondary" className="text-[10px] px-1.5">
            {eventLabel}
          </Badge>
          {!prompt.is_default && (
            <Badge variant="outline" className="text-[10px] px-1.5">Editado</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate ml-5">
          {prompt.prompt_value.substring(0, 80)}...
        </p>
      </div>
      <div className="flex items-center gap-1 ml-4">
        {!prompt.is_default && (
          <Button variant="ghost" size="sm" onClick={onRestore} disabled={isRestoring}>
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={isDeleting} className="text-destructive hover:text-destructive">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function ModelTypeBadge({ type }: { type: 'local' | 'cloud' | 'whisper' }) {
  if (type === 'local') return (
    <Badge variant="outline" className="text-xs gap-1"><Server className="h-3 w-3" /> Local</Badge>
  );
  if (type === 'cloud') return (
    <Badge variant="outline" className="text-xs gap-1"><Cloud className="h-3 w-3" /> Cloud</Badge>
  );
  return (
    <Badge variant="outline" className="text-xs gap-1"><Mic className="h-3 w-3" /> Local</Badge>
  );
}

function VariablesLegend({ variables, title = 'Variáveis disponíveis:' }: { variables: string[]; title?: string }) {
  return (
    <div className="p-3 bg-muted rounded-lg space-y-2">
      <p className="text-xs font-medium">{title}</p>
      <div className="flex flex-wrap gap-1">
        {variables.map(v => (
          <Badge key={v} variant="secondary" className="text-xs font-mono">{v}</Badge>
        ))}
      </div>
    </div>
  );
}

function ModelSelector({
  value,
  onChange,
  category,
  defaultModel,
  ollamaModels,
}: {
  value: string;
  onChange: (v: string) => void;
  category: string;
  defaultModel: string;
  ollamaModels: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Selecione o modelo" />
      </SelectTrigger>
      <SelectContent>
        {category === 'transcription' ? (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2">
              <Mic className="h-3 w-3" />
              Whisper Local
            </SelectLabel>
            {WHISPER_MODELS.map(m => (
              <SelectItem key={m.value} value={m.value}>
                <span className="flex items-center gap-2">
                  {m.label}
                  {m.value === defaultModel && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">Padrão</Badge>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ) : (
          <>
            {ollamaModels.length > 0 && (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-2">
                  <Server className="h-3 w-3" />
                  Ollama Local
                </SelectLabel>
                {ollamaModels.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    <span className="flex items-center gap-2">
                      {m.label}
                      {m.value === defaultModel && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">Padrão</Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2">
                <Cloud className="h-3 w-3" />
                Google Gemini
              </SelectLabel>
              {GEMINI_MODELS.map(m => (
                <SelectItem key={m.value} value={m.value}>
                  <span className="flex items-center gap-2">
                    {m.label}
                    {m.value === defaultModel && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">Padrão</Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2">
                <Cloud className="h-3 w-3" />
                OpenAI GPT
              </SelectLabel>
              {GPT_MODELS.map(m => (
                <SelectItem key={m.value} value={m.value}>
                  <span className="flex items-center gap-2">
                    {m.label}
                    {m.value === defaultModel && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">Padrão</Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
