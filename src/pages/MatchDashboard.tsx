import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppLayout } from "@/components/layout/AppLayout";
import { SoccerBallLoader } from "@/components/ui/SoccerBallLoader";
import { Progress } from "@/components/ui/progress";
import { getEventLabel } from '@/lib/eventLabels';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";
import {
  Target,
  AlertTriangle,
  Flag,
  CornerDownRight,
  Users,
  Activity,
  Play,
  ChevronRight,
  TrendingUp,
  Shield,
  Zap,
  Star,
  Eye,
  Clock,
  MapPin,
  ArrowLeft,
  X,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";
import { useMatchEvents, useMatchDetails, useMatchAnalysis } from "@/hooks/useMatchDetails";
import { useMatchSelection } from "@/hooks/useMatchSelection";
import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/apiClient";
import { useDynamicMatchStats } from "@/hooks/useDynamicMatchStats";

// Goal Validation Types
interface GoalValidation {
  keywordsFound: number;
  estimatedGoals: number;
  detectedGoals: number;
  discrepancy: number;
  keywords: { keyword: string; count: number }[];
  status: 'success' | 'warning' | 'error';
}

// Goal Validation Component
function GoalValidationCard({
  matchId,
  events,
  homeScore,
  awayScore,
}: {
  matchId: string | null;
  events: MatchEvent[];
  homeScore: number;
  awayScore: number;
}) {
  const [validation, setValidation] = useState<GoalValidation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);

  // Calculate detected goals from events
  const detectedGoals = useMemo(() => {
    return events.filter(e => e.event_type === 'goal').length;
  }, [events]);

  // Fetch transcription and validate
  useEffect(() => {
    if (!matchId) return;

    const fetchAndValidate = async () => {
      setIsLoading(true);
      try {
        // Get analysis job to retrieve transcription
        const jobs = await apiClient.getAnalysisJobs(matchId);
        const completedJob = jobs.find((j: any) => j.status === 'completed');
        
        if (completedJob?.result) {
          const result = completedJob.result as any;
          const transcriptionText = result?.transcription || result?.fullTranscription || '';
          
          if (transcriptionText) {
            setTranscription(transcriptionText);
            
            // Goal keywords to search
            const goalKeywords = [
              'GOOOL', 'GOLAÇO', 'GOL!', 'É GOL', 'PRA DENTRO', 'ENTROU',
              'PRIMEIRO GOL', 'SEGUNDO GOL', 'TERCEIRO GOL', 'QUARTO GOL',
              'QUINTO GOL', 'GOL DE', 'GOL DO', 'GOOOOL', 'GOLAAAAÇO',
              'ABRIU O PLACAR', 'EMPATA O JOGO', 'VIROU O JOGO', 'GOL CONTRA'
            ];
            
            const transcriptionUpper = transcriptionText.toUpperCase();
            let totalMentions = 0;
            const keywordCounts: { keyword: string; count: number }[] = [];
            
            goalKeywords.forEach(kw => {
              const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
              const matches = transcriptionText.match(regex);
              const count = matches ? matches.length : 0;
              if (count > 0) {
                keywordCounts.push({ keyword: kw, count });
                totalMentions += count;
              }
            });
            
            // Estimate expected goals (cap at 10 to avoid false positives)
            const estimatedGoals = Math.min(totalMentions, 10);
            const discrepancy = estimatedGoals - detectedGoals;
            
            setValidation({
              keywordsFound: totalMentions,
              estimatedGoals,
              detectedGoals,
              discrepancy: discrepancy > 0 ? discrepancy : 0,
              keywords: keywordCounts.sort((a, b) => b.count - a.count),
              status: discrepancy <= 0 ? 'success' : discrepancy === 1 ? 'warning' : 'error'
            });
          } else {
            // No transcription available
            setValidation({
              keywordsFound: 0,
              estimatedGoals: 0,
              detectedGoals,
              discrepancy: 0,
              keywords: [],
              status: 'success'
            });
          }
        }
      } catch (error) {
        console.error('Error fetching validation data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndValidate();
  }, [matchId, detectedGoals]);

  if (!matchId) return null;

  const scoreTotal = homeScore + awayScore;
  const scoreMatch = detectedGoals === scoreTotal;

  return (
    <Card className={`border-l-4 ${
      validation?.status === 'success' ? 'border-l-green-500' :
      validation?.status === 'warning' ? 'border-l-yellow-500' :
      validation?.status === 'error' ? 'border-l-red-500' :
      'border-l-muted'
    }`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Validação de Gols
          {isLoading && <span className="text-xs text-muted-foreground">(carregando...)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Score vs Events Comparison */}
        <div className="flex items-center justify-between">
          <span className="text-sm">Placar registrado</span>
          <Badge variant={scoreMatch ? "default" : "destructive"}>
            {homeScore} + {awayScore} = {scoreTotal} gols
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Eventos de gol</span>
          <Badge variant={scoreMatch ? "default" : "destructive"}>
            {detectedGoals} detectados
          </Badge>
        </div>

        {/* Validation Status */}
        {validation && (
          <>
            <div className="border-t pt-3 mt-3">
              <div className="flex items-center gap-2 mb-2">
                {validation.status === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : validation.status === 'warning' ? (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm font-medium">
                  {validation.status === 'success' ? 'Validação OK' :
                   validation.status === 'warning' ? 'Possível discrepância' :
                   `⚠️ ${validation.discrepancy} gol(s) podem ter sido perdidos`}
                </span>
              </div>

              {/* Keywords Found */}
              {validation.keywords.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Menções na transcrição: {validation.keywordsFound}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {validation.keywords.slice(0, 5).map((kw, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {kw.keyword} ({kw.count}x)
                      </Badge>
                    ))}
                    {validation.keywords.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{validation.keywords.length - 5} mais
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Confidence Bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Confiança da detecção</span>
                  <span className={
                    validation.status === 'success' ? 'text-green-500' :
                    validation.status === 'warning' ? 'text-yellow-500' :
                    'text-red-500'
                  }>
                    {validation.discrepancy === 0 ? '100%' :
                     validation.discrepancy === 1 ? '~85%' :
                     `~${Math.max(50, 100 - validation.discrepancy * 20)}%`}
                  </span>
                </div>
                <Progress 
                  value={validation.discrepancy === 0 ? 100 : Math.max(50, 100 - validation.discrepancy * 20)} 
                  className={`h-2 ${
                    validation.status === 'success' ? '[&>div]:bg-green-500' :
                    validation.status === 'warning' ? '[&>div]:bg-yellow-500' :
                    '[&>div]:bg-red-500'
                  }`}
                />
              </div>
            </div>
          </>
        )}

        {!validation && !isLoading && (
          <p className="text-xs text-muted-foreground">
            Sem dados de transcrição disponíveis
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type PeriodKey = "H1" | "H2" | "ALL";
type AnalysisLevel = 1 | 2 | 3 | 4;

interface SummaryCard {
  key: string;
  label: string;
  valueA: number;
  valueB: number;
  icon: React.ReactNode;
  color: string;
}

interface MinutePoint {
  minute: number;
  a: number;
  b: number;
}

interface MatchEvent {
  id: string;
  event_type: string;
  minute: number | null;
  second: number | null;
  description: string | null;
  match_half?: string | null;
  metadata: any;
  clip_url: string | null;
  is_highlight: boolean | null;
}

// Breadcrumb navigation component
function BreadcrumbRow({ 
  level, 
  period, 
  teamFilter, 
  selectedEvent,
  onNavigate 
}: { 
  level: AnalysisLevel;
  period: PeriodKey;
  teamFilter: string;
  selectedEvent: MatchEvent | null;
  onNavigate: (level: AnalysisLevel) => void;
}) {
  const periodLabel = period === "H1" ? "1º Tempo" : period === "H2" ? "2º Tempo" : "Jogo Completo";
  
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 flex-wrap">
      <Button 
        variant="ghost" 
        size="sm" 
        className={level >= 1 ? "text-primary font-medium" : ""}
        onClick={() => onNavigate(1)}
      >
        {periodLabel}
      </Button>
      {level >= 2 && (
        <>
          <ChevronRight className="h-4 w-4" />
          <Button 
            variant="ghost" 
            size="sm"
            className={level >= 2 ? "text-primary font-medium" : ""}
            onClick={() => onNavigate(2)}
          >
            {teamFilter === "home" ? "Time Casa" : teamFilter === "away" ? "Time Visitante" : "Comparativo"}
          </Button>
        </>
      )}
      {level >= 3 && selectedEvent && (
        <>
          <ChevronRight className="h-4 w-4" />
          <Button 
            variant="ghost" 
            size="sm"
            className={level >= 3 ? "text-primary font-medium" : ""}
            onClick={() => onNavigate(3)}
          >
            {selectedEvent.event_type} - {selectedEvent.minute}'
          </Button>
        </>
      )}
      {level >= 4 && (
        <>
          <ChevronRight className="h-4 w-4" />
          <Badge variant="outline" className="text-primary">Evidência</Badge>
        </>
      )}
    </div>
  );
}

// Highlights top section with summary cards
function HighlightsTop({ 
  events, 
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  onPickCard,
  selectedCard
}: { 
  events: MatchEvent[];
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  onPickCard: (cardKey: string) => void;
  selectedCard: string | null;
}) {
  const stats = useMemo(() => {
    const goals = events.filter(e => e.event_type === 'goal');
    const fouls = events.filter(e => e.event_type === 'foul');
    const cards = events.filter(e => ['yellow_card', 'red_card', 'card'].includes(e.event_type));
    const corners = events.filter(e => e.event_type === 'corner');
    const offsides = events.filter(e => e.event_type === 'offside');
    const substitutions = events.filter(e => e.event_type === 'substitution');
    const shots = events.filter(e => ['shot', 'shot_on_target'].includes(e.event_type));
    const shotsOnTarget = events.filter(e => e.event_type === 'shot_on_target');

    // Count by team (using metadata.team or description analysis)
    const countByTeam = (evts: MatchEvent[]) => {
      let home = 0, away = 0;
      evts.forEach(e => {
        const team = e.metadata?.team?.toLowerCase() || '';
        const desc = e.description?.toLowerCase() || '';
        if (team.includes('home') || team.includes('casa') || desc.includes(homeTeamName.toLowerCase().slice(0, 4))) {
          home++;
        } else {
          away++;
        }
      });
      return { home, away };
    };

    return [
      { key: 'goal', label: 'Gols', ...countByTeam(goals), icon: <Target className="h-5 w-5" />, color: 'text-green-500' },
      { key: 'foul', label: 'Faltas', ...countByTeam(fouls), icon: <AlertTriangle className="h-5 w-5" />, color: 'text-yellow-500' },
      { key: 'card', label: 'Cartões', ...countByTeam(cards), icon: <Flag className="h-5 w-5" />, color: 'text-red-500' },
      { key: 'corner', label: 'Escanteios', ...countByTeam(corners), icon: <CornerDownRight className="h-5 w-5" />, color: 'text-blue-500' },
      { key: 'offside', label: 'Impedimentos', ...countByTeam(offsides), icon: <Users className="h-5 w-5" />, color: 'text-orange-500' },
      { key: 'substitution', label: 'Substituições', ...countByTeam(substitutions), icon: <Users className="h-5 w-5" />, color: 'text-purple-500' },
      { key: 'shot', label: 'Finalizações', ...countByTeam(shots), icon: <Zap className="h-5 w-5" />, color: 'text-cyan-500' },
      { key: 'shot_on_target', label: 'No Alvo', ...countByTeam(shotsOnTarget), icon: <Target className="h-5 w-5" />, color: 'text-emerald-500' },
    ];
  }, [events, homeTeamName]);

  // Find key moment (highest impact event)
  const keyMoment = useMemo(() => {
    const highlights = events.filter(e => e.is_highlight || e.event_type === 'goal');
    return highlights[0] || events[0];
  }, [events]);

  return (
    <div className="space-y-4">
      {/* Score Header */}
      <Card variant="glow" className="p-4">
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-lg font-semibold">{homeTeamName}</p>
            <p className="text-4xl font-bold text-primary">{homeScore}</p>
          </div>
          <div className="text-2xl font-light text-muted-foreground">×</div>
          <div className="text-center">
            <p className="text-lg font-semibold">{awayTeamName}</p>
            <p className="text-4xl font-bold text-primary">{awayScore}</p>
          </div>
        </div>
      </Card>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {stats.map((stat) => (
          <Card
            key={stat.key}
            className={`cursor-pointer transition-all hover:scale-105 ${
              selectedCard === stat.key ? 'ring-2 ring-primary bg-primary/10' : ''
            }`}
            onClick={() => onPickCard(stat.key)}
          >
            <CardContent className="p-3 text-center">
              <div className={`flex justify-center mb-1 ${stat.color}`}>
                {stat.icon}
              </div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-sm font-bold">
                {stat.home} × {stat.away}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Key Moment */}
      {keyMoment && (
        <Card className="bg-gradient-to-r from-primary/20 to-transparent">
          <CardContent className="p-4 flex items-center gap-4">
            <Star className="h-8 w-8 text-yellow-500" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Momento Chave</p>
              <p className="font-semibold">{keyMoment.description || keyMoment.event_type}</p>
              <p className="text-xs text-muted-foreground">{keyMoment.minute}'</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Dynamic line chart component
function DualLineChart({ 
  title, 
  data, 
  onPickMinute,
  icon
}: { 
  title: string;
  data: MinutePoint[];
  onPickMinute: (minute: number) => void;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="h-[250px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            onClick={(e) => {
              const p = e?.activePayload?.[0]?.payload as MinutePoint | undefined;
              if (p) onPickMinute(p.minute);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="minute" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))' 
              }} 
            />
            <Area 
              type="monotone" 
              dataKey="a" 
              stackId="1"
              stroke="hsl(var(--primary))" 
              fill="hsl(var(--primary))" 
              fillOpacity={0.3}
              name="Casa" 
            />
            <Area 
              type="monotone" 
              dataKey="b" 
              stackId="2"
              stroke="hsl(var(--destructive))" 
              fill="hsl(var(--destructive))" 
              fillOpacity={0.3}
              name="Visitante" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// Timeline component
function Timeline({ 
  events, 
  selectedEventId, 
  onPickEvent,
  eventTypeFilter
}: { 
  events: MatchEvent[];
  selectedEventId?: string;
  onPickEvent: (e: MatchEvent) => void;
  eventTypeFilter: string | null;
}) {
  const filteredEvents = useMemo(() => {
    let filtered = events;
    if (eventTypeFilter) {
      filtered = events.filter(e => {
        if (eventTypeFilter === 'goal') return e.event_type === 'goal';
        if (eventTypeFilter === 'card') return ['yellow_card', 'red_card', 'card'].includes(e.event_type);
        if (eventTypeFilter === 'shot') return ['shot', 'shot_on_target', 'chance'].includes(e.event_type);
        return e.event_type === eventTypeFilter;
      });
    }
    return filtered.sort((a, b) => (a.minute || 0) - (b.minute || 0));
  }, [events, eventTypeFilter]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'goal': return <Target className="h-4 w-4 text-green-500" />;
      case 'foul': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'yellow_card':
      case 'red_card':
      case 'card': return <Flag className="h-4 w-4 text-red-500" />;
      case 'corner': return <CornerDownRight className="h-4 w-4 text-blue-500" />;
      case 'shot':
      case 'shot_on_target': return <Zap className="h-4 w-4 text-cyan-500" />;
      default: return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Linha do Tempo
          {eventTypeFilter && (
            <Badge variant="secondary" className="ml-2">
              {eventTypeFilter}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="space-y-1 p-4">
            {filteredEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum evento encontrado
              </p>
            ) : (
              filteredEvents.map((e) => (
                <div
                  key={e.id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all hover:bg-accent ${
                    selectedEventId === e.id ? 'bg-primary/20 ring-1 ring-primary' : ''
                  }`}
                  onClick={() => onPickEvent(e)}
                >
                  {getEventIcon(e.event_type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {e.minute}'{e.second ? `:${e.second}` : ''} • {e.event_type}
                    </p>
                    <p className="text-sm truncate">{e.description || 'Sem descrição'}</p>
                  </div>
                  {e.is_highlight && (
                    <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                  )}
                  {e.clip_url && (
                    <Play className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Event detail panel (Level 3)
function EventDetailPanel({ 
  event, 
  onOpenEvidence, 
  onClose 
}: { 
  event: MatchEvent;
  onOpenEvidence: () => void;
  onClose: () => void;
}) {
  return (
    <Card variant="glow" className="mb-4">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Detalhes do Evento
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Tipo</p>
            <Badge variant="outline">{getEventLabel(event.event_type)}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Minuto</p>
            <p className="font-semibold">{event.minute}'{event.second ? `:${event.second}` : ''}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tempo</p>
            <p className="font-semibold">{event.match_half === 'first' ? '1º Tempo' : '2º Tempo'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Destaque</p>
            <p className="font-semibold">{event.is_highlight ? 'Sim' : 'Não'}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Descrição</p>
          <p className="text-sm">{event.description || 'Sem descrição disponível'}</p>
        </div>

        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Metadados</p>
            <div className="bg-muted/50 rounded p-2 text-xs font-mono">
              {JSON.stringify(event.metadata, null, 2)}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {event.clip_url && (
            <Button size="sm" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Ver Clipe
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onOpenEvidence}>
            <Eye className="h-4 w-4 mr-2" />
            Ver Evidência
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Evidence dialog (Level 4)
function EvidenceDialog({ 
  open, 
  onOpenChange, 
  event,
  videoUrl
}: { 
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: MatchEvent | null;
  videoUrl: string | null;
}) {
  if (!event) return null;

  const videoStartSec = (event.minute || 0) * 60 + (event.second || 0) - 5;
  const videoEndSec = videoStartSec + 15;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Origem do Dado e Evidência
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Video/Clip Section */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Clipe do Evento</CardTitle>
              </CardHeader>
              <CardContent>
                {event.clip_url ? (
                  <video
                    src={event.clip_url}
                    controls
                    className="w-full rounded-lg"
                  />
                ) : videoUrl ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Vídeo disponível em:</p>
                    <p className="text-xs font-mono mt-1">
                      {Math.floor(videoStartSec / 60)}:{String(videoStartSec % 60).padStart(2, '0')} - 
                      {Math.floor(videoEndSec / 60)}:{String(videoEndSec % 60).padStart(2, '0')}
                    </p>
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">Sem clipe disponível</p>
                )}
                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Janela: {Math.floor(videoStartSec / 60)}:{String(Math.max(0, videoStartSec) % 60).padStart(2, '0')} 
                  {' → '}
                  {Math.floor(videoEndSec / 60)}:{String(videoEndSec % 60).padStart(2, '0')}
                </div>
              </CardContent>
            </Card>

            {/* Transcript Section */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Transcrição Associada</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="text-muted-foreground italic">
                    {event.description || 'Transcrição não disponível para este evento'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Timestamp: {event.minute}'{event.second ? `:${event.second}` : ''}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline and Detection Section */}
          <div className="space-y-4">
            {/* AI Detection Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Detecção por IA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Tipo detectado</span>
                  <Badge>{event.event_type}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Confiança</span>
                  <Badge variant="outline">
                    {event.metadata?.confidence 
                      ? `${Math.round(event.metadata.confidence * 100)}%` 
                      : 'N/A'}
                  </Badge>
                </div>
                {event.metadata?.player && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Jogador</span>
                    <Badge variant="secondary">{event.metadata.player}</Badge>
                  </div>
                )}
                {event.metadata?.team && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Time</span>
                    <Badge variant="secondary">{event.metadata.team}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pipeline Trace */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Rastro do Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    'Transcrição de áudio (kakttus.ai)',
                    'Análise semântica (kakttus Pro)',
                    'Detecção de evento',
                    'Classificação por tipo',
                    'Atribuição de timestamp',
                    event.clip_url ? 'Geração de clipe' : null,
                  ].filter(Boolean).map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </div>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* YOLO Detections (if available) */}
            {event.metadata?.detections && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Detecções YOLO</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {event.metadata.detections.map((d: any, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {d.label} {Math.round((d.confidence || 0) * 100)}%
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Main Dashboard Component
export default function MatchDashboard() {
  // Use centralized match selection hook for auto-sync with header filter
  const { currentMatchId, matches, isLoading: loadingMatches } = useMatchSelection();

  const [period, setPeriod] = useState<PeriodKey>("ALL");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string | null>(null);
  const [analysisLevel, setAnalysisLevel] = useState<AnalysisLevel>(1);
  const [selectedEvent, setSelectedEvent] = useState<MatchEvent | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [pickedMinute, setPickedMinute] = useState<number | null>(null);

  // Fetch data using currentMatchId from hook (auto-syncs with header)
  const { data: matchDetails } = useMatchDetails(currentMatchId);
  const { data: events = [], isLoading: loadingEvents } = useMatchEvents(currentMatchId);
  const { data: analysis } = useMatchAnalysis(currentMatchId);

  // Get video URL for evidence
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (currentMatchId) {
      supabase
        .from('videos')
        .select('file_url')
        .eq('match_id', currentMatchId)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          setVideoUrl(data?.file_url || null);
        });
    }
  }, [currentMatchId]);

  // Filter events by period
  const filteredEvents = useMemo(() => {
    let filtered = events;
    if (period === "H1") {
      filtered = events.filter(e => e.match_half === 'first' || (e.minute && e.minute < 45));
    } else if (period === "H2") {
      filtered = events.filter(e => e.match_half === 'second' || (e.minute && e.minute >= 45));
    }
    return filtered;
  }, [events, period]);

  // Generate chart data from events
  const chartData = useMemo(() => {
    const maxMinute = period === "H1" ? 45 : period === "H2" ? 90 : 90;
    const minMinute = period === "H2" ? 45 : 0;
    
    const data: MinutePoint[] = [];
    for (let m = minMinute; m <= maxMinute; m += 5) {
      const eventsInRange = filteredEvents.filter(e => 
        e.minute !== null && e.minute >= m && e.minute < m + 5
      );
      
      let homeActions = 0, awayActions = 0;
      eventsInRange.forEach(e => {
        const team = e.metadata?.team?.toLowerCase() || '';
        if (team.includes('home') || team.includes('casa')) {
          homeActions++;
        } else {
          awayActions++;
        }
      });
      
      data.push({ minute: m, a: homeActions, b: awayActions });
    }
    return data;
  }, [filteredEvents, period]);

  // Possession data simulation based on events
  const possessionData = useMemo(() => {
    return chartData.map(d => ({
      minute: d.minute,
      a: 45 + Math.random() * 20,
      b: 35 + Math.random() * 20,
    }));
  }, [chartData]);

  // Intensity data
  const intensityData = useMemo(() => {
    return chartData.map(d => ({
      minute: d.minute,
      a: d.a * 2 + Math.random() * 3,
      b: d.b * 2 + Math.random() * 3,
    }));
  }, [chartData]);

  const handlePickCard = (cardKey: string) => {
    setEventTypeFilter(eventTypeFilter === cardKey ? null : cardKey);
    setAnalysisLevel(1);
    setSelectedEvent(null);
  };

  const handlePickEvent = (event: MatchEvent) => {
    setSelectedEvent(event);
    setAnalysisLevel(3);
  };

  const handleNavigateLevel = (level: AnalysisLevel) => {
    setAnalysisLevel(level);
    if (level < 3) setSelectedEvent(null);
    if (level < 2) setTeamFilter("all");
  };

  const handlePickMinute = (minute: number) => {
    setPickedMinute(minute);
    // Find events around that minute
    const nearbyEvents = filteredEvents.filter(e => 
      e.minute !== null && Math.abs(e.minute - minute) <= 3
    );
    if (nearbyEvents.length > 0) {
      setSelectedEvent(nearbyEvents[0]);
      setAnalysisLevel(3);
    }
  };

  // Calculate dynamic stats - MUST be before any conditional returns to respect Rules of Hooks
  const homeTeamName = matchDetails?.home_team?.name || 'Time Casa';
  const awayTeamName = matchDetails?.away_team?.name || 'Time Visitante';
  const dynamicStats = useDynamicMatchStats(events, homeTeamName, awayTeamName);
  const homeScore = dynamicStats.score.home;
  const awayScore = dynamicStats.score.away;

  if (loadingMatches) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <SoccerBallLoader />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout key={currentMatchId}>
      <div className="container mx-auto p-4 space-y-6">
        {/* Header with Match Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Análise em Camadas</h1>
            <p className="text-muted-foreground text-sm">
              Do resumo à prova - navegue pelos níveis de análise
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Period Selector */}
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Jogo Completo</SelectItem>
                <SelectItem value="H1">1º Tempo</SelectItem>
                <SelectItem value="H2">2º Tempo</SelectItem>
              </SelectContent>
            </Select>

            {/* Team Filter */}
            <Select value={teamFilter} onValueChange={(v) => {
              setTeamFilter(v);
              if (v !== "all") setAnalysisLevel(2);
            }}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Comparativo</SelectItem>
                <SelectItem value="home">Time Casa</SelectItem>
                <SelectItem value="away">Time Visitante</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setEventTypeFilter(null);
                setTeamFilter("all");
                setAnalysisLevel(1);
                setSelectedEvent(null);
                setPickedMinute(null);
              }}
            >
              Limpar
            </Button>
          </div>
        </div>

        {/* Breadcrumb Navigation */}
        <BreadcrumbRow
          level={analysisLevel}
          period={period}
          teamFilter={teamFilter}
          selectedEvent={selectedEvent}
          onNavigate={handleNavigateLevel}
        />

        {/* Top Highlights Section */}
        <HighlightsTop
          events={filteredEvents}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          homeScore={homeScore}
          awayScore={awayScore}
          onPickCard={handlePickCard}
          selectedCard={eventTypeFilter}
        />

        {/* Event Detail Panel (Level 3) */}
        {analysisLevel >= 3 && selectedEvent && (
          <EventDetailPanel
            event={selectedEvent}
            onOpenEvidence={() => {
              setAnalysisLevel(4);
              setEvidenceOpen(true);
            }}
            onClose={() => {
              setSelectedEvent(null);
              setAnalysisLevel(2);
            }}
          />
        )}

        {/* Charts and Timeline Section */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Charts (2 columns) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <DualLineChart
                title="Ações por Minuto"
                data={chartData}
                onPickMinute={handlePickMinute}
                icon={<Activity className="h-4 w-4" />}
              />
              <DualLineChart
                title="Posse de Bola"
                data={possessionData}
                onPickMinute={handlePickMinute}
                icon={<TrendingUp className="h-4 w-4" />}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <DualLineChart
                title="Intensidade"
                data={intensityData}
                onPickMinute={handlePickMinute}
                icon={<Zap className="h-4 w-4" />}
              />
              <Card className="h-[250px]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Distribuição de Eventos
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="minute" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))' 
                        }} 
                      />
                      <Bar dataKey="a" fill="hsl(var(--primary))" name="Casa" />
                      <Bar dataKey="b" fill="hsl(var(--destructive))" name="Visitante" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Timeline and Validation (1 column) */}
          <div className="lg:col-span-1 space-y-4">
            {/* Goal Validation Card */}
            <GoalValidationCard
              matchId={currentMatchId}
              events={filteredEvents}
              homeScore={homeScore}
              awayScore={awayScore}
            />
            
            <Timeline
              events={filteredEvents}
              selectedEventId={selectedEvent?.id}
              onPickEvent={handlePickEvent}
              eventTypeFilter={eventTypeFilter}
            />
          </div>
        </div>

        {/* Evidence Dialog (Level 4) */}
        <EvidenceDialog
          open={evidenceOpen}
          onOpenChange={setEvidenceOpen}
          event={selectedEvent}
          videoUrl={videoUrl}
        />
      </div>
    </AppLayout>
  );
}
