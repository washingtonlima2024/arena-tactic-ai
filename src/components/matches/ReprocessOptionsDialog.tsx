import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Loader2, 
  FileText, 
  Mic, 
  CheckCircle, 
  Upload, 
  AlertTriangle,
  RefreshCw,
  Eye,
  Type
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';

interface ExistingTranscription {
  first_half: string | null;
  second_half: string | null;
  full: string | null;
  srt_files: string[];
}

interface ReprocessOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: {
    id: string;
    home_team?: { name: string };
    away_team?: { name: string };
  } | null;
  onReprocess: (options: {
    useExistingTranscription: { first: boolean; second: boolean };
    manualTranscription: { first: string; second: string; full: string };
    reTranscribe: { first: boolean; second: boolean };
    analysisMode: 'vision' | 'text';
  }) => Promise<void>;
  isReprocessing: boolean;
  progress: { stage: string; progress: number };
}

export function ReprocessOptionsDialog({
  open,
  onOpenChange,
  match,
  onReprocess,
  isReprocessing,
  progress,
}: ReprocessOptionsDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [existingTranscriptions, setExistingTranscriptions] = useState<ExistingTranscription | null>(null);
  
  // Options state
  const [useExisting, setUseExisting] = useState({ first: true, second: true });
  const [manualText, setManualText] = useState({ first: '', second: '', full: '' });
  const [selectedTab, setSelectedTab] = useState('existing');
  const [activeHalf, setActiveHalf] = useState<'first' | 'second' | 'full'>('full');
  const [analysisMode, setAnalysisMode] = useState<'vision' | 'text'>('vision');

  // CRITICAL: Reset ALL state when dialog opens or match changes to prevent data contamination
  useEffect(() => {
    if (open) {
      console.log('[ReprocessOptions] Dialog aberto - resetando estados para match:', match?.id);
      console.log('[ReprocessOptions] Match:', match?.home_team?.name, 'vs', match?.away_team?.name);
      
      // Reset manual text fields - CRITICAL to prevent data contamination between matches
      setManualText({ first: '', second: '', full: '' });
      
      // Reset other options to defaults
      setUseExisting({ first: true, second: true });
      setSelectedTab('existing');
      setActiveHalf('full');
      setExistingTranscriptions(null);
      setIsLoading(true);
      setAnalysisMode('vision'); // Default to vision mode
      
      // Then load existing transcriptions for the NEW match
      if (match?.id) {
        loadExistingTranscriptions();
      }
    }
  }, [open, match?.id]);

  const loadExistingTranscriptions = async () => {
    if (!match?.id) return;
    
    setIsLoading(true);
    try {
      // Try to get transcriptions from storage/texts folder
      const files = await apiClient.listSubfolderFiles(match.id, 'texts').catch(() => ({ files: [] }));
      
      const result: ExistingTranscription = {
        first_half: null,
        second_half: null,
        full: null,
        srt_files: [],
      };

      // Parse files and load content
      for (const file of files.files || []) {
        const filename = file.filename || file.name || '';
        const url = file.url || `${apiClient.getApiUrl()}/api/storage/${match.id}/texts/${filename}`;
        
        try {
          const content = await fetch(url, { 
            headers: { 'ngrok-skip-browser-warning': 'true' } 
          }).then(r => r.text());
          
          if (filename.includes('first_half') && content.length > 50) {
            result.first_half = content;
          } else if (filename.includes('second_half') && content.length > 50) {
            result.second_half = content;
          } else if (filename.includes('full') && content.length > 50) {
            result.full = content;
          }
          
          if (filename.endsWith('.srt')) {
            result.srt_files.push(filename);
          }
        } catch (e) {
          console.warn(`[ReprocessOptions] Could not load ${filename}:`, e);
        }
      }
      
      setExistingTranscriptions(result);
      
      // Auto-select existing if available
      setUseExisting({
        first: !!result.first_half || !!result.full,
        second: !!result.second_half || !!result.full,
      });
      
    } catch (error) {
      console.error('[ReprocessOptions] Failed to load transcriptions:', error);
      setExistingTranscriptions({ first_half: null, second_half: null, full: null, srt_files: [] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, half: 'first' | 'second' | 'full') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const content = await file.text();
      setManualText(prev => ({ ...prev, [half]: content }));
      const label = half === 'first' ? '1º Tempo' : half === 'second' ? '2º Tempo' : 'Jogo Completo';
      toast.success(`Arquivo ${file.name} carregado para ${label}`);
    } catch (error) {
      toast.error('Erro ao ler arquivo');
    }
  };

  const handleStart = async () => {
    const reTranscribe = {
      first: !useExisting.first && !manualText.first,
      second: !useExisting.second && !manualText.second,
    };
    
    await onReprocess({
      useExistingTranscription: useExisting,
      manualTranscription: manualText,
      reTranscribe,
      analysisMode,
    });
  };

  const hasExistingFirst = !!existingTranscriptions?.first_half || !!existingTranscriptions?.full;
  const hasExistingSecond = !!existingTranscriptions?.second_half || !!existingTranscriptions?.full;

  return (
    <Dialog open={open} onOpenChange={(o) => !isReprocessing && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Opções de Reprocessamento
          </DialogTitle>
          <DialogDescription>
            {match?.home_team?.name || 'Casa'} vs {match?.away_team?.name || 'Visitante'}
          </DialogDescription>
        </DialogHeader>

        {isReprocessing ? (
          <div className="space-y-4 py-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="font-medium">{progress.stage}</span>
            </div>
            <Progress value={progress.progress} className="h-2" />
            <p className="text-sm text-muted-foreground">
              Não feche esta janela durante o processamento
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Analysis Mode Selection */}
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="h-5 w-5 text-primary" />
                <span className="font-medium">Modo de Análise</span>
              </div>
              <RadioGroup 
                value={analysisMode} 
                onValueChange={(v) => setAnalysisMode(v as 'vision' | 'text')}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-primary/20 bg-background hover:border-primary/40 transition-colors">
                  <RadioGroupItem value="vision" id="vision" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="vision" className="font-medium flex items-center gap-2 cursor-pointer">
                      <Eye className="h-4 w-4 text-primary" />
                      Análise Visual (kakttus Pro)
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Detecta eventos diretamente nos frames do vídeo. Timestamps precisos sem depender da narração.
                    </p>
                  </div>
                  <Badge variant="default" className="bg-primary/20 text-primary text-xs">Recomendado</Badge>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-border bg-background hover:border-primary/40 transition-colors">
                  <RadioGroupItem value="text" id="text" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="text" className="font-medium flex items-center gap-2 cursor-pointer">
                      <Type className="h-4 w-4" />
                      Análise de Transcrição
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Detecta eventos a partir do texto transcrito da narração. Mais rápido, mas depende da qualidade da transcrição.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="existing" className="gap-2">
                <FileText className="h-4 w-4" />
                Usar Existente
              </TabsTrigger>
              <TabsTrigger value="transcribe" className="gap-2">
                <Mic className="h-4 w-4" />
                Transcrever
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Manual
              </TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                Reutilize transcrições já existentes na pasta do jogo
              </div>

              {/* First Half */}
              <div className={`p-4 rounded-lg border ${hasExistingFirst ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-muted/30'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {hasExistingFirst ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="font-medium">1º Tempo</span>
                    {hasExistingFirst && (
                      <Badge variant="secondary" className="text-xs">
                        {((existingTranscriptions?.first_half || existingTranscriptions?.full)?.length || 0).toLocaleString()} chars
                      </Badge>
                    )}
                  </div>
                  {hasExistingFirst && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="use-first" className="text-sm">Usar</Label>
                      <Switch
                        id="use-first"
                        checked={useExisting.first}
                        onCheckedChange={(c) => setUseExisting(prev => ({ ...prev, first: c }))}
                      />
                    </div>
                  )}
                </div>
                {!hasExistingFirst && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Nenhuma transcrição encontrada - será necessário transcrever ou enviar arquivo
                  </p>
                )}
              </div>

              {/* Second Half */}
              <div className={`p-4 rounded-lg border ${hasExistingSecond ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-muted/30'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {hasExistingSecond ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="font-medium">2º Tempo</span>
                    {hasExistingSecond && (
                      <Badge variant="secondary" className="text-xs">
                        {((existingTranscriptions?.second_half || existingTranscriptions?.full)?.length || 0).toLocaleString()} chars
                      </Badge>
                    )}
                  </div>
                  {hasExistingSecond && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="use-second" className="text-sm">Usar</Label>
                      <Switch
                        id="use-second"
                        checked={useExisting.second}
                        onCheckedChange={(c) => setUseExisting(prev => ({ ...prev, second: c }))}
                      />
                    </div>
                  )}
                </div>
                {!hasExistingSecond && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Nenhuma transcrição encontrada - será necessário transcrever ou enviar arquivo
                  </p>
                )}
              </div>

              {existingTranscriptions?.srt_files.length ? (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium mb-1">Arquivos SRT disponíveis:</p>
                  <div className="flex flex-wrap gap-2">
                    {existingTranscriptions.srt_files.map(f => (
                      <Badge key={f} variant="outline">{f}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="transcribe" className="space-y-4">
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="h-5 w-5 text-primary" />
                  <span className="font-medium">Transcrição Automática</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  O sistema irá extrair o áudio e transcrever usando kakttus Transcrição.
                  Este processo pode levar <strong>10-30 minutos</strong> dependendo do tamanho do vídeo.
                </p>
                
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>1º Tempo</span>
                    <Switch
                      checked={!useExisting.first && !manualText.first}
                      onCheckedChange={(c) => {
                        if (c) {
                          setUseExisting(prev => ({ ...prev, first: false }));
                          setManualText(prev => ({ ...prev, first: '' }));
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>2º Tempo</span>
                    <Switch
                      checked={!useExisting.second && !manualText.second}
                      onCheckedChange={(c) => {
                        if (c) {
                          setUseExisting(prev => ({ ...prev, second: false }));
                          setManualText(prev => ({ ...prev, second: '' }));
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  ⚠️ Timeout configurado para 30 minutos. Para vídeos muito grandes, 
                  considere usar o modo de upload manual com arquivo SRT.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                Envie um arquivo SRT ou TXT com a transcrição
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <Button
                  variant={activeHalf === 'full' ? 'arena' : 'outline'}
                  size="sm"
                  onClick={() => setActiveHalf('full')}
                >
                  Jogo Completo
                  {manualText.full && <CheckCircle className="ml-2 h-3 w-3" />}
                </Button>
                <Button
                  variant={activeHalf === 'first' ? 'arena' : 'outline'}
                  size="sm"
                  onClick={() => setActiveHalf('first')}
                >
                  1º Tempo
                  {manualText.first && <CheckCircle className="ml-2 h-3 w-3" />}
                </Button>
                <Button
                  variant={activeHalf === 'second' ? 'arena' : 'outline'}
                  size="sm"
                  onClick={() => setActiveHalf('second')}
                >
                  2º Tempo
                  {manualText.second && <CheckCircle className="ml-2 h-3 w-3" />}
                </Button>
              </div>

              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 mb-3">
                <p className="text-sm text-primary">
                  💡 <strong>Dica:</strong> Use "Jogo Completo" se você tem um único arquivo SRT para toda a partida.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".srt,.txt,.vtt"
                    onChange={(e) => handleFileUpload(e, activeHalf)}
                    className="hidden"
                    id={`file-upload-${activeHalf}`}
                  />
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById(`file-upload-${activeHalf}`)?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Carregar Arquivo
                  </Button>
                  {manualText[activeHalf] && (
                    <Badge variant="secondary">
                      {manualText[activeHalf].length.toLocaleString()} caracteres
                    </Badge>
                  )}
                </div>

                <Textarea
                  placeholder={`Cole ou carregue a transcrição ${activeHalf === 'full' ? 'do jogo completo' : activeHalf === 'first' ? 'do 1º tempo' : 'do 2º tempo'} aqui...`}
                  value={manualText[activeHalf]}
                  onChange={(e) => setManualText(prev => ({ ...prev, [activeHalf]: e.target.value }))}
                  rows={8}
                  className="font-mono text-xs"
                />
              </div>
            </TabsContent>
          </Tabs>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isReprocessing}
          >
            Cancelar
          </Button>
          <Button
            variant="arena"
            onClick={handleStart}
            disabled={isReprocessing}
          >
            {isReprocessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Iniciar Reprocessamento
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
