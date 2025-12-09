import { Play, Film, Sparkles } from 'lucide-react';
import { SmartClip } from './ClipsList';
import { CSSVignette, VignetteType } from './CSSVignette';
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface TimelineItem {
  type: 'vignette' | 'clip';
  vignetteType?: VignetteType;
  text?: string;
  clip?: SmartClip;
  duration: number;
}

interface VideoTimelineProps {
  clips: SmartClip[];
  settings: {
    channelName: string;
    openingText: string;
    transitionText: string;
    closingText: string;
  };
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const VideoTimeline = ({ clips, settings }: VideoTimelineProps) => {
  const [previewVignette, setPreviewVignette] = useState<{
    type: VignetteType;
    text: string;
  } | null>(null);

  const enabledClips = clips.filter(c => c.is_enabled);

  // Build timeline
  const timeline: TimelineItem[] = [];
  
  // Opening vignette
  timeline.push({
    type: 'vignette',
    vignetteType: 'opening',
    text: settings.openingText,
    duration: 3
  });

  // Clips with transitions
  enabledClips.forEach((clip, index) => {
    timeline.push({
      type: 'clip',
      clip,
      duration: clip.end_second - clip.start_second
    });

    // Add transition between clips (not after last)
    if (index < enabledClips.length - 1) {
      timeline.push({
        type: 'vignette',
        vignetteType: 'transition',
        text: settings.transitionText,
        duration: 2
      });
    }
  });

  // Closing vignette
  if (enabledClips.length > 0) {
    timeline.push({
      type: 'vignette',
      vignetteType: 'closing',
      text: settings.closingText,
      duration: 3
    });
  }

  const totalDuration = timeline.reduce((sum, item) => sum + item.duration, 0);

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            Linha do Tempo
          </h3>
          <span className="text-sm text-muted-foreground">
            Duração total: {formatTime(totalDuration)}
          </span>
        </div>

        {/* Timeline Visualization */}
        <div className="relative">
          {/* Timeline Bar */}
          <div className="flex gap-1 h-16 rounded-lg overflow-hidden border border-border">
            {timeline.map((item, index) => {
              const widthPercent = (item.duration / totalDuration) * 100;
              const minWidth = Math.max(widthPercent, 5); // Minimum 5% for visibility

              return (
                <div
                  key={index}
                  className={`relative flex items-center justify-center cursor-pointer transition-all hover:brightness-110 ${
                    item.type === 'vignette'
                      ? item.vignetteType === 'opening'
                        ? 'bg-gradient-to-r from-arena-green to-emerald-600'
                        : item.vignetteType === 'closing'
                        ? 'bg-gradient-to-r from-cyan-600 to-arena-green'
                        : 'bg-gradient-to-r from-slate-700 to-slate-600'
                      : 'bg-gradient-to-r from-blue-600 to-blue-500'
                  }`}
                  style={{ width: `${minWidth}%` }}
                  onClick={() => {
                    if (item.type === 'vignette' && item.vignetteType && item.text) {
                      setPreviewVignette({
                        type: item.vignetteType,
                        text: item.text
                      });
                    }
                  }}
                >
                  {item.type === 'vignette' ? (
                    <Sparkles className="w-4 h-4 text-white/80" />
                  ) : (
                    <Film className="w-4 h-4 text-white/80" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Timeline Items List */}
          <div className="mt-4 space-y-2">
            {timeline.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xs text-muted-foreground font-mono w-6">
                  {index + 1}
                </span>
                
                <div className={`p-1.5 rounded ${
                  item.type === 'vignette' 
                    ? 'bg-arena-green/20 text-arena-green' 
                    : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {item.type === 'vignette' ? (
                    <Sparkles className="w-3 h-3" />
                  ) : (
                    <Film className="w-3 h-3" />
                  )}
                </div>

                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.type === 'vignette' 
                      ? `Vinheta: ${item.text}`
                      : item.clip?.title || 'Clip'
                    }
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.type === 'vignette'
                      ? item.vignetteType === 'opening' 
                        ? 'Abertura' 
                        : item.vignetteType === 'closing' 
                        ? 'Encerramento' 
                        : 'Transição'
                      : `${formatTime(item.clip?.start_second || 0)} - ${formatTime(item.clip?.end_second || 0)}`
                    }
                  </p>
                </div>

                <span className="text-xs text-muted-foreground">
                  {formatTime(item.duration)}
                </span>

                {item.type === 'vignette' && (
                  <button
                    onClick={() => {
                      if (item.vignetteType && item.text) {
                        setPreviewVignette({
                          type: item.vignetteType,
                          text: item.text
                        });
                      }
                    }}
                    className="p-1.5 rounded hover:bg-arena-green/20 text-muted-foreground hover:text-arena-green transition-colors"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {enabledClips.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
            <p>Selecione clips para montar a linha do tempo</p>
          </div>
        )}
      </div>

      {/* Vignette Preview Modal */}
      <Dialog open={!!previewVignette} onOpenChange={() => setPreviewVignette(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-transparent border-none">
          {previewVignette && (
            <CSSVignette
              type={previewVignette.type}
              text={previewVignette.text}
              channelName={settings.channelName}
              duration={3}
              onComplete={() => setPreviewVignette(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VideoTimeline;
