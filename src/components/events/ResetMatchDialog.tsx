import { useState, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, RefreshCw, Trash2, Music, Image, MessageSquare, 
  BarChart3, Video, FileText, Check, Upload, X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStartAnalysis } from '@/hooks/useAnalysisJob';
import { useAudioExtraction } from '@/hooks/useAudioExtraction';

interface ResetMatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  videos: Array<{
    id: string;
    file_url: string;
    start_minute: number | null;
    end_minute: number | null;
    duration_seconds: number | null;
  }>;
  homeTeamId: string | null;
  awayTeamId: string | null;
  competition: string | null;
  onResetComplete: () => void;
}

// Estimate video size from duration (rough: ~2MB per minute for compressed video)
const estimateVideoSizeMB = (durationSeconds: number | null): number => {
  if (!durationSeconds) return 300; // Assume large if unknown
  return Math.round((durationSeconds / 60) * 10); // ~10MB per minute estimate
};

export function ResetMatchDialog({
  isOpen,
  onClose,
  matchId,
  videos,
  homeTeamId,
  awayTeamId,
  competition,
  onResetComplete,
}: ResetMatchDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [srtFiles, setSrtFiles] = useState<Record<string, { file: File; content: string }>>({});
  const { startAnalysis } = useStartAnalysis();
  const { extractAudio, extractionProgress } = useAudioExtraction();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const MAX_SIZE_MB = 200;
  const hasLargeVideos = videos.some(v => estimateVideoSizeMB(v.duration_seconds) > MAX_SIZE_MB);

  const handleSrtUpload = async (videoId: string, file: File) => {
    const content = await file.text();
    setSrtFiles(prev => ({ ...prev, [videoId]: { file, content } }));
  };

  const removeSrt = (videoId: string) => {
    setSrtFiles(prev => {
      const newFiles = { ...prev };
      delete newFiles[videoId];
      return newFiles;
    });
  };

  const handleReset = async () => {
    if (!confirmed) return;
    
    setIsResetting(true);
    setProgress(0);

    try {
      // Step 1: Extract audio from videos (browser-side, avoids server memory limits)
      setCurrentStep('Extraindo áudio dos vídeos...');
      setProgress(5);
      
      const audioUrls: Record<string, string> = {};
      
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const estimatedSize = estimateVideoSizeMB(video.duration_seconds);
        
        // Skip audio extraction for large videos - rely on SRT instead
        if (estimatedSize > MAX_SIZE_MB) {
          console.log(`Vídeo ${video.id} muito grande (${estimatedSize}MB) - usando SRT`);
          continue;
        }

        setCurrentStep(`Extraindo áudio do vídeo ${i + 1} de ${videos.length}...`);
        setProgress(5 + (i / videos.length) * 25);
        
        try {
          const isDirectFile = video.file_url.includes('supabase') || 
                              video.file_url.endsWith('.mp4') || 
                              video.file_url.includes('/storage/');
          
          if (isDirectFile) {
            const result = await extractAudio(video.file_url, matchId, video.id);
            audioUrls[video.id] = result.audioUrl;
            console.log(`Áudio extraído para vídeo ${video.id}:`, result.audioUrl);
          }
        } catch (audioError: any) {
          if (audioError?.message?.startsWith('VIDEO_TOO_LARGE')) {
            console.warn(`Vídeo ${video.id} muito grande - usando SRT se disponível`);
          } else {
            console.error(`Erro ao extrair áudio do vídeo ${video.id}:`, audioError);
          }
        }
      }

      // Step 2: Delete events (but NOT videos)
      setCurrentStep('Deletando eventos...');
      setProgress(35);
      const { error: eventsError } = await supabase
        .from('match_events')
        .delete()
        .eq('match_id', matchId);
      if (eventsError) throw new Error(`Erro ao deletar eventos: ${eventsError.message}`);

      // Step 3: Delete analysis jobs
      setCurrentStep('Deletando análises anteriores...');
      setProgress(45);
      const { error: analysisError } = await supabase
        .from('analysis_jobs')
        .delete()
        .eq('match_id', matchId);
      if (analysisError) throw new Error(`Erro ao deletar análises: ${analysisError.message}`);

      // Step 4: Delete generated audio (narrações, podcasts - NOT extracted audio)
      setCurrentStep('Deletando áudios gerados...');
      setProgress(55);
      const { error: audioError } = await supabase
        .from('generated_audio')
        .delete()
        .eq('match_id', matchId)
        .neq('audio_type', 'extracted');
      if (audioError) throw new Error(`Erro ao deletar áudios: ${audioError.message}`);

      // Step 5: Delete thumbnails
      setCurrentStep('Deletando thumbnails...');
      setProgress(65);
      const { error: thumbnailsError } = await supabase
        .from('thumbnails')
        .delete()
        .eq('match_id', matchId);
      if (thumbnailsError) throw new Error(`Erro ao deletar thumbnails: ${thumbnailsError.message}`);

      // Step 6: Delete chatbot conversations
      setCurrentStep('Deletando conversas do chatbot...');
      setProgress(75);
      const { error: chatbotError } = await supabase
        .from('chatbot_conversations')
        .delete()
        .eq('match_id', matchId);
      if (chatbotError) throw new Error(`Erro ao deletar conversas: ${chatbotError.message}`);

      // Step 7: Reset match score
      setCurrentStep('Resetando placar...');
      setProgress(80);
      const { error: matchError } = await supabase
        .from('matches')
        .update({ home_score: 0, away_score: 0, status: 'pending' })
        .eq('id', matchId);
      if (matchError) throw new Error(`Erro ao resetar partida: ${matchError.message}`);

      // Step 8: Start new analysis for all videos WITH pre-extracted audio OR SRT
      setCurrentStep('Iniciando nova análise...');
      setProgress(85);
      
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const srtData = srtFiles[video.id];
        
        setCurrentStep(`Iniciando análise do vídeo ${i + 1} de ${videos.length}...`);
        setProgress(85 + (i / videos.length) * 10);
        
        await startAnalysis({
          matchId,
          videoUrl: video.file_url,
          audioUrl: audioUrls[video.id],
          homeTeamId: homeTeamId || undefined,
          awayTeamId: awayTeamId || undefined,
          competition: competition || undefined,
          startMinute: video.start_minute ?? 0,
          endMinute: video.end_minute ?? 45,
          durationSeconds: video.duration_seconds ?? undefined,
          transcription: srtData?.content, // Pass SRT content if available
        });
      }

      setProgress(100);
      setCurrentStep('Concluído!');
      
      toast.success('Reset completo! Nova análise iniciada.');
      onResetComplete();
      
      setTimeout(() => {
        onClose();
        setIsResetting(false);
        setProgress(0);
        setCurrentStep('');
        setConfirmed(false);
        setSrtFiles({});
      }, 1000);

    } catch (error) {
      console.error('Reset error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao resetar partida');
      setIsResetting(false);
    }
  };

  const handleClose = () => {
    if (!isResetting) {
      setConfirmed(false);
      setSrtFiles({});
      onClose();
    }
  };

  const getVideoLabel = (video: typeof videos[0], index: number) => {
    if (video.start_minute === 0 && video.end_minute === 45) return '1º Tempo';
    if (video.start_minute === 45) return '2º Tempo';
    return `Vídeo ${index + 1}`;
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Refazer Análise Completa
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Esta ação irá refazer toda a análise da partida.
              </p>

              {/* Large video warning with SRT upload */}
              {hasLargeVideos && (
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-3">
                  <p className="text-sm font-medium text-warning flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Vídeos grandes detectados
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Para análise precisa, faça upload dos arquivos SRT de transcrição:
                  </p>
                  
                  <div className="space-y-2">
                    {videos.map((video, index) => {
                      const estimatedSize = estimateVideoSizeMB(video.duration_seconds);
                      const isLarge = estimatedSize > MAX_SIZE_MB;
                      const hasSrt = !!srtFiles[video.id];
                      
                      return (
                        <div 
                          key={video.id} 
                          className={`flex items-center justify-between p-2 rounded border ${
                            isLarge ? (hasSrt ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5') : 'border-border bg-muted/30'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Video className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{getVideoLabel(video, index)}</span>
                            {isLarge && (
                              <Badge variant="outline" className="text-[10px]">
                                ~{estimatedSize}MB
                              </Badge>
                            )}
                          </div>
                          
                          {isLarge && (
                            <div className="flex items-center gap-1">
                              {hasSrt ? (
                                <div className="flex items-center gap-1">
                                  <Check className="h-3 w-3 text-success" />
                                  <span className="text-xs text-success">SRT</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={() => removeSrt(video.id)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <input
                                    type="file"
                                    accept=".srt,.vtt,.txt"
                                    className="hidden"
                                    ref={el => fileInputRefs.current[video.id] = el}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleSrtUpload(video.id, file);
                                    }}
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => fileInputRefs.current[video.id]?.click()}
                                  >
                                    <Upload className="h-3 w-3 mr-1" />
                                    SRT
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* What will be PRESERVED */}
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-primary flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Será preservado:
                </p>
                <ul className="text-sm space-y-1.5 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-primary" />
                    {videos.length} vídeo(s) importado(s)
                  </li>
                </ul>
              </div>
              
              {/* What will be DELETED */}
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-destructive flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Será deletado e recriado:
                </p>
                <ul className="text-sm space-y-1.5 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-destructive" />
                    Eventos detectados
                  </li>
                  <li className="flex items-center gap-2">
                    <Music className="h-4 w-4 text-destructive" />
                    Áudios gerados
                  </li>
                  <li className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-destructive" />
                    Thumbnails
                  </li>
                  <li className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-destructive" />
                    Conversas do chatbot
                  </li>
                </ul>
              </div>

              {isResetting ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{currentStep}</span>
                    <span className="text-primary font-medium">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  {extractionProgress.stage !== 'idle' && extractionProgress.stage !== 'complete' && (
                    <p className="text-xs text-muted-foreground">
                      {extractionProgress.message}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="confirm-reset"
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked === true)}
                  />
                  <label
                    htmlFor="confirm-reset"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Entendo e quero refazer a análise
                  </label>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isResetting}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={!confirmed || isResetting}
          >
            {isResetting ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refazer Análise
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
