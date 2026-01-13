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
import { Search, Filter, Plus, Calendar, Trophy, Loader2, Video, Trash2, RefreshCw, Mic, Radio } from 'lucide-react';
import { useMatches, Match } from '@/hooks/useMatches';
import { useDeleteMatch } from '@/hooks/useDeleteMatch';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TeamBadge } from '@/components/teams/TeamBadge';
import { apiClient } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { ReprocessOptionsDialog } from '@/components/matches/ReprocessOptionsDialog';
import { supabase } from '@/integrations/supabase/client';

export default function Matches() {
  const navigate = useNavigate();
  const { data: matches = [], isLoading } = useMatches();
  const deleteMatch = useDeleteMatch();
  const [matchToDelete, setMatchToDelete] = useState<Match | null>(null);
  const [matchToReprocess, setMatchToReprocess] = useState<Match | null>(null);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
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

  const handleOpenReprocessDialog = (match: Match) => {
    setMatchToReprocess(match);
    setShowReprocessDialog(true);
  };

  // Função para garantir que partida está sincronizada com Cloud
  const ensureMatchSynced = async (matchId: string, match: Match): Promise<boolean> => {
    try {
      console.log('[Reprocess] ========================================');
      console.log('[Reprocess] INICIANDO SYNC DA PARTIDA');
      console.log('[Reprocess] Match ID:', matchId);
      
      // Tenta sync via servidor Python primeiro
      try {
        const result = await apiClient.ensureMatchInSupabase(matchId);
        
        if (result.success) {
          console.log('[Reprocess] ✓ Partida sincronizada via servidor Python');
          
          // Verificar se realmente existe no Cloud
          const { data: verifyMatch, error: verifyError } = await supabase
            .from('matches')
            .select('id')
            .eq('id', matchId)
            .single();
          
          if (!verifyError && verifyMatch) {
            console.log('[Reprocess] ✓ Verificação: partida confirmada no Cloud');
            // Aguardar propagação
            await new Promise(resolve => setTimeout(resolve, 500));
            return true;
          } else {
            console.warn('[Reprocess] ⚠ Servidor retornou sucesso, mas partida não encontrada no Cloud');
          }
        }
      } catch (serverError) {
        console.warn('[Reprocess] Servidor Python não disponível:', serverError);
      }
      
      // FALLBACK: Usar Edge Function sync-match (tem SERVICE_ROLE_KEY)
      console.log('[Reprocess] Usando Edge Function sync-match como fallback...');
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        console.error('[Reprocess] ✗ Supabase não configurado');
        return false;
      }
      
      const syncPayload = {
        id: matchId,
        home_team: match.home_team ? {
          id: match.home_team.id,
          name: match.home_team.name,
          short_name: match.home_team.short_name,
          logo_url: match.home_team.logo_url,
          primary_color: match.home_team.primary_color,
          secondary_color: match.home_team.secondary_color
        } : null,
        away_team: match.away_team ? {
          id: match.away_team.id,
          name: match.away_team.name,
          short_name: match.away_team.short_name,
          logo_url: match.away_team.logo_url,
          primary_color: match.away_team.primary_color,
          secondary_color: match.away_team.secondary_color
        } : null,
        home_score: match.home_score || 0,
        away_score: match.away_score || 0,
        match_date: match.match_date || new Date().toISOString(),
        competition: match.competition || null,
        venue: match.venue || null,
        status: match.status || 'pending'
      };
      
      console.log('[Reprocess] Enviando para sync-match:', JSON.stringify(syncPayload, null, 2));
      
      const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(syncPayload),
      });
      
      const syncResult = await syncResponse.json();
      console.log('[Reprocess] Edge Function sync-match resposta:', syncResult);
      
      if (!syncResult.success) {
        console.error('[Reprocess] ✗ Edge Function sync-match falhou:', syncResult.error);
        return false;
      }
      
      console.log('[Reprocess] ✓ Edge Function sync-match: sucesso');
      
      // VERIFICAÇÃO FINAL: Confirmar que partida existe no Cloud
      console.log('[Reprocess] Verificando existência da partida no Cloud...');
      
      // Aguardar propagação antes de verificar
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const { data: verifyMatch, error: verifyError } = await supabase
        .from('matches')
        .select('id, home_team_id, away_team_id')
        .eq('id', matchId)
        .single();
      
      if (verifyError || !verifyMatch) {
        console.error('[Reprocess] ✗ FALHA CRÍTICA: Partida não encontrada após sync!');
        console.error('[Reprocess] Erro:', verifyError);
        return false;
      }
      
      console.log('[Reprocess] ✓ VERIFICAÇÃO FINAL: Partida confirmada no Cloud');
      console.log('[Reprocess]   - ID:', verifyMatch.id);
      console.log('[Reprocess]   - Home Team ID:', verifyMatch.home_team_id);
      console.log('[Reprocess]   - Away Team ID:', verifyMatch.away_team_id);
      console.log('[Reprocess] ========================================');
      
      return true;
    } catch (error) {
      console.error('[Reprocess] ✗ Erro fatal no sync:', error);
      return false;
    }
  };

  const handleReprocess = async (options: {
    useExistingTranscription: { first: boolean; second: boolean };
    manualTranscription: { first: string; second: string; full: string };
    reTranscribe: { first: boolean; second: boolean };
  }) => {
    if (!matchToReprocess) return;
    
    console.log('========================================');
    console.log('[Reprocess] INICIADO');
    console.log('[Reprocess] Match ID:', matchToReprocess.id);
    console.log('[Reprocess] Options:', options);
    
    // ═══════════════════════════════════════════════════════════════
    // VERIFICAÇÃO PRÉVIA: Checar se há pelo menos um provedor de IA
    // ═══════════════════════════════════════════════════════════════
    try {
      const aiStatus = await apiClient.checkAiStatus();
      console.log('[Reprocess] AI Status:', aiStatus);
      
      if (!aiStatus.anyConfigured) {
        toast({
          title: "Nenhum provedor de IA configurado",
          description: "Configure uma chave de API (Lovable, Gemini, OpenAI ou Ollama) em Configurações > API antes de analisar.",
          variant: "destructive"
        });
        return;
      }
      
      // Log quais provedores estão disponíveis
      const availableProviders = [];
      if (aiStatus.lovable) availableProviders.push('Lovable');
      if (aiStatus.gemini) availableProviders.push('Gemini');
      if (aiStatus.openai) availableProviders.push('OpenAI');
      if (aiStatus.ollama) availableProviders.push('Ollama');
      console.log('[Reprocess] Provedores de IA disponíveis:', availableProviders.join(', '));
    } catch (aiCheckError) {
      console.warn('[Reprocess] Não foi possível verificar status de IA:', aiCheckError);
      // Continuar mesmo se a verificação falhar (endpoint pode não existir em versões antigas)
    }
    
    setIsReprocessing(true);
    const matchId = matchToReprocess.id;
    
    try {
      // 0. NOVO: Garantir que partida está sincronizada com Cloud
      setReprocessProgress({ stage: 'Sincronizando com Cloud...', progress: 1 });
      const syncSuccess = await ensureMatchSynced(matchId, matchToReprocess);
      if (!syncSuccess) {
        toast({
          title: "Erro de sincronização",
          description: "Não foi possível sincronizar a partida com o Cloud. Eventos não serão salvos.",
          variant: "destructive"
        });
        setIsReprocessing(false);
        setReprocessProgress({ stage: '', progress: 0 });
        return;
      }
      console.log('[Reprocess] ✓ Partida sincronizada, prosseguindo com análise...');
      
      // 1. Sincronizar e buscar vídeos do match
      setReprocessProgress({ stage: 'Sincronizando vídeos do storage...', progress: 3 });
      try {
        const syncResult = await apiClient.syncVideos(matchId);
        if (syncResult.synced > 0) {
          console.log(`[Reprocess] Sincronizados ${syncResult.synced} vídeos do storage`);
        }
      } catch (e) {
        console.warn('[Reprocess] Sincronização falhou:', e);
      }

      setReprocessProgress({ stage: 'Buscando vídeos...', progress: 5 });
      const videos = await apiClient.getVideos(matchId);
      
      if (!videos?.length) {
        throw new Error('Nenhum vídeo encontrado para esta partida');
      }
      
      // Ordenar vídeos: primeiro tempo primeiro, depois segundo tempo
      const sortedVideos = [...videos].sort((a, b) => {
        const order = { 'first_half': 1, 'full': 2, 'second_half': 3 };
        return (order[a.video_type as keyof typeof order] || 99) - (order[b.video_type as keyof typeof order] || 99);
      });
      
      // 2. Buscar transcrições existentes se necessário
      let existingTranscriptions: { first_half: string | null; second_half: string | null; full: string | null } = {
        first_half: null,
        second_half: null,
        full: null,
      };
      
      if (options.useExistingTranscription.first || options.useExistingTranscription.second) {
        setReprocessProgress({ stage: 'Carregando transcrições existentes...', progress: 10 });
        try {
          const files = await apiClient.listSubfolderFiles(matchId, 'texts').catch(() => ({ files: [] }));
          
          for (const file of files.files || []) {
            const filename = file.filename || file.name || '';
            const url = file.url || `${apiClient.getApiUrl()}/api/storage/${matchId}/texts/${filename}`;
            
            try {
              const content = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } }).then(r => r.text());
              
              if (filename.includes('first_half') && content.length > 50) {
                existingTranscriptions.first_half = content;
              } else if (filename.includes('second_half') && content.length > 50) {
                existingTranscriptions.second_half = content;
              } else if (filename.includes('full') && content.length > 50) {
                existingTranscriptions.full = content;
              }
            } catch (e) {
              console.warn(`[Reprocess] Could not load ${filename}:`, e);
            }
          }
        } catch (e) {
          console.warn('[Reprocess] Failed to load existing transcriptions:', e);
        }
      }
      
      let totalEventsCreated = 0;
      let finalHomeScore = 0;
      let finalAwayScore = 0;
      
      // 3. Processar cada vídeo
      for (let i = 0; i < sortedVideos.length; i++) {
        const video = sortedVideos[i];
        const videoUrl = video.file_url;
        const isFirstHalf = video.video_type === 'first_half';
        const isSecondHalf = video.video_type === 'second_half';
        const isFull = video.video_type === 'full';
        const halfKey = isFirstHalf ? 'first' : isSecondHalf ? 'second' : 'first';
        const halfLabel = isFirstHalf ? '1º Tempo' : isSecondHalf ? '2º Tempo' : 'Jogo Completo';
        
        // Debug logs
        console.log(`[Reprocess] Video ${i + 1}: type=${video.video_type}, halfKey=${halfKey}, isFull=${isFull}`);
        console.log(`[Reprocess] Manual texts: first=${!!options.manualTranscription.first}, second=${!!options.manualTranscription.second}, full=${!!options.manualTranscription.full}`);
        console.log(`[Reprocess] Use existing: first=${options.useExistingTranscription.first}, second=${options.useExistingTranscription.second}`);
        
        if (!videoUrl) {
          console.warn(`[Reprocess] Vídeo ${i + 1} sem URL, pulando...`);
          continue;
        }
        
        const progressBase = 20 + (i * 35);
        
        // Determinar fonte da transcrição
        let transcriptionText: string | null = null;
        
        // PRIORIDADE ATUALIZADA:
        // 1) Manual específico do tempo (first/second)
        // 2) Manual "full" como fallback universal
        // 3) Existente específico do tempo
        // 4) Transcrever
        if (options.manualTranscription[halfKey as 'first' | 'second']) {
          transcriptionText = options.manualTranscription[halfKey as 'first' | 'second'];
          console.log(`[Reprocess] ✓ Usando transcrição MANUAL específica para ${halfLabel}`);
        } else if (options.manualTranscription.full) {
          // NOVO: Fallback para transcrição "full" manual
          transcriptionText = options.manualTranscription.full;
          console.log(`[Reprocess] ✓ Usando transcrição MANUAL (full) para ${halfLabel}`);
        } else if (options.useExistingTranscription[halfKey as 'first' | 'second']) {
          transcriptionText = existingTranscriptions[`${halfKey}_half` as keyof typeof existingTranscriptions] 
            || existingTranscriptions.full;
          console.log(`[Reprocess] ✓ Usando transcrição EXISTENTE para ${halfLabel}`);
        }
        
        // ═══════════════════════════════════════════════════════════════
        // VALIDAÇÃO DE INTEGRIDADE: Verificar se transcrição pertence a esta partida
        // ═══════════════════════════════════════════════════════════════
        if (transcriptionText) {
          const homeTeamName = matchToReprocess.home_team?.name || '';
          const awayTeamName = matchToReprocess.away_team?.name || '';
          
          console.log('[Reprocess] ========================================');
          console.log('[Reprocess] VALIDAÇÃO DE INTEGRIDADE DA TRANSCRIÇÃO');
          console.log('[Reprocess] Time Casa:', homeTeamName);
          console.log('[Reprocess] Time Visitante:', awayTeamName);
          console.log('[Reprocess] Fonte:', options.manualTranscription[halfKey as 'first' | 'second'] ? 'MANUAL específico' : 
                      options.manualTranscription.full ? 'MANUAL (full)' : 'EXISTENTE');
          console.log('[Reprocess] Preview (100 chars):', transcriptionText.substring(0, 100));
          
          // Verificar se a transcrição menciona pelo menos um dos times
          const lowerText = transcriptionText.toLowerCase();
          const homeWords = homeTeamName.toLowerCase().split(' ').filter(w => w.length > 3);
          const awayWords = awayTeamName.toLowerCase().split(' ').filter(w => w.length > 3);
          
          const hasHomeTeam = homeWords.some(word => lowerText.includes(word));
          const hasAwayTeam = awayWords.some(word => lowerText.includes(word));
          
          console.log('[Reprocess] Palavras buscadas (casa):', homeWords.join(', '));
          console.log('[Reprocess] Palavras buscadas (visitante):', awayWords.join(', '));
          console.log('[Reprocess] Encontrou time da casa:', hasHomeTeam);
          console.log('[Reprocess] Encontrou time visitante:', hasAwayTeam);
          
          if (!hasHomeTeam && !hasAwayTeam && (homeWords.length > 0 || awayWords.length > 0)) {
            console.warn('[Reprocess] ⚠️ ALERTA: Transcrição não menciona nenhum dos times!');
            console.log('[Reprocess] ========================================');
            
            const confirmContinue = window.confirm(
              `⚠️ ATENÇÃO: A transcrição não parece mencionar os times desta partida:\n\n` +
              `Partida: ${homeTeamName} vs ${awayTeamName}\n\n` +
              `Isso pode indicar que você está usando a transcrição de outro jogo.\n\n` +
              `Deseja continuar mesmo assim?`
            );
            
            if (!confirmContinue) {
              console.warn('[Reprocess] Transcrição rejeitada pelo usuário - possível contaminação');
              toast({
                title: "Operação cancelada",
                description: "Transcrição rejeitada - verifique se está usando o arquivo correto.",
                variant: "destructive"
              });
              setIsReprocessing(false);
              setReprocessProgress({ stage: '', progress: 0 });
              return;
            }
            console.log('[Reprocess] Usuário confirmou continuar apesar do alerta');
          } else {
            console.log('[Reprocess] ✓ Validação OK - transcrição parece pertencer a esta partida');
          }
          console.log('[Reprocess] ========================================');
        }
        
        // Se não tem transcrição, precisa transcrever
        if (!transcriptionText) {
          setReprocessProgress({ 
            stage: `Transcrevendo ${halfLabel}... (pode levar 10-30min)`, 
            progress: progressBase 
          });
          
          try {
            const result = await apiClient.transcribeLargeVideo({ 
              videoUrl, 
              matchId,
              language: 'pt'
            });
            transcriptionText = result.text;
            console.log(`[Reprocess] ✓ Transcrição ${halfLabel}:`, transcriptionText?.length || 0, 'caracteres');
          } catch (transcriptionError: any) {
            console.error(`[Reprocess] ✗ Erro na transcrição do ${halfLabel}:`, transcriptionError);
            toast({
              title: `Erro no ${halfLabel}`,
              description: transcriptionError.message || 'Erro na transcrição',
              variant: "destructive"
            });
            continue;
          }
        }
        
        if (!transcriptionText || transcriptionText.length < 50) {
          console.warn(`[Reprocess] Transcrição do ${halfLabel} muito curta, pulando análise...`);
          continue;
        }
        
        // Análise com IA
        const gameStartMinute = video.start_minute ?? (isFirstHalf ? 0 : 45);
        const gameEndMinute = video.end_minute ?? (isFirstHalf ? 45 : 90);
        const halfType = isFirstHalf ? 'first' : isSecondHalf ? 'second' : 'full';
        
        // NOVO: Salvar transcrição manual no storage ANTES da análise
        const usedManualTranscription = options.manualTranscription[halfKey as 'first' | 'second'] || options.manualTranscription.full;
        if (transcriptionText && usedManualTranscription) {
          try {
            const srtHalfType = options.manualTranscription.full ? 'full' : halfKey as 'first' | 'second';
            await apiClient.uploadSrt(matchId, transcriptionText, srtHalfType);
            console.log(`[Reprocess] ✓ Transcrição manual salva em arquivo (${srtHalfType})`);
          } catch (e) {
            console.warn(`[Reprocess] Aviso: não salvou transcrição em arquivo:`, e);
          }
        }
        
        setReprocessProgress({ 
          stage: `Analisando ${halfLabel} com IA...`, 
          progress: progressBase + 20 
        });
        
        try {
          const analysisResult = await apiClient.analyzeMatch({
            matchId,
            transcription: transcriptionText,
            homeTeam: matchToReprocess.home_team?.name || 'Time Casa',
            awayTeam: matchToReprocess.away_team?.name || 'Time Visitante',
            gameStartMinute,
            gameEndMinute,
            halfType,
            // Passar dados do match para sync no fallback Edge Function
            matchData: {
              home_team: matchToReprocess.home_team ? {
                id: matchToReprocess.home_team.id,
                name: matchToReprocess.home_team.name,
                short_name: matchToReprocess.home_team.short_name,
                logo_url: matchToReprocess.home_team.logo_url,
                primary_color: matchToReprocess.home_team.primary_color,
                secondary_color: matchToReprocess.home_team.secondary_color
              } : undefined,
              away_team: matchToReprocess.away_team ? {
                id: matchToReprocess.away_team.id,
                name: matchToReprocess.away_team.name,
                short_name: matchToReprocess.away_team.short_name,
                logo_url: matchToReprocess.away_team.logo_url,
                primary_color: matchToReprocess.away_team.primary_color,
                secondary_color: matchToReprocess.away_team.secondary_color
              } : undefined,
              home_score: matchToReprocess.home_score || 0,
              away_score: matchToReprocess.away_score || 0,
              match_date: matchToReprocess.match_date,
              competition: matchToReprocess.competition,
              venue: matchToReprocess.venue,
              status: matchToReprocess.status
            }
          });
          
          const eventsCount = analysisResult?.eventsDetected || analysisResult?.eventsCreated || 0;
          totalEventsCreated += eventsCount;
          
          if (analysisResult?.homeScore !== undefined) {
            finalHomeScore = analysisResult.homeScore;
          }
          if (analysisResult?.awayScore !== undefined) {
            finalAwayScore = analysisResult.awayScore;
          }
          
          toast({
            title: `${halfLabel} analisado`,
            description: `${eventsCount} eventos detectados`
          });
        } catch (analysisError: any) {
          console.error(`[Reprocess] ✗ Erro na análise do ${halfLabel}:`, analysisError);
          toast({
            title: `Erro na análise do ${halfLabel}`,
            description: analysisError.message || 'Erro desconhecido',
            variant: "destructive"
          });
        }
      }
      
      // 4. Finalizar
      setReprocessProgress({ stage: 'Finalizando...', progress: 95 });
      
      await apiClient.updateMatch(matchId, { 
        status: 'completed',
        home_score: finalHomeScore,
        away_score: finalAwayScore
      });
      
      setReprocessProgress({ stage: 'Concluído!', progress: 100 });
      
      toast({
        title: "Análise completa!",
        description: `${totalEventsCreated} eventos detectados. Placar: ${finalHomeScore} x ${finalAwayScore}`
      });
      
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match-events', matchId] });
      queryClient.invalidateQueries({ queryKey: ['match-details', matchId] });
      
      setTimeout(() => {
        const reprocessedId = matchToReprocess.id;
        setMatchToReprocess(null);
        setShowReprocessDialog(false);
        setIsReprocessing(false);
        setReprocessProgress({ stage: '', progress: 0 });
        navigate(`/events?match=${reprocessedId}`);
      }, 1500);
      
    } catch (error: any) {
      console.error('[Reprocess] ✗ ERRO:', error);
      toast({
        title: "Erro no reprocessamento",
        description: error.message || 'Erro desconhecido',
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
                    {/* Live match buttons */}
                    {match.status === 'live' && (
                      <>
                        <Button variant="arena" size="sm" className="flex-1 animate-pulse" asChild>
                          <Link to="/live">
                            <Radio className="mr-2 h-4 w-4" />
                            Ver Ao Vivo
                          </Link>
                        </Button>
                      </>
                    )}
                    {(match.status === 'completed' || match.status === 'analyzed') && (
                      <Button variant="arena-outline" size="sm" className="flex-1" asChild>
                        <Link to={`/events?match=${match.id}`}>Ver Análise</Link>
                      </Button>
                    )}
                    {match.status === 'pending' && (
                      <Button variant="arena-outline" size="sm" className="flex-1" asChild>
                        <Link to={`/events?match=${match.id}`}>Ver Análise</Link>
                      </Button>
                    )}
                    {match.status === 'analyzing' && (
                      <Button 
                        variant="arena-outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleOpenReprocessDialog(match)}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reprocessar
                      </Button>
                    )}
                    {/* Delete button - always visible for all statuses */}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setMatchToDelete(match)}
                      title="Deletar partida"
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

        {/* Reprocess Options Dialog */}
        <ReprocessOptionsDialog
          open={showReprocessDialog}
          onOpenChange={(open) => {
            if (!isReprocessing) {
              setShowReprocessDialog(open);
              if (!open) setMatchToReprocess(null);
            }
          }}
          match={matchToReprocess}
          onReprocess={handleReprocess}
          isReprocessing={isReprocessing}
          progress={reprocessProgress}
        />
      </div>
    </AppLayout>
  );
}
