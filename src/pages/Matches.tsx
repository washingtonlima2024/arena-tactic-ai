import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Search, Filter, Plus, Calendar, Trophy, Loader2, Video, Trash2, RefreshCw, Mic } from 'lucide-react';
import { useMatches, Match } from '@/hooks/useMatches';
import { useDeleteMatch } from '@/hooks/useDeleteMatch';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TeamBadge } from '@/components/teams/TeamBadge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export default function Matches() {
  const navigate = useNavigate();
  const { data: matches = [], isLoading } = useMatches();
  const deleteMatch = useDeleteMatch();
  const [matchToDelete, setMatchToDelete] = useState<Match | null>(null);
  const [matchToReprocess, setMatchToReprocess] = useState<Match | null>(null);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [reprocessProgress, setReprocessProgress] = useState({ stage: '', progress: 0 });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const completedMatches = matches.filter(m => m.status === 'completed').length;
  const analyzingMatches = matches.filter(m => m.status === 'analyzing').length;
  const pendingMatches = matches.filter(m => m.status === 'pending').length;


  const handleDeleteConfirm = () => {
    if (matchToDelete) {
      deleteMatch.mutate(matchToDelete.id);
      setMatchToDelete(null);
    }
  };

  const handleReprocess = async () => {
    if (!matchToReprocess) return;
    
    console.log('========================================');
    console.log('[Reprocess] INICIADO');
    console.log('[Reprocess] Match ID:', matchToReprocess.id);
    console.log('[Reprocess] Times:', matchToReprocess.home_team?.name, 'vs', matchToReprocess.away_team?.name);
    
    // Feedback imediato para o usuário
    toast({
      title: "Iniciando reprocessamento...",
      description: "Carregando processador de áudio"
    });
    
    setIsReprocessing(true);
    const matchId = matchToReprocess.id;
    
    // Timeout de segurança - alerta se demorar muito
    const safetyTimeoutId = setTimeout(() => {
      console.warn('[Reprocess] ⚠️ Processo está demorando mais de 45 segundos');
      toast({
        title: "Processo demorado",
        description: "O carregamento está levando mais tempo que o esperado. Se travar, recarregue a página.",
        variant: "destructive"
      });
    }, 45000);
    
    try {
      // 1. Buscar vídeos do match
      console.log('[Reprocess] PASSO 1: Buscando vídeos...');
      setReprocessProgress({ stage: 'Buscando vídeos...', progress: 5 });
      
      const { data: videos, error: videoError } = await supabase
        .from('videos')
        .select('*')
        .eq('match_id', matchId);
      
      if (videoError || !videos?.length) {
        throw new Error('Nenhum vídeo encontrado para esta partida');
      }
      
      console.log('[Reprocess] ✓ Vídeos encontrados:', videos.length);
      
      // 2. Pegar primeiro vídeo para transcrição
      const video = videos[0];
      const videoUrl = video.file_url;
      
      if (!videoUrl) {
        throw new Error('URL do vídeo não encontrada');
      }
      
      console.log('[Reprocess] PASSO 2: Iniciando transcrição server-side...');
      console.log('[Reprocess] URL do vídeo:', videoUrl);
      setReprocessProgress({ stage: 'Transcrevendo vídeo (servidor)...', progress: 20 });
      
      // 3. Usar edge function server-side diretamente (sem FFmpeg no browser)
      const { data: transcriptionResult, error: transcriptionError } = await supabase.functions.invoke('transcribe-large-video', {
        body: { videoUrl }
      });
      
      // Limpar timeout de segurança se chegamos aqui
      clearTimeout(safetyTimeoutId);
      
      if (transcriptionError) {
        console.error('[Reprocess] ✗ Erro na transcrição:', transcriptionError);
        throw new Error(transcriptionError.message || 'Erro na transcrição do vídeo');
      }
      
      if (!transcriptionResult?.text) {
        throw new Error('Transcrição retornou vazia. Verifique se o vídeo contém áudio.');
      }
      
      console.log('[Reprocess] ✓ Transcrição obtida:', transcriptionResult.text.length, 'caracteres');
      console.log('[Reprocess] Preview:', transcriptionResult.text.substring(0, 200) + '...');
      
      toast({
        title: "Transcrição concluída",
        description: "Transcrição realizada no servidor com sucesso"
      });
      
      // 4. Chamar analyze-match para detectar eventos
      console.log('[Reprocess] PASSO 3: Analisando eventos com IA...');
      setReprocessProgress({ stage: 'Analisando eventos com IA...', progress: 70 });
      
      const { data: analysisResult, error: analysisError } = await supabase.functions.invoke('analyze-match', {
        body: {
          matchId,
          transcription: transcriptionResult.text,
          homeTeam: matchToReprocess.home_team?.name || 'Time Casa',
          awayTeam: matchToReprocess.away_team?.name || 'Time Visitante',
          gameStartMinute: 0,
          gameEndMinute: 90,
          halfType: 'full'
        }
      });
      
      if (analysisError) {
        console.error('[Reprocess] ✗ Erro na análise:', analysisError);
        throw new Error(`Erro na análise: ${analysisError.message}`);
      }
      
      console.log('[Reprocess] ✓ Resultado da análise:', analysisResult);
      
      // 5. Atualizar status do match
      console.log('[Reprocess] PASSO 4: Finalizando...');
      setReprocessProgress({ stage: 'Finalizando...', progress: 90 });
      
      await supabase
        .from('matches')
        .update({ 
          status: 'completed',
          home_score: analysisResult?.homeScore ?? 0,
          away_score: analysisResult?.awayScore ?? 0
        })
        .eq('id', matchId);
      
      setReprocessProgress({ stage: 'Concluído!', progress: 100 });
      
      console.log('[Reprocess] ✓ CONCLUÍDO!');
      console.log('========================================');
      
      toast({
        title: "Análise concluída!",
        description: `${analysisResult?.eventsCreated || 0} eventos detectados.`
      });
      
      // Invalidar todas as queries relacionadas à partida
      const reprocessedMatchId = matchToReprocess.id;
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match-events', reprocessedMatchId] });
      queryClient.invalidateQueries({ queryKey: ['match-details', reprocessedMatchId] });
      queryClient.invalidateQueries({ queryKey: ['match-analysis', reprocessedMatchId] });
      queryClient.invalidateQueries({ queryKey: ['completed-matches'] });
      
      setTimeout(() => {
        const reprocessedId = matchToReprocess.id;
        setMatchToReprocess(null);
        setIsReprocessing(false);
        setReprocessProgress({ stage: '', progress: 0 });
        // Navegar para a página de eventos após o sucesso
        navigate(`/events?match=${reprocessedId}`);
      }, 1500);
      
    } catch (error: any) {
      clearTimeout(safetyTimeoutId);
      console.error('[Reprocess] ✗ ERRO:', error);
      console.error('[Reprocess] Stack:', error.stack);
      
      const errorMessage = error.message || 'Erro desconhecido';
      const isFileTooLarge = errorMessage.includes('muito grande') || errorMessage.includes('Máximo:');
      
      toast({
        title: isFileTooLarge ? "Vídeo muito grande" : "Erro no reprocessamento",
        description: isFileTooLarge 
          ? "O vídeo excede 24MB. Use a página de Upload para importar um arquivo SRT manualmente."
          : errorMessage,
        variant: "destructive"
      });
      setIsReprocessing(false);
      setReprocessProgress({ stage: '', progress: 0 });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Partidas</h1>
            <p className="text-muted-foreground">
              Gerencie e analise suas partidas de futebol
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/live">
                <Mic className="mr-2 h-4 w-4" />
                Ao Vivo
              </Link>
            </Button>
            <Button variant="arena" asChild>
              <Link to="/upload">
                <Plus className="mr-2 h-4 w-4" />
                Importar Partida
              </Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar partidas..."
              className="pl-10"
            />
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="w-full sm:w-40">
              <Trophy className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Competição" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="laliga">La Liga</SelectItem>
              <SelectItem value="premier">Premier League</SelectItem>
              <SelectItem value="ucl">Champions League</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all">
            <SelectTrigger className="w-full sm:w-40">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="year">Este ano</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="font-display text-2xl font-bold">{matches.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Analisadas</p>
            <p className="font-display text-2xl font-bold text-success">{completedMatches}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Em análise</p>
            <p className="font-display text-2xl font-bold text-primary">{analyzingMatches}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Pendentes</p>
            <p className="font-display text-2xl font-bold text-muted-foreground">{pendingMatches}</p>
          </div>
        </div>

        {/* Matches Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : matches.length === 0 ? (
          <Card variant="glass">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Video className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma partida encontrada</h3>
              <p className="text-muted-foreground text-center mb-4">
                Importe um vídeo para começar a análise tática
              </p>
              <Button variant="arena" asChild>
                <Link to="/upload">
                  <Plus className="mr-2 h-4 w-4" />
                  Importar Partida
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map(match => (
              <Card key={match.id} variant="glass" className="overflow-hidden hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <Badge variant={
                      match.status === 'completed' ? 'success' :
                      match.status === 'analyzing' ? 'arena' : 'secondary'
                    }>
                      {match.status === 'completed' ? 'Analisada' :
                       match.status === 'analyzing' ? 'Analisando' : 'Pendente'}
                    </Badge>
                    {match.competition && (
                      <span className="text-xs text-muted-foreground">{match.competition}</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4 mb-4">
                    {/* Home Team */}
                    <div className="flex-1 text-center">
                      <TeamBadge 
                        team={{
                          name: match.home_team?.name || 'Casa',
                          logo_url: match.home_team?.logo_url || undefined,
                          short_name: match.home_team?.short_name || match.home_team?.name?.slice(0, 3),
                          primary_color: match.home_team?.primary_color || undefined
                        }} 
                        size="lg" 
                        className="mx-auto mb-2"
                      />
                      <p className="text-sm font-medium truncate">{match.home_team?.name || 'Time Casa'}</p>
                    </div>

                    {/* Score */}
                    <div className="text-center">
                      <div className="text-2xl font-bold">
                        {match.home_score ?? 0} - {match.away_score ?? 0}
                      </div>
                    </div>

                    {/* Away Team */}
                    <div className="flex-1 text-center">
                      <TeamBadge 
                        team={{
                          name: match.away_team?.name || 'Visitante',
                          logo_url: match.away_team?.logo_url || undefined,
                          short_name: match.away_team?.short_name || match.away_team?.name?.slice(0, 3),
                          primary_color: match.away_team?.primary_color || undefined
                        }} 
                        size="lg" 
                        className="mx-auto mb-2"
                      />
                      <p className="text-sm font-medium truncate">{match.away_team?.name || 'Time Visitante'}</p>
                    </div>
                  </div>

                  {match.match_date && (
                    <p className="text-xs text-center text-muted-foreground">
                      {format(new Date(match.match_date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  )}

                  <div className="flex gap-2 mt-4">
                    {match.status === 'completed' && (
                      <Button variant="arena-outline" size="sm" className="flex-1" asChild>
                        <Link to={`/analysis?match=${match.id}`}>Ver Análise</Link>
                      </Button>
                    )}
                    {(match.status === 'analyzing' || match.status === 'pending') && (
                      <Button 
                        variant="arena-outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setMatchToReprocess(match)}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reprocessar
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setMatchToDelete(match)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!matchToDelete} onOpenChange={(open) => !open && setMatchToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deletar Partida</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação irá remover permanentemente a partida 
                <strong> {matchToDelete?.home_team?.name || 'Time Casa'} vs {matchToDelete?.away_team?.name || 'Time Visitante'}</strong> e todos os dados relacionados:
                <ul className="list-disc list-inside mt-2 space-y-1 text-left">
                  <li>Eventos da partida</li>
                  <li>Áudios gerados (narrações e podcasts)</li>
                  <li>Vídeos importados</li>
                  <li>Análises táticas</li>
                  <li>Thumbnails geradas</li>
                  <li>Conversas do chatbot</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMatch.isPending}
              >
                {deleteMatch.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deletando...
                  </>
                ) : (
                  'Deletar'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reprocess Dialog */}
        <AlertDialog open={!!matchToReprocess} onOpenChange={(open) => !open && !isReprocessing && setMatchToReprocess(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-primary" />
                Reprocessar Partida
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  <p className="mb-4">
                    Extrair áudio e transcrever automaticamente a partida 
                    <strong> {matchToReprocess?.home_team?.name || 'Time Casa'} vs {matchToReprocess?.away_team?.name || 'Time Visitante'}</strong>?
                  </p>
                  
                  {isReprocessing && (
                    <div className="space-y-3 mt-4 p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm font-medium">{reprocessProgress.stage}</span>
                      </div>
                      <Progress value={reprocessProgress.progress} className="h-2" />
                    </div>
                  )}
                  
                  {!isReprocessing && (
                    <ul className="list-disc list-inside mt-2 space-y-1 text-left text-sm text-muted-foreground">
                      <li>Extração do áudio do vídeo</li>
                      <li>Transcrição automática com Whisper</li>
                      <li>Detecção de eventos com IA</li>
                      <li>Atualização do placar final</li>
                    </ul>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isReprocessing}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleReprocess}
                disabled={isReprocessing}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isReprocessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Iniciar
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
