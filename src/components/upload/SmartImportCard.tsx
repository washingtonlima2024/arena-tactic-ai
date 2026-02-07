import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';
import { MatchSetupData } from './MatchSetupCard';
import { HalfVideoInput, HalfVideoData } from './HalfVideoInput';
import { cn } from '@/lib/utils';
import { SoccerBallLoader } from '@/components/ui/SoccerBallLoader';

export interface SmartImportVideo {
  file?: File;
  url?: string;
  halfType: 'first' | 'second';
  videoType: string;
}

interface SmartImportCardProps {
  onMatchInfoExtracted: (data: MatchSetupData, videoFile?: File, videoUrl?: string, transcription?: string, allVideos?: SmartImportVideo[]) => void;
  onCancel: () => void;
}

type SmartImportStep = 'video' | 'processing';
type ImportMode = 'halves' | 'full';

// Tenta extrair nomes de times a partir do nome do arquivo
function extractTeamsFromFilename(filename: string): { home?: string; away?: string } {
  if (!filename) return {};
  const name = filename.replace(/\.[^.]+$/, '').replace(/.*[/\\]/, '');
  const separators = [
    /[_\s]*[xX][_\s]*/,
    /[_\s]*[vV][sS]\.?[_\s]*/,
    /\s+contra\s+/i,
  ];
  for (const sep of separators) {
    const parts = name.split(sep);
    if (parts.length >= 2) {
      const cleanName = (s: string) => s.replace(/[_-]?\d+.*$/, '').replace(/[_-]+/g, ' ').trim();
      const home = cleanName(parts[0]);
      const away = cleanName(parts[1]);
      if (home.length >= 2 && away.length >= 2) {
        return { home, away };
      }
    }
  }
  return {};
}

export function SmartImportCard({ onMatchInfoExtracted, onCancel }: SmartImportCardProps) {
  const [step, setStep] = useState<SmartImportStep>('video');
  const [importMode, setImportMode] = useState<ImportMode>('full');
  const [progress, setProgress] = useState({ message: '', percent: 0 });
  const [phase, setPhase] = useState<'idle' | 'transcribing' | 'extracting' | 'done'>('idle');
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulated gradual progress during long API calls
  useEffect(() => {
    if (step !== 'processing' || phase === 'idle' || phase === 'done') {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      return;
    }

    const limits: Record<string, number> = { transcribing: 55, extracting: 85 };
    const maxPercent = limits[phase] || 90;

    const messages: Record<string, string[]> = {
      transcribing: [
        'Enviando vídeo para transcrição...',
        'Extraindo faixa de áudio...',
        'Processando áudio com IA...',
        'Transcrevendo narração...',
        'Identificando times e jogadores...',
        'Analisando contexto da partida...',
      ],
      extracting: [
        'IA analisando transcrição...',
        'Identificando times...',
        'Extraindo metadados da partida...',
        'Detectando competição e data...',
      ],
    };

    progressTimerRef.current = setInterval(() => {
      setProgress(prev => {
        const increment = phase === 'transcribing' ? 0.8 : 1.2;
        const newPercent = Math.min(prev.percent + increment, maxPercent);
        const phaseMessages = messages[phase] || [];
        const msgIndex = Math.floor((newPercent / maxPercent) * phaseMessages.length);
        const message = phaseMessages[Math.min(msgIndex, phaseMessages.length - 1)] || prev.message;
        return { percent: newPercent, message };
      });
    }, 1200);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [step, phase]);

  // Video inputs
  const [firstHalf, setFirstHalf] = useState<HalfVideoData>({});
  const [secondHalf, setSecondHalf] = useState<HalfVideoData>({});
  const [fullMatch, setFullMatch] = useState<HalfVideoData>({});

  // Computed: which video to use for AI transcription (first available)
  const primaryVideo = importMode === 'full' 
    ? fullMatch 
    : (firstHalf.file || firstHalf.url ? firstHalf : secondHalf);

  const hasAnyVideo = importMode === 'full'
    ? !!(fullMatch.file || fullMatch.url?.trim())
    : !!(firstHalf.file || firstHalf.url?.trim() || secondHalf.file || secondHalf.url?.trim());

  // When switching modes, clear the other mode's data
  const handleModeChange = useCallback((mode: ImportMode) => {
    setImportMode(mode);
    if (mode === 'full') {
      setFirstHalf({});
      setSecondHalf({});
    } else {
      setFullMatch({});
    }
  }, []);

  const handleStartProcessing = async () => {
    if (!hasAnyVideo) {
      toast.error('Forneça pelo menos um vídeo para importar');
      return;
    }

    setStep('processing');
    setPhase('transcribing');
    setProgress({ message: 'Preparando vídeo...', percent: 2 });
    
    try {
      // Determine primary video for AI transcription
      const videoFile = primaryVideo.file || undefined;
      const videoUrl = (primaryVideo.url || '').trim() || undefined;
      
      let transcriptionText = '';
      let transcriptionFailed = false;
      
      try {
        const transcribeResult = await apiClient.smartImportTranscribe({
          file: videoFile,
          videoUrl: videoUrl,
        });
        
        transcriptionText = transcribeResult?.transcription || '';
        transcriptionFailed = !!transcribeResult?.transcription_failed;
      } catch (transcribeError: any) {
        console.warn('[SmartImport] Transcrição falhou, continuando sem:', transcribeError.message);
        transcriptionFailed = true;
      }
      
      // Build allVideos array
      const allVideos: SmartImportVideo[] = [];
      
      if (importMode === 'full') {
        if (fullMatch.file || fullMatch.url?.trim()) {
          allVideos.push({
            file: fullMatch.file,
            url: fullMatch.url?.trim(),
            halfType: 'first',
            videoType: 'full',
          });
        }
      } else {
        if (firstHalf.file || firstHalf.url?.trim()) {
          allVideos.push({
            file: firstHalf.file,
            url: firstHalf.url?.trim(),
            halfType: 'first',
            videoType: 'first_half',
          });
        }
        if (secondHalf.file || secondHalf.url?.trim()) {
          allVideos.push({
            file: secondHalf.file,
            url: secondHalf.url?.trim(),
            halfType: 'second',
            videoType: 'second_half',
          });
        }
      }

      // Fallback: extract from filename
      if (!transcriptionText || transcriptionFailed) {
        console.log('[SmartImport] Sem transcrição - tentando extrair do nome do arquivo');
        
        const firstFile = allVideos.find(v => v.file)?.file;
        const filenameTeams = firstFile ? extractTeamsFromFilename(firstFile.name) : {};
        
        if (filenameTeams.home || filenameTeams.away) {
          toast.info('IA indisponível — times detectados pelo nome do arquivo.', { duration: 4000 });
        } else {
          toast.info('IA indisponível. Criando partida com dados parciais.', { duration: 4000 });
        }
        
        const fallbackData: MatchSetupData & { _homeTeamName?: string; _awayTeamName?: string } = {
          homeTeamId: '',
          awayTeamId: '',
          competition: '',
          matchDate: new Date().toISOString().split('T')[0],
          matchTime: '',
          venue: '',
          _homeTeamName: filenameTeams.home || undefined,
          _awayTeamName: filenameTeams.away || undefined,
        };
        
        onMatchInfoExtracted(
          fallbackData,
          allVideos[0]?.file,
          allVideos[0]?.url,
          undefined,
          allVideos
        );
        return;
      }

      // Step 2: Extrair metadados via IA
      setPhase('extracting');
      setProgress({ message: 'IA analisando transcrição...', percent: 60 });
      
      let extractResult: any = null;
      try {
        extractResult = await apiClient.extractMatchInfo(transcriptionText);
      } catch (extractError: any) {
        console.warn('[SmartImport] Extração de metadados falhou:', extractError.message);
      }
      
      if (!extractResult?.success) {
        const firstFile = allVideos.find(v => v.file)?.file;
        const filenameTeams = firstFile ? extractTeamsFromFilename(firstFile.name) : {};
        toast.info('IA não identificou times na transcrição. Criando partida automaticamente.', { duration: 4000 });
        
        const fallbackData: MatchSetupData & { _homeTeamName?: string; _awayTeamName?: string } = {
          homeTeamId: '',
          awayTeamId: '',
          competition: '',
          matchDate: new Date().toISOString().split('T')[0],
          matchTime: '',
          venue: '',
          _homeTeamName: filenameTeams.home || undefined,
          _awayTeamName: filenameTeams.away || undefined,
        };
        
        onMatchInfoExtracted(
          fallbackData,
          allVideos[0]?.file,
          allVideos[0]?.url,
          transcriptionText || undefined,
          allVideos
        );
        return;
      }

      // Sucesso
      setPhase('done');
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
        allVideos[0]?.file,
        allVideos[0]?.url,
        transcriptionText || undefined,
        allVideos
      );
      
    } catch (error: any) {
      console.error('[SmartImport] Erro inesperado:', error);
      toast.error('Erro na importação. Preencha os dados manualmente.', { duration: 5000 });
      
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
        undefined,
        undefined,
        undefined,
        []
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
          Forneça o(s) vídeo(s) e a IA irá transcrever, interpretar e preencher os dados da partida automaticamente
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 1: Video Input */}
        {step === 'video' && (
          <>
            {/* Mode selector */}
            <div className="flex gap-2">
              <Button
                variant={importMode === 'halves' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleModeChange('halves')}
                className="flex-1"
              >
                1º e 2º Tempo
              </Button>
              <Button
                variant={importMode === 'full' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleModeChange('full')}
                className="flex-1"
              >
                Jogo Completo
              </Button>
            </div>

            {importMode === 'halves' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <HalfVideoInput
                  label="1º Tempo"
                  halfType="first"
                  color="blue"
                  value={firstHalf}
                  onChange={setFirstHalf}
                />
                <HalfVideoInput
                  label="2º Tempo"
                  halfType="second"
                  color="orange"
                  value={secondHalf}
                  onChange={setSecondHalf}
                />
              </div>
            ) : (
              <HalfVideoInput
                label="Jogo Completo"
                halfType="full"
                color="green"
                value={fullMatch}
                onChange={setFullMatch}
              />
            )}

            {importMode === 'halves' && (
              <p className="text-xs text-muted-foreground text-center">
                Forneça um ou ambos — o outro tempo pode ser adicionado depois na página de Eventos
              </p>
            )}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleStartProcessing}
                disabled={!hasAnyVideo}
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
          <div className="space-y-4 py-4">
            <SoccerBallLoader
              message={progress.message}
              progress={progress.percent}
              showProgress={true}
            />
            <p className="text-xs text-muted-foreground text-center">
              Isso pode levar alguns minutos dependendo da duração do vídeo
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
