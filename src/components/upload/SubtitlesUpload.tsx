import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Subtitles, Upload, X, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SubtitlesUploadProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  className?: string;
}

export function SubtitlesUpload({ file, onFileChange, className }: SubtitlesUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && isSubtitleFile(droppedFile.name)) {
      onFileChange(droppedFile);
    }
  }, [onFileChange]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onFileChange(selectedFile);
    }
    e.target.value = '';
  };

  const isSubtitleFile = (filename: string): boolean => {
    const ext = filename.toLowerCase().split('.').pop();
    return ext === 'srt' || ext === 'vtt';
  };

  return (
    <Card variant="glass" className={cn("border-border/30", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Subtitles className="h-4 w-4" />
          Legendas (Opcional)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {file ? (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm">{file.name}</span>
              <Badge variant="secondary" className="text-xs">
                {file.name.split('.').pop()?.toUpperCase()}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onFileChange(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative flex flex-col items-center justify-center py-4 px-4 rounded-lg border-2 border-dashed transition-all cursor-pointer",
              isDragging 
                ? "border-primary bg-primary/5" 
                : "border-border/50 hover:border-primary/50"
            )}
          >
            <Upload className="h-5 w-5 text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground text-center">
              Arraste arquivo SRT ou VTT
            </p>
            <input
              type="file"
              accept=".srt,.vtt"
              onChange={handleFileSelect}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2 text-center">
          As legendas serão exibidas durante a reprodução
        </p>
      </CardContent>
    </Card>
  );
}
