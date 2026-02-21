// BatchExportPanel — UI for the batch export queue (backend FFmpeg render)
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Play, Pause, X, RotateCcw, Download, Archive,
  CheckCircle2, XCircle, Loader2, Clock, 
  Layers, Trash2, Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBatchExport, ExportJob, PRESET_LABEL, PRESET_BITRATE } from '@/hooks/useBatchExport';
import { normalizeStorageUrl } from '@/lib/apiClient';
import { toast } from 'sonner';
import { CLIP_BUFFER_BEFORE_MS, CLIP_BUFFER_AFTER_MS } from '@/hooks/useClipGeneration';

const FORMAT_LABELS: Record<string, string> = {
  '9:16': 'Stories (9:16)',
  '16:9': 'Wide (16:9)',
  '1:1':  'Quadrado (1:1)',
  '4:5':  'Feed (4:5)',
};

const STATUS_CONFIG: Record<ExportJob['status'], { label: string; color: string; icon: React.ElementType }> = {
  queued:    { label: 'Na fila',    color: 'text-muted-foreground', icon: Clock },
  running:   { label: 'Exportando', color: 'text-primary',          icon: Loader2 },
  completed: { label: 'Concluído',  color: 'text-success',          icon: CheckCircle2 },
  failed:    { label: 'Falhou',     color: 'text-destructive',      icon: XCircle },
  paused:    { label: 'Pausado',    color: 'text-warning',          icon: Pause },
  cancelled: { label: 'Cancelado',  color: 'text-muted-foreground', icon: X },
};

const ALL_FORMATS: Array<'9:16' | '16:9' | '1:1' | '4:5'> = ['9:16', '16:9', '1:1', '4:5'];
const ALL_PRESETS: Array<ExportJob['preset']> = ['best', 'high', 'medium'];

interface Clip {
  id: string;
  title: string;
  type: string;
  minute: number;
  second?: number;
  description?: string;
  thumbnail?: string;
  clipUrl?: string | null;
  totalSeconds?: number;
  videoSecond?: number;
  eventVideo?: { start_minute?: number } | null;
}

interface BatchExportPanelProps {
  clips: Clip[];
  selectedClipIds: Set<string>;
  includeVignettes: boolean;
  includeSubtitles: boolean;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  matchId?: string;
  loadSrtLines: () => Promise<{ start: number; end: number; text: string }[]>;
}

export function BatchExportPanel({
  clips,
  selectedClipIds,
  includeVignettes,
  includeSubtitles,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  matchId,
  loadSrtLines,
}: BatchExportPanelProps) {
  const batch = useBatchExport();

  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(new Set(['9:16']));
  const [selectedPresets, setSelectedPresets] = useState<Set<ExportJob['preset']>>(new Set(['best']));
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);

  const selectedClips = clips.filter(c => selectedClipIds.has(c.id));

  const toggleFormat = (f: string) => {
    setSelectedFormats(prev => {
      const s = new Set(prev);
      s.has(f) ? s.delete(f) : s.add(f);
      return s;
    });
  };

  const togglePreset = (p: ExportJob['preset']) => {
    setSelectedPresets(prev => {
      const s = new Set(prev);
      s.has(p) ? s.delete(p) : s.add(p);
      return s;
    });
  };

  const totalJobs = selectedFormats.size * selectedPresets.size;

  // Build backend render clips from selected clips + SRT lines
  const buildRenderClips = useCallback((clipsIn: Clip[], srtLines: { start: number; end: number; text: string }[]) => {
    return clipsIn
      .filter(c => c.clipUrl)
      .map(c => {
        const bufferBefore = CLIP_BUFFER_BEFORE_MS / 1000;
        const eventSec = c.videoSecond ?? c.totalSeconds ?? (c.minute * 60 + (c.second ?? 0));
        const videoStartMinute = c.eventVideo?.start_minute ?? 0;
        const eventSecInVideoFile = eventSec - (videoStartMinute * 60);
        const clipStartInVideo = Math.max(0, eventSecInVideoFile - bufferBefore);
        const clipEndInVideo = eventSecInVideoFile + CLIP_BUFFER_AFTER_MS / 1000;
        console.log(`[BatchExport] clip=${c.id} eventSec=${eventSec} videoStart=${videoStartMinute}min offsetSec=${eventSecInVideoFile} window=[${clipStartInVideo.toFixed(1)},${clipEndInVideo.toFixed(1)}] srtMatches=${srtLines.filter(l => l.end >= clipStartInVideo && l.start <= clipEndInVideo).length}`);
        const subtitleLines = srtLines.length > 0
          ? srtLines
              .filter(line => line.end >= clipStartInVideo && line.start <= clipEndInVideo)
              .map(line => ({
                start: Math.max(0, line.start - clipStartInVideo),
                end: Math.max(0, line.end - clipStartInVideo),
                text: line.text,
              }))
          : undefined;
        return {
          id: c.id,
          clipUrl: normalizeStorageUrl(c.clipUrl!) || c.clipUrl!,
          eventType: c.type,
          minute: c.minute,
          description: c.description,
          thumbnailUrl: c.thumbnail ? (normalizeStorageUrl(c.thumbnail) || c.thumbnail) : undefined,
          subtitleLines,
        };
      });
  }, []);

  const handleAddToQueue = useCallback(async () => {
    if (selectedClips.length === 0 || selectedFormats.size === 0 || selectedPresets.size === 0) {
      toast.error('Selecione pelo menos um formato e um preset');
      return;
    }
    setIsLoadingQueue(true);
    try {
      const srtLines = includeSubtitles ? await loadSrtLines() : [];
      const renderClips = buildRenderClips(selectedClips, srtLines);

      const jobsToAdd: Parameters<typeof batch.addJobs>[0] = [];

      for (const format of ALL_FORMATS.filter(f => selectedFormats.has(f))) {
        for (const preset of ALL_PRESETS.filter(p => selectedPresets.has(p))) {
          const label = `${FORMAT_LABELS[format]} · ${PRESET_LABEL[preset]} · ${selectedClips.length} clips`;
          const filename = [
            homeTeam.replace(/\s+/g, '_'),
            'vs',
            awayTeam.replace(/\s+/g, '_'),
            format.replace(':', 'x'),
            preset,
            `${selectedClips.length}clips`,
          ].join('_') + '.mp4';

          jobsToAdd.push({
            id: `${format}_${preset}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            label,
            format,
            preset,
            filename,
            renderSpec: {
              matchId: matchId ?? '',
              format,
              preset,
              includeVignettes,
              includeSubtitles,
              matchInfo: { homeTeam, awayTeam, homeScore, awayScore },
              clips: renderClips,
            },
          });
        }
      }

      batch.addJobs(jobsToAdd);
      toast.success(`${jobsToAdd.length} job(s) adicionados à fila`);
    } catch (err) {
      toast.error('Erro ao preparar jobs');
      console.error('[BatchExport] addToQueue error:', err);
    } finally {
      setIsLoadingQueue(false);
    }
  }, [selectedClips, selectedFormats, selectedPresets, includeSubtitles, includeVignettes, homeTeam, awayTeam, homeScore, awayScore, matchId, batch, buildRenderClips, loadSrtLines]);

  const handleExportAll = useCallback(async () => {
    await batch.processQueue();
  }, [batch]);

  const completedJobs = batch.jobs.filter(j => j.status === 'completed' && j.downloadUrl);
  const pendingCount = batch.stats.queued + batch.stats.paused;

  return (
    <div className="space-y-4">
      {/* Job builder card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Configurar Lote de Exportação</span>
            <Badge variant="secondary" className="text-xs ml-auto">{selectedClips.length} clips</Badge>
          </div>

          {/* Format selector */}
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Formatos</p>
            <div className="flex flex-wrap gap-2">
              {ALL_FORMATS.map(f => (
                <button
                  key={f}
                  onClick={() => toggleFormat(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                    selectedFormats.has(f)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Preset selector */}
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Qualidade</p>
            <div className="flex flex-wrap gap-2">
              {ALL_PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => togglePreset(p)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                    selectedPresets.has(p)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {PRESET_LABEL[p]}
                  <span className="ml-1 opacity-60">({(PRESET_BITRATE[p] / 1_000_000).toFixed(0)} Mbps)</span>
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          {totalJobs > 0 && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              <span className="font-semibold text-foreground">{totalJobs} job(s)</span> serão criados
              ({selectedFormats.size} {selectedFormats.size === 1 ? 'formato' : 'formatos'} x {selectedPresets.size} {selectedPresets.size === 1 ? 'preset' : 'presets'})
            </p>
          )}

          <Button
            variant="arena"
            size="sm"
            onClick={handleAddToQueue}
            disabled={selectedClips.length === 0 || selectedFormats.size === 0 || selectedPresets.size === 0 || isLoadingQueue}
            className="w-full"
          >
            {isLoadingQueue ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Adicionar à Fila ({totalJobs} job{totalJobs !== 1 ? 's' : ''})
          </Button>
        </CardContent>
      </Card>

      {/* Queue */}
      {batch.jobs.length > 0 && (
        <>
          {/* Stats row */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {batch.stats.queued > 0 && (
                <Badge variant="secondary" className="text-xs">{batch.stats.queued} na fila</Badge>
              )}
              {batch.stats.running > 0 && (
                <Badge variant="arena" className="text-xs">{batch.stats.running} exportando</Badge>
              )}
              {batch.stats.completed > 0 && (
                <Badge className="text-xs bg-success/20 text-success border-success/30">{batch.stats.completed} concluídos</Badge>
              )}
              {batch.stats.failed > 0 && (
                <Badge variant="destructive" className="text-xs">{batch.stats.failed} falharam</Badge>
              )}
              {batch.stats.paused > 0 && (
                <Badge className="text-xs bg-warning/20 text-warning border-warning/30">{batch.stats.paused} pausados</Badge>
              )}
            </div>
            {(batch.stats.completed > 0 || batch.stats.failed > 0 || batch.stats.cancelled > 0) && (
              <Button variant="ghost" size="sm" onClick={batch.clearFinished} className="h-7 text-xs px-2 text-muted-foreground">
                <Trash2 className="h-3 w-3 mr-1" />
                Limpar concluídos
              </Button>
            )}
          </div>

          {/* Job list */}
          <ScrollArea className="h-[260px] rounded-lg border bg-muted/20">
            <div className="p-2 space-y-1.5">
              {batch.jobs.map(job => {
                const cfg = STATUS_CONFIG[job.status];
                const Icon = cfg.icon;
                return (
                  <div
                    key={job.id}
                    className={cn(
                      "p-3 rounded-lg border transition-all",
                      job.status === 'running'   && "border-primary/40 bg-primary/5",
                      job.status === 'completed' && "border-success/30 bg-success/5",
                      job.status === 'failed'    && "border-destructive/30 bg-destructive/5",
                      job.status === 'queued'    && "border-border/60",
                      job.status === 'paused'    && "border-warning/30 bg-warning/5",
                      job.status === 'cancelled' && "border-border/30 opacity-50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", cfg.color, job.status === 'running' && "animate-spin")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate leading-tight">{job.label}</p>
                        <p className={cn("text-[11px] mt-0.5 leading-tight", cfg.color)}>
                          {job.status === 'running' ? job.message : cfg.label}
                          {job.status === 'failed' && job.error && (
                            <span className="block text-destructive/80 mt-0.5 truncate">{job.error}</span>
                          )}
                        </p>
                        {job.status === 'running' && job.progress > 0 && (
                          <Progress value={job.progress} className="h-1 mt-1.5" />
                        )}
                        {job.status === 'completed' && job.completedAt && job.startedAt && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {Math.round((job.completedAt - job.startedAt) / 1000)}s de renderização
                          </p>
                        )}
                      </div>

                      {/* Per-job actions */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {job.status === 'completed' && (
                          <button
                            onClick={() => batch.downloadJob(job)}
                            title="Baixar este job"
                            className="p-1 rounded hover:bg-success/20 text-success transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(job.status === 'running' || job.status === 'queued') && (
                          <button
                            onClick={() => batch.pauseJob(job.id)}
                            title="Pausar"
                            className="p-1 rounded hover:bg-warning/20 text-warning transition-colors"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(job.status === 'paused' || job.status === 'failed' || job.status === 'cancelled') && (
                          <button
                            onClick={() => batch.retryJob(job.id)}
                            title="Colocar na fila novamente"
                            className="p-1 rounded hover:bg-primary/20 text-primary transition-colors"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(job.status === 'queued' || job.status === 'running') && (
                          <button
                            onClick={() => batch.cancelJob(job.id)}
                            title="Cancelar"
                            className="p-1 rounded hover:bg-destructive/20 text-destructive transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') && (
                          <button
                            onClick={() => batch.removeJob(job.id)}
                            title="Remover da lista"
                            className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Queue actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="arena"
              onClick={handleExportAll}
              disabled={pendingCount === 0 || batch.stats.running > 0}
              className="flex-1"
            >
              {batch.stats.running > 0 ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {batch.stats.running > 0 ? 'Exportando...' : `Exportar Tudo (${pendingCount})`}
            </Button>
            {completedJobs.length >= 2 && (
              <Button variant="outline" onClick={batch.downloadAllAsZip}>
                <Archive className="mr-2 h-4 w-4" />
                .zip
              </Button>
            )}
          </div>
        </>
      )}

      {batch.jobs.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8 border-2 border-dashed rounded-lg">
          <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="font-medium">Fila vazia</p>
          <p className="text-xs mt-1 opacity-70">Configure formatos e qualidade acima, então clique em <strong>Adicionar à Fila</strong>.</p>
        </div>
      )}
    </div>
  );
}
