import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Sparkles, Upload, Link as LinkIcon, Loader2, FileVideo 
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';
import { MatchSetupData } from './MatchSetupCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SmartImportCardProps {
  onMatchInfoExtracted: (data: MatchSetupData, videoFile?: File, videoUrl?: string, transcription?: string) => void;
  onCancel: () => void;
}

type SmartImportStep = 'video' | 'processing';

export function SmartImportCard({ onMatchInfoExtracted, onCancel }: SmartImportCardProps) {
  const [step, setStep] = useState<SmartImportStep>('video');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [progress, setProgress] = useState({ message: '', percent: 0 });

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
      
      // Se transcrição falhou ou está vazia, ir direto para formulário manual
      if (!transcriptionText || transcriptionFailed) {
        console.log('[SmartImport] Sem transcrição - pulando para formulário manual');
        toast.info('A IA não conseguiu detectar os dados automaticamente. Preencha manualmente.', {
          duration: 6000,
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
          videoUrl || undefined,
          undefined
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
          videoUrl || undefined,
          transcriptionText || undefined
        );
        return;
      }

      // Sucesso — ir direto para o formulário com dados preenchidos pela IA
      setProgress({ message: 'Metadados extraídos com sucesso!', percent: 100 });
      
      const matchData: MatchSetupData & { _homeTeamName?: string; _awayTeamName?: string } = {
        homeTeamId: '',
        awayTeamId: '',
        competition: extractResult.competition || '',
        matchDate: extractResult.match_date || new Date().toISOString().split('T')[0],
        matchTime: '',
        venue: extractResult.venue || '',
        _homeTeamName: extractResult.home_team || undefined,
        _awayTeamName: extractResult.away_team || undefined,
      };

      onMatchInfoExtracted(
        matchData,
        videoFile || undefined,
        videoUrl || undefined,
        transcriptionText || undefined
      );
      
    } catch (error: any) {
      console.error('[SmartImport] Erro inesperado:', error);
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
        videoUrl || undefined,
        undefined
      );
    }
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
      </CardContent>
    </Card>
  );
}
