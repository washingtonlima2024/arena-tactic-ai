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
import { Search, Filter, Plus, Calendar, Trophy, Loader2, Video, Trash2 } from 'lucide-react';
import { useMatches, Match } from '@/hooks/useMatches';
import { useDeleteMatch } from '@/hooks/useDeleteMatch';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TeamBadge } from '@/components/teams/TeamBadge';

export default function Matches() {
  const { data: matches = [], isLoading } = useMatches();
  const deleteMatch = useDeleteMatch();
  const [matchToDelete, setMatchToDelete] = useState<Match | null>(null);

  const completedMatches = matches.filter(m => m.status === 'completed').length;
  const analyzingMatches = matches.filter(m => m.status === 'analyzing').length;
  const pendingMatches = matches.filter(m => m.status === 'pending').length;

  const handleDeleteConfirm = () => {
    if (matchToDelete) {
      deleteMatch.mutate(matchToDelete.id);
      setMatchToDelete(null);
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
          <Button variant="arena" asChild>
            <Link to="/upload">
              <Plus className="mr-2 h-4 w-4" />
              Importar Partida
            </Link>
          </Button>
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
                        <Link to="/analysis">Ver Análise</Link>
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
      </div>
    </AppLayout>
  );
}
