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
  BarChart3, Video, FileText, Check, Upload, X, Loader2, Mic
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStartAnalysis } from '@/hooks/useAnalysisJob';
import { useWhisperTranscription } from '@/hooks/useWhisperTranscription';

interface ResetMatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  videos: Array<{
    id: string;
    file_url: string;
    video_type: string | null;
    start_minute: number | null;
    end_minute: number | null;
    duration_seconds: number | null;
  }>;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName?: string;
  awayTeamName?: string;
  competition: string | null;
  onResetComplete: () => void;
}

// Estimate video size from duration (rough: ~10MB per minute for compressed video)
const estimateVideoSizeMB = (durationSeconds: number | null): number => {
  if (!durationSeconds) return 300; // Assume large if unknown
  return Math.round((durationSeconds / 60) * 10);
};

export function ResetMatchDialog({
  isOpen,
  onClose,
  matchId,
  videos,
  homeTeamId,
  awayTeamId,
  homeTeamName = 'Time Casa',
  awayTeamName = 'Time Visitante',
  competition,
  onResetComplete,
}: ResetMatchDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [srtFiles, setSrtFiles] = useState<Record<string, { file?: File; content: string; auto?: boolean }>>({});
  const [transcribingVideo, setTranscribingVideo] = useState<string | null>(null);
  const { startAnalysis } = useStartAnalysis();
  const { transcribeVideo, transcriptionProgress, isTranscribing } = useWhisperTranscription();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleSrtUpload = async (videoId: string, file: File) => {
    const content = await file.text();
    setSrtFiles(prev => ({ ...prev, [videoId]: { file, content } }));
  };

  const handleAutoTranscribe = async (videoId: string, videoUrl: string) => {
    setTranscribingVideo(videoId);
    
    try {
      const result = await transcribeVideo(videoUrl, matchId, videoId);
      
      if (result) {
        setSrtFiles(prev => ({ 
          ...prev, 
          [videoId]: { content: result.srtContent, auto: true } 
        }));
        toast.success('Transcrição automática concluída!');
      } else {
        toast.error('Erro na transcrição automática');
      }
    } catch (error) {
      console.error('Auto transcription error:', error);
      toast.error('Erro ao transcrever automaticamente');
    } finally {
      setTranscribingVideo(null);
    }
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
      // Step 1: Delete events (but NOT videos)
      setCurrentStep('Deletando eventos...');
      setProgress(10);
      const { error: eventsError } = await supabase
        .from('match_events')
        .delete()
        .eq('match_id', matchId);
      if (eventsError) throw new Error(`Erro ao deletar eventos: ${eventsError.message}`);

      // Step 2: Delete analysis jobs
      setCurrentStep('Deletando análises anteriores...');
      setProgress(25);
      const { error: analysisError } = await supabase
        .from('analysis_jobs')
        .delete()
        .eq('match_id', matchId);
      if (analysisError) throw new Error(`Erro ao deletar análises: ${analysisError.message}`);

      // Step 3: Delete generated audio
      setCurrentStep('Deletando áudios gerados...');
      setProgress(40);
      const { error: audioError } = await supabase
        .from('generated_audio')
        .delete()
        .eq('match_id', matchId)
        .neq('audio_type', 'extracted');
      if (audioError) throw new Error(`Erro ao deletar áudios: ${audioError.message}`);

      // Step 4: Delete thumbnails
      setCurrentStep('Deletando thumbnails...');
      setProgress(55);
      const { error: thumbnailsError } = await supabase
        .from('thumbnails')
        .delete()
        .eq('match_id', matchId);
      if (thumbnailsError) throw new Error(`Erro ao deletar thumbnails: ${thumbnailsError.message}`);

      // Step 5: Delete chatbot conversations
      setCurrentStep('Deletando conversas do chatbot...');
      setProgress(65);
      const { error: chatbotError } = await supabase
        .from('chatbot_conversations')
        .delete()
        .eq('match_id', matchId);
      if (chatbotError) throw new Error(`Erro ao deletar conversas: ${chatbotError.message}`);

      // Step 6: Reset match score
      setCurrentStep('Resetando placar...');
      setProgress(75);
      const { error: matchError } = await supabase
        .from('matches')
        .update({ home_score: 0, away_score: 0, status: 'pending' })
        .eq('id', matchId);
      if (matchError) throw new Error(`Erro ao resetar partida: ${matchError.message}`);

      // Step 7: Start new analysis for all videos WITH transcriptions
      setCurrentStep('Iniciando nova análise...');
      setProgress(80);
      
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const srtData = srtFiles[video.id];
        
        setCurrentStep(`Iniciando análise do vídeo ${i + 1} de ${videos.length}...`);
        setProgress(80 + (i / videos.length) * 15);
        
        if (!srtData?.content) {
          toast.error(`Vídeo ${i + 1} requer transcrição SRT`);
          continue;
        }
        
        // Determinar halfType baseado no video_type ou start_minute
        const halfType = video.video_type === 'second_half' 
          ? 'second' 
          : video.video_type === 'first_half' 
            ? 'first' 
            : (video.start_minute ?? 0) >= 45 ? 'second' : 'first';

        await startAnalysis({
          matchId,
          transcription: srtData.content,
          homeTeam: homeTeamName,
          awayTeam: awayTeamName,
          gameStartMinute: video.start_minute ?? 0,
          gameEndMinute: video.end_minute ?? (halfType === 'first' ? 48 : 95),
          halfType,
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
    if (!isResetting && !isTranscribing) {
      setConfirmed(false);
      setSrtFiles({});
      onClose();
    }
  };

  const getVideoLabel = (video: typeof videos[0], index: number) => {
    if (video.video_type === 'first_half') return '1º Tempo';
    if (video.video_type === 'second_half') return '2º Tempo';
    if (video.start_minute === 0 && video.end_minute === 45) return '1º Tempo';
    if (video.start_minute === 45) return '2º Tempo';
    return `Vídeo ${index + 1}`;
  };

  const allVideosHaveTranscription = videos.every(v => !!srtFiles[v.id]);

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

              {/* Transcription section */}
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 space-y-3">
                <p className="text-sm font-medium text-primary flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  Transcrição dos Vídeos
                </p>
                <p className="text-xs text-muted-foreground">
                  Gere a transcrição automaticamente com kakttus Transcrição ou faça upload de arquivos SRT:
                </p>
                
                <div className="space-y-2">
                  {videos.map((video, index) => {
                    const hasSrt = !!srtFiles[video.id];
                    const isCurrentlyTranscribing = transcribingVideo === video.id;
                    const isAuto = srtFiles[video.id]?.auto;
                    
                    return (
                      <div 
                        key={video.id} 
                        className={`p-2 rounded border ${
                          hasSrt ? 'border-success/30 bg-success/5' : 'border-border bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Video className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{getVideoLabel(video, index)}</span>
                            {video.duration_seconds && (
                              <Badge variant="outline" className="text-[10px]">
                                {Math.round(video.duration_seconds / 60)}min
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {hasSrt ? (
                              <div className="flex items-center gap-1">
                                <Check className="h-3 w-3 text-success" />
                                <span className="text-xs text-success">
                                  {isAuto ? 'Auto' : 'SRT'}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => removeSrt(video.id)}
                                  disabled={isResetting}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : isCurrentlyTranscribing ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                <span className="text-xs text-muted-foreground">
                                  {transcriptionProgress.progress}%
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-6 text-xs"
                                  onClick={() => handleAutoTranscribe(video.id, video.file_url)}
                                  disabled={isTranscribing || isResetting}
                                >
                                  <Mic className="h-3 w-3 mr-1" />
                                  Transcrever
                                </Button>
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
                                  disabled={isTranscribing || isResetting}
                                >
                                  <Upload className="h-3 w-3 mr-1" />
                                  SRT
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {isCurrentlyTranscribing && (
                          <div className="mt-2">
                            <Progress value={transcriptionProgress.progress} className="h-1" />
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {transcriptionProgress.message}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {!allVideosHaveTranscription && (
                  <p className="text-xs text-warning">
                    ⚠️ Vídeos sem transcrição podem não gerar eventos corretamente.
                  </p>
                )}
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
          <Button variant="outline" onClick={handleClose} disabled={isResetting || isTranscribing}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={!confirmed || isResetting || isTranscribing}
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
