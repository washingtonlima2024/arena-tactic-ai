import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DeviceMockup } from './DeviceMockup';
import { 
  X, 
  Smartphone, 
  Tablet, 
  Monitor,
  RectangleVertical,
  Square,
  RectangleHorizontal,
  Download,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

type DeviceFormat = '9:16' | '16:9' | '1:1' | '4:5';
type DeviceType = 'phone' | 'tablet' | 'desktop';

interface ClipPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  clipUrl: string | null;
  clipTitle: string;
  clipType: string;
  timestamp: string;
  matchHalf?: string;
  posterUrl?: string;
}

const formatConfigs = [
  { id: '9:16' as DeviceFormat, label: 'Stories/Reels', icon: RectangleVertical, platforms: ['Instagram Stories', 'TikTok', 'YouTube Shorts'] },
  { id: '16:9' as DeviceFormat, label: 'YouTube/TV', icon: RectangleHorizontal, platforms: ['YouTube', 'Twitter/X', 'LinkedIn'] },
  { id: '1:1' as DeviceFormat, label: 'Feed Quadrado', icon: Square, platforms: ['Instagram Feed', 'Facebook'] },
  { id: '4:5' as DeviceFormat, label: 'Feed Vertical', icon: RectangleVertical, platforms: ['Instagram Feed', 'Facebook'] },
];

const deviceConfigs = [
  { id: 'phone' as DeviceType, label: 'Celular', icon: Smartphone },
  { id: 'tablet' as DeviceType, label: 'Tablet', icon: Tablet },
  { id: 'desktop' as DeviceType, label: 'Desktop', icon: Monitor },
];

export function ClipPreviewModal({
  isOpen,
  onClose,
  clipUrl,
  clipTitle,
  clipType,
  timestamp,
  matchHalf,
  posterUrl,
}: ClipPreviewModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<DeviceFormat>('9:16');
  const [selectedDevice, setSelectedDevice] = useState<DeviceType>('phone');
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFormat('9:16');
      setSelectedDevice('phone');
      setIsMuted(true);
    }
  }, [isOpen]);

  // Update video muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handleDownload = async () => {
    if (!clipUrl) return;
    
    try {
      const response = await fetch(clipUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clipTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedFormat.replace(':', 'x')}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading clip:', error);
    }
  };

  // Get device size based on format
  const getDeviceSize = (): 'sm' | 'md' | 'lg' => {
    if (selectedDevice === 'desktop') return 'md';
    return 'lg';
  };

  // Get aspect ratio style for video container
  const getAspectRatioStyle = () => {
    switch (selectedFormat) {
      case '9:16': return { aspectRatio: '9/16' };
      case '16:9': return { aspectRatio: '16/9' };
      case '1:1': return { aspectRatio: '1/1' };
      case '4:5': return { aspectRatio: '4/5' };
      default: return { aspectRatio: '9/16' };
    }
  };

  const currentFormatConfig = formatConfigs.find(f => f.id === selectedFormat);

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent 
        className="max-w-[95vw] w-full max-h-[95vh] h-full p-0 gap-0 bg-background/95 backdrop-blur-xl border-border/50"
        hideCloseButton
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="font-semibold text-lg">{clipTitle}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="arena">{clipType}</Badge>
                  <Badge variant="outline" className="font-mono">{timestamp}</Badge>
                  {matchHalf && (
                    <Badge variant="outline">
                      {matchHalf === 'first_half' || matchHalf === 'first' ? '1º Tempo' : '2º Tempo'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Sidebar - Format & Device Selection */}
            <div className="lg:w-64 p-4 border-b lg:border-b-0 lg:border-r border-border/50 space-y-6 overflow-y-auto">
              {/* Format Selection */}
              <div>
                <h3 className="text-sm font-medium mb-3">Formato</h3>
                <div className="grid grid-cols-4 lg:grid-cols-2 gap-2">
                  {formatConfigs.map((format) => (
                    <Button
                      key={format.id}
                      variant={selectedFormat === format.id ? 'arena' : 'outline'}
                      size="sm"
                      className="flex flex-col h-auto py-3 gap-1"
                      onClick={() => setSelectedFormat(format.id)}
                    >
                      <format.icon className="h-5 w-5" />
                      <span className="text-xs">{format.id}</span>
                    </Button>
                  ))}
                </div>
                {currentFormatConfig && (
                  <div className="mt-3 p-3 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium">{currentFormatConfig.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {currentFormatConfig.platforms.join(', ')}
                    </p>
                  </div>
                )}
              </div>

              {/* Device Selection */}
              <div>
                <h3 className="text-sm font-medium mb-3">Dispositivo</h3>
                <div className="flex lg:flex-col gap-2">
                  {deviceConfigs.map((device) => (
                    <Button
                      key={device.id}
                      variant={selectedDevice === device.id ? 'secondary' : 'ghost'}
                      size="sm"
                      className="flex-1 lg:flex-none justify-start gap-2"
                      onClick={() => setSelectedDevice(device.id)}
                    >
                      <device.icon className="h-4 w-4" />
                      <span>{device.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setIsMuted(!isMuted)}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  {isMuted ? 'Ativar Som' : 'Silenciar'}
                </Button>
                <Button
                  variant="arena"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={handleDownload}
                  disabled={!clipUrl}
                >
                  <Download className="h-4 w-4" />
                  Baixar Clip
                </Button>
              </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 flex items-center justify-center p-4 lg:p-8 overflow-auto bg-gradient-to-br from-muted/20 to-muted/5">
              <DeviceMockup 
                format={selectedFormat} 
                size={getDeviceSize()}
                allowRotation={selectedFormat === '9:16' || selectedFormat === '4:5'}
              >
                <div className="relative w-full h-full bg-black">
                  {clipUrl ? (
                    <video
                      ref={videoRef}
                      src={clipUrl}
                      poster={posterUrl}
                      className={cn(
                        "absolute inset-0 w-full h-full",
                        selectedFormat === '9:16' || selectedFormat === '4:5' 
                          ? "object-cover" 
                          : "object-contain"
                      )}
                      autoPlay
                      loop
                      muted={isMuted}
                      playsInline
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      <p className="text-sm">Clip não disponível</p>
                    </div>
                  )}
                  
                  {/* Format indicator overlay */}
                  <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none">
                    <Badge 
                      variant="arena" 
                      className="text-xs backdrop-blur bg-primary/80"
                    >
                      {selectedFormat}
                    </Badge>
                  </div>
                </div>
              </DeviceMockup>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
