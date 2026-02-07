import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Sparkles, Upload, Link as LinkIcon, Loader2, CheckCircle2, 
  AlertCircle, ArrowRight, FileVideo 
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';
import { MatchSetupData } from './MatchSetupCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SmartImportCardProps {
  onMatchInfoExtracted: (data: MatchSetupData, videoFile?: File, videoUrl?: string) => void;
  onCancel: () => void;
}

type SmartImportStep = 'video' | 'processing' | 'review';

interface ExtractionResult {
  home_team: string | null;
  away_team: string | null;
  competition: string | null;
  venue: string | null;
  match_date: string | null;
  score: { home: number; away: number } | null;
  confidence: number;
}

export function SmartImportCard({ onMatchInfoExtracted, onCancel }: SmartImportCardProps) {
  const [step, setStep] = useState<SmartImportStep>('video');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [progress, setProgress] = useState({ message: '', percent: 0 });
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl('');
    }
  }, []);

  const handleStartProcessing = async () => {
    if (!videoFile && !videoUrl.trim()) {
      toast.error('Forneça um vídeo para importar');
      return;
    }

    setStep('processing');
    
    try {
      // Step 1: Transcrever vídeo (upload de arquivo ou URL em um único passo)
      setProgress({ message: videoFile ? 'Enviando vídeo e transcrevendo...' : 'Baixando e transcrevendo áudio...', percent: 20 });
      
      let transcriptionText = '';
      let transcriptionFailed = false;
      
      try {
        const transcribeResult = await apiClient.smartImportTranscribe({
          file: videoFile || undefined,
          videoUrl: videoUrl.trim() || undefined,
        });
        
        transcriptionText = transcribeResult?.transcription || '';
        transcriptionFailed = !!transcribeResult?.transcription_failed;
      } catch (transcribeError: any) {
        console.warn('[SmartImport] Transcrição falhou, continuando sem:', transcribeError.message);
        transcriptionFailed = true;
      }
      
      // Se transcrição falhou ou está vazia, pular extração de metadados
      // e ir direto para formulário manual
      if (!transcriptionText || transcriptionFailed) {
        console.log('[SmartImport] Sem transcrição - pulando para formulário manual');
        toast.info('A IA não conseguiu detectar os dados automaticamente. Preencha manualmente.', {
          duration: 6000,
        });
        
        // Ir direto para o formulário manual com dados vazios
        const emptyMatchData: MatchSetupData & { _homeTeamName?: string; _awayTeamName?: string } = {
          homeTeamId: '',
          awayTeamId: '',
          competition: '',
          matchDate: new Date().toISOString().split('T')[0],
          matchTime: '',
          venue: '',
        };
        
        onMatchInfoExtracted(
          emptyMatchData,
          videoFile || undefined,
          videoUrl || undefined
        );
        return;
      }

      // Step 2: Extrair metadados da partida via IA
      setProgress({ message: 'IA analisando transcrição para identificar partida...', percent: 70 });
      
      let extractResult: any = null;
      try {
        extractResult = await apiClient.extractMatchInfo(transcriptionText);
      } catch (extractError: any) {
        console.warn('[SmartImport] Extração de metadados falhou:', extractError.message);
      }
      
      if (!extractResult?.success) {
        // Extração falhou, mas temos a transcrição - ir para formulário manual
        toast.info('IA não conseguiu interpretar os dados da partida. Preencha manualmente.', {
          duration: 5000,
        });
        
        const emptyMatchData: MatchSetupData & { _homeTeamName?: string; _awayTeamName?: string } = {
          homeTeamId: '',
          awayTeamId: '',
          competition: '',
          matchDate: new Date().toISOString().split('T')[0],
          matchTime: '',
          venue: '',
        };
        
        onMatchInfoExtracted(
          emptyMatchData,
          videoFile || undefined,
          videoUrl || undefined
        );
        return;
      }

      setProgress({ message: 'Metadados extraídos com sucesso!', percent: 100 });
      setExtractionResult(extractResult);
      setStep('review');
      
    } catch (error: any) {
      console.error('[SmartImport] Erro inesperado:', error);
      // NUNCA parar no erro - ir para formulário manual
      toast.error('Erro na importação. Preencha os dados manualmente.', {
        duration: 5000,
      });
      
      const emptyMatchData: MatchSetupData & { _homeTeamName?: string; _awayTeamName?: string } = {
        homeTeamId: '',
        awayTeamId: '',
        competition: '',
        matchDate: new Date().toISOString().split('T')[0],
        matchTime: '',
        venue: '',
      };
      
      onMatchInfoExtracted(
        emptyMatchData,
        videoFile || undefined,
        videoUrl || undefined
      );
    }
  };

  const handleConfirm = () => {
    if (!extractionResult) return;
    
    // Build MatchSetupData from extraction - user will correct in the form
    // Include _homeTeamName and _awayTeamName for fuzzy matching in parent
    const matchData: MatchSetupData & { _homeTeamName?: string; _awayTeamName?: string } = {
      homeTeamId: '',
      awayTeamId: '',
      competition: extractionResult.competition || '',
      matchDate: extractionResult.match_date || new Date().toISOString().split('T')[0],
      matchTime: '',
      venue: extractionResult.venue || '',
      _homeTeamName: extractionResult.home_team || undefined,
      _awayTeamName: extractionResult.away_team || undefined,
    };

    onMatchInfoExtracted(
      matchData, 
      videoFile || undefined,
      videoUrl || undefined
    );
  };

  return (
    <Card variant="glass" className="max-w-3xl mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="text-xl">Importação Inteligente</CardTitle>
        <CardDescription>
          Forneça o vídeo e a IA irá transcrever, interpretar e preencher os dados da partida automaticamente
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 1: Video Input */}
        {step === 'video' && (
          <>
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="link">Link / URL</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-4 pt-4">
                <div className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="smart-import-file"
                  />
                  <label htmlFor="smart-import-file" className="cursor-pointer">
                    {videoFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileVideo className="h-10 w-10 text-primary" />
                        <p className="font-medium">{videoFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                        <Badge variant="secondary">Clique para trocar</Badge>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-10 w-10 text-muted-foreground" />
                        <p className="font-medium">Clique para selecionar o vídeo</p>
                        <p className="text-sm text-muted-foreground">
                          MP4, MKV, AVI, MOV
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              </TabsContent>

              <TabsContent value="link" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">URL do vídeo</span>
                  </div>
                  <Input
                    value={videoUrl}
                    onChange={(e) => {
                      setVideoUrl(e.target.value);
                      setVideoFile(null);
                    }}
                    placeholder="https://youtube.com/watch?v=... ou URL direta do vídeo"
                  />
                  <p className="text-xs text-muted-foreground">
                    Suporta YouTube, links diretos de vídeo e URLs do storage local
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleStartProcessing}
                disabled={!videoFile && !videoUrl.trim()}
                className="flex-1 gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Iniciar Importação
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Processing */}
        {step === 'processing' && (
          <div className="space-y-6 py-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="font-medium text-center">{progress.message}</p>
            </div>
            <Progress value={progress.percent} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              Isso pode levar alguns minutos dependendo da duração do vídeo
            </p>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 'review' && extractionResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                IA identificou os dados da partida
              </span>
              <Badge variant="secondary" className="ml-auto">
                Confiança: {Math.round(extractionResult.confidence * 100)}%
              </Badge>
            </div>

            <div className="grid gap-3">
              {extractionResult.home_team && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">Time Casa</span>
                  <span className="font-medium">{extractionResult.home_team}</span>
                </div>
              )}
              {extractionResult.away_team && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">Time Visitante</span>
                  <span className="font-medium">{extractionResult.away_team}</span>
                </div>
              )}
              {extractionResult.competition && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">Competição</span>
                  <span className="font-medium">{extractionResult.competition}</span>
                </div>
              )}
              {extractionResult.venue && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">Estádio</span>
                  <span className="font-medium">{extractionResult.venue}</span>
                </div>
              )}
              {extractionResult.score && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">Placar detectado</span>
                  <span className="font-bold text-lg">
                    {extractionResult.score.home} × {extractionResult.score.away}
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
              <div className="flex gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  Esses dados serão usados para preencher o cadastro. 
                  Você poderá <strong>revisar e corrigir</strong> todos os campos antes de confirmar.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep('video')} className="flex-1">
                Voltar
              </Button>
              <Button onClick={handleConfirm} className="flex-1 gap-2">
                Continuar para Revisão
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
