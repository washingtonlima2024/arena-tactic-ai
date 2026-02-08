import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, Link as LinkIcon, FileVideo, X 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface HalfVideoData {
  file?: File;
  url?: string;
}

interface HalfVideoInputProps {
  label: string;
  halfType: 'first' | 'second' | 'full';
  color: 'blue' | 'orange' | 'green';
  value: HalfVideoData;
  onChange: (data: HalfVideoData) => void;
  disabled?: boolean;
  className?: string;
}

const colorMap = {
  blue: {
    border: 'border-blue-500/30 hover:border-blue-500/60',
    activeBorder: 'border-blue-500/60',
    bg: 'bg-blue-500/5',
    icon: 'text-blue-500',
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  orange: {
    border: 'border-orange-500/30 hover:border-orange-500/60',
    activeBorder: 'border-orange-500/60',
    bg: 'bg-orange-500/5',
    icon: 'text-orange-500',
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  green: {
    border: 'border-emerald-500/30 hover:border-emerald-500/60',
    activeBorder: 'border-emerald-500/60',
    bg: 'bg-emerald-500/5',
    icon: 'text-emerald-500',
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
};

export function HalfVideoInput({ 
  label, halfType, color, value, onChange, disabled, className 
}: HalfVideoInputProps) {
  const colors = colorMap[color];
  const hasValue = !!(value.file || value.url);
  const inputId = `half-video-${halfType}`;

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onChange({ file, url: undefined });
    }
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange({});
  }, [onChange]);

  if (hasValue) {
    return (
      <div className={cn(
        'rounded-lg border-2 p-3 transition-colors',
        colors.activeBorder, colors.bg,
        className
      )}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <Badge variant="outline" className={cn('text-xs', colors.badge)}>
            {label}
          </Badge>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-5 w-5" 
            onClick={handleClear}
            disabled={disabled}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <FileVideo className={cn('h-5 w-5 shrink-0', colors.icon)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {value.file?.name || value.url?.slice(0, 40)}
            </p>
            {value.file && (
              <p className="text-xs text-muted-foreground">
                {(value.file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Badge variant="outline" className={cn('text-xs', colors.badge)}>
        {label}
      </Badge>
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-8">
          <TabsTrigger value="upload" className="text-xs">Upload</TabsTrigger>
          <TabsTrigger value="link" className="text-xs">Link</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-2">
          <div className={cn(
            'border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer',
            colors.border, colors.bg
          )}>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
              id={inputId}
              disabled={disabled}
            />
            <label htmlFor={inputId} className="cursor-pointer">
              <Upload className={cn('h-6 w-6 mx-auto mb-1', colors.icon)} />
              <p className="text-xs text-muted-foreground">Selecionar vídeo</p>
            </label>
          </div>
        </TabsContent>

        <TabsContent value="link" className="mt-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                value={value.url || ''}
                onChange={(e) => onChange({ url: e.target.value, file: undefined })}
                placeholder="Cole o link do vídeo (YouTube, Instagram, Facebook...)"
                className="text-xs h-8"
                disabled={disabled}
              />
            </div>
            <p className="text-[10px] text-muted-foreground pl-6">
              YouTube, Instagram, Facebook, TikTok, Vimeo, Twitter/X, Twitch e mais
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
