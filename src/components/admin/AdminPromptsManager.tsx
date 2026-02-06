import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Brain, RotateCcw, Save, Pencil, Server, Cloud, Mic } from 'lucide-react';
import { useAiPrompts, AiPrompt } from '@/hooks/useAiPrompts';
import { apiClient } from '@/lib/apiClient';
import { formatOllamaModelName } from '@/lib/modelBranding';
import { useQuery } from '@tanstack/react-query';

// Modelos fixos kakttus Pro (Gemini)
const GEMINI_MODELS = [
  { value: 'google/gemini-2.5-pro', label: 'kakttus Pro Ultra' },
  { value: 'google/gemini-2.5-flash', label: 'kakttus Pro' },
  { value: 'google/gemini-2.5-flash-lite', label: 'kakttus Pro Lite' },
  { value: 'google/gemini-3-pro-preview', label: 'kakttus Pro Preview' },
  { value: 'google/gemini-3-flash-preview', label: 'kakttus Pro Flash' },
];

// Modelos fixos kakttus Vision (GPT)
const GPT_MODELS = [
  { value: 'openai/gpt-5', label: 'kakttus Vision Ultra' },
  { value: 'openai/gpt-5-mini', label: 'kakttus Vision' },
  { value: 'openai/gpt-5-nano', label: 'kakttus Vision Lite' },
];

// Modelos Whisper Local
const WHISPER_MODELS = [
  { value: 'whisper-local/tiny', label: 'kakttus Transcrição Tiny' },
  { value: 'whisper-local/base', label: 'kakttus Transcrição Base' },
  { value: 'whisper-local/small', label: 'kakttus Transcrição Small' },
  { value: 'whisper-local/medium', label: 'kakttus Transcrição Medium' },
  { value: 'whisper-local/large-v3', label: 'kakttus Transcrição Pro' },
];

// Variáveis disponíveis para templates de relatório
const REPORT_VARIABLES = [
  '{homeTeam}', '{awayTeam}', '{homeScore}', '{awayScore}',
  '{competition}', '{matchDate}', '{venue}', '{stats}',
  '{bestPlayer}', '{patterns}', '{totalEvents}',
  '{firstHalfCount}', '{secondHalfCount}', '{eventsList}',
];

const CATEGORY_LABELS: Record<string, string> = {
  chatbot: 'Chatbot',
  report: 'Relatório',
  transcription: 'Transcrição',
};

const CATEGORY_ICONS: Record<string, typeof Brain> = {
  chatbot: Brain,
  report: Brain,
  transcription: Mic,
};

function getDefaultBadge(prompt: AiPrompt, currentModel: string): string | null {
  if (currentModel === prompt.default_model) return 'Padrão';
  return null;
}

function getModelType(model: string): 'local' | 'cloud' | 'whisper' {
  if (model.startsWith('whisper-local/')) return 'whisper';
  if (model.startsWith('google/') || model.startsWith('openai/')) return 'cloud';
  return 'local';
}

export default function AdminPromptsManager() {
  const { prompts, isLoading, updatePrompt, restoreDefault } = useAiPrompts();
  const [editingPrompt, setEditingPrompt] = useState<AiPrompt | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editModel, setEditModel] = useState('');

  // Buscar modelos Ollama dinamicamente
  const { data: ollamaData } = useQuery({
    queryKey: ['ollama-models'],
    queryFn: () => apiClient.getOllamaModels(),
    retry: 1,
    staleTime: 60000,
  });

  const ollamaModels = (ollamaData?.models || []).map(m => ({
    value: m.name,
    label: formatOllamaModelName(m.name, m.parameter_size),
  }));

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

  // Agrupar prompts por categoria
  const grouped = prompts.reduce<Record<string, AiPrompt[]>>((acc, p) => {
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
            Edite os prompts e escolha qual modelo processa cada funcionalidade. Todos os modelos são sempre listados com o padrão pré-selecionado.
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
                  const defaultBadge = getDefaultBadge(prompt, prompt.ai_model);

                  return (
                    <div key={prompt.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{prompt.prompt_name}</p>
                          {prompt.is_default && (
                            <Badge variant="outline" className="text-xs">Padrão</Badge>
                          )}
                          {!prompt.is_default && (
                            <Badge variant="secondary" className="text-xs">Personalizado</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          {prompt.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {modelType === 'local' && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Server className="h-3 w-3" /> Local
                            </Badge>
                          )}
                          {modelType === 'cloud' && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Cloud className="h-3 w-3" /> Cloud
                            </Badge>
                          )}
                          {modelType === 'whisper' && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Mic className="h-3 w-3" /> Local
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {getModelDisplayName(prompt.ai_model, ollamaModels)}
                          </span>
                          {defaultBadge && (
                            <Badge variant="default" className="text-xs">{defaultBadge}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {!prompt.is_default && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestore(prompt.id)}
                            disabled={restoreDefault.isPending}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => handleEdit(prompt)}>
                          <Pencil className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                      </div>
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
            <DialogTitle>Editar: {editingPrompt?.prompt_name}</DialogTitle>
            <DialogDescription>{editingPrompt?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Seletor de modelo */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Modelo de IA</label>
              <Select value={editModel} onValueChange={setEditModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  {/* Whisper models para categoria transcription */}
                  {editingPrompt?.category === 'transcription' ? (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-2">
                        <Mic className="h-3 w-3" />
                        kakttus Transcrição (Local)
                      </SelectLabel>
                      {WHISPER_MODELS.map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          <span className="flex items-center gap-2">
                            {m.label}
                            {m.value === editingPrompt?.default_model && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">Padrão</Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : (
                    <>
                      {/* Ollama Local */}
                      {ollamaModels.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="flex items-center gap-2">
                            <Server className="h-3 w-3" />
                            kakttus.ai Local (Ollama)
                          </SelectLabel>
                          {ollamaModels.map(m => (
                            <SelectItem key={m.value} value={m.value}>
                              <span className="flex items-center gap-2">
                                {m.label}
                                {m.value === editingPrompt?.default_model && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">Padrão</Badge>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}

                      {/* Gemini */}
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-2">
                          <Cloud className="h-3 w-3" />
                          kakttus Pro (Gemini)
                        </SelectLabel>
                        {GEMINI_MODELS.map(m => (
                          <SelectItem key={m.value} value={m.value}>
                            <span className="flex items-center gap-2">
                              {m.label}
                              {m.value === editingPrompt?.default_model && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0">Padrão</Badge>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>

                      {/* GPT */}
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-2">
                          <Cloud className="h-3 w-3" />
                          kakttus Vision (GPT)
                        </SelectLabel>
                        {GPT_MODELS.map(m => (
                          <SelectItem key={m.value} value={m.value}>
                            <span className="flex items-center gap-2">
                              {m.label}
                              {m.value === editingPrompt?.default_model && (
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
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <p className="text-xs font-medium">Variáveis disponíveis:</p>
                <div className="flex flex-wrap gap-1">
                  {REPORT_VARIABLES.map(v => (
                    <Badge key={v} variant="secondary" className="text-xs font-mono">
                      {v}
                    </Badge>
                  ))}
                </div>
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
    </>
  );
}

// Helper para nome do modelo no card
function getModelDisplayName(
  modelValue: string,
  ollamaModels: Array<{ value: string; label: string }>
): string {
  // Check whisper
  const whisper = WHISPER_MODELS.find(m => m.value === modelValue);
  if (whisper) return whisper.label;

  // Check gemini
  const gemini = GEMINI_MODELS.find(m => m.value === modelValue);
  if (gemini) return gemini.label;

  // Check GPT
  const gpt = GPT_MODELS.find(m => m.value === modelValue);
  if (gpt) return gpt.label;

  // Check ollama
  const ollama = ollamaModels.find(m => m.value === modelValue);
  if (ollama) return ollama.label;

  return modelValue;
}
