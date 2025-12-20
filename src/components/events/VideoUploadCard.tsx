import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Upload, 
  Video, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Film,
  LinkIcon
} from 'lucide-react';

interface VideoUploadCardProps {
  matchId: string;
  onVideoUploaded: (videoUrl: string, videoId: string) => void;
  eventsCount?: number;
}

export function VideoUploadCard({ matchId, onVideoUploaded, eventsCount = 0 }: VideoUploadCardProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (!validTypes.includes(file.type)) {
      toast.error('Formato inválido. Use MP4, WebM ou MOV.');
      return;
    }

    // Validate file size (max 2GB)
    const maxSize = 2 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande. Máximo 2GB.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Get video duration
      const duration = await getVideoDuration(file);
      const durationMinutes = Math.ceil(duration / 60);
      
      setUploadProgress(20);

      // Upload to Supabase Storage
      const extension = file.name.split('.').pop() || 'mp4';
      const filePath = `manual-${matchId}-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('match-videos')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: true
        });

      if (uploadError) {
        throw uploadError;
      }

      setUploadProgress(70);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('match-videos')
        .getPublicUrl(filePath);

      const videoUrl = urlData.publicUrl;

      // Create video record in database
      const { data: videoRecord, error: insertError } = await supabase
        .from('videos')
        .insert({
          match_id: matchId,
          file_url: videoUrl,
          file_name: file.name,
          video_type: 'full',
          start_minute: 0,
          end_minute: durationMinutes,
          duration_seconds: Math.floor(duration),
          status: 'complete'
        })
        .select('id')
        .single();

      if (insertError) {
        throw insertError;
      }

      setUploadProgress(85);

      // Link all events to this video
      if (videoRecord?.id) {
        await supabase
          .from('match_events')
          .update({ video_id: videoRecord.id })
          .eq('match_id', matchId)
          .is('video_id', null);

        // Update events metadata with calculated videoSecond
        const { data: events } = await supabase
          .from('match_events')
          .select('id, minute, second, metadata')
          .eq('match_id', matchId);

        if (events) {
          for (const event of events) {
            const eventMinute = event.minute || 0;
            const eventSecond = event.second || 0;
            const videoSecond = eventMinute * 60 + eventSecond;
            
            await supabase
              .from('match_events')
              .update({
                metadata: {
                  ...(event.metadata as object || {}),
                  videoSecond,
                  eventMs: videoSecond * 1000
                }
              })
              .eq('id', event.id);
          }
        }
      }

      setUploadProgress(100);

      toast.success('Vídeo enviado com sucesso!', {
        description: `${eventsCount} eventos vinculados ao vídeo`
      });

      onVideoUploaded(videoUrl, videoRecord?.id || '');

    } catch (error) {
      console.error('Error uploading video:', error);
      toast.error('Erro ao enviar vídeo', {
        description: error instanceof Error ? error.message : 'Tente novamente'
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      
      video.onerror = () => {
        reject(new Error('Could not load video metadata'));
      };
      
      video.src = URL.createObjectURL(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <Card 
      variant="glass" 
      className={`border-2 border-dashed transition-colors ${
        isDragging 
          ? 'border-primary bg-primary/5' 
          : 'border-yellow-500/50 bg-yellow-500/5'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="h-5 w-5" />
          Nenhum vídeo vinculado
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isUploading ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div className="flex-1">
                <p className="font-medium">Enviando vídeo...</p>
                <p className="text-sm text-muted-foreground">
                  {uploadProgress < 70 
                    ? 'Fazendo upload do arquivo' 
                    : uploadProgress < 90 
                    ? 'Vinculando eventos ao vídeo'
                    : 'Finalizando...'}
                </p>
              </div>
              <Badge variant="outline">{uploadProgress}%</Badge>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        ) : (
          <div className="text-center py-4">
            <Video className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">
              Esta partida possui <strong>{eventsCount} eventos</strong> detectados, mas nenhum vídeo associado.
              <br />
              Faça upload do vídeo da partida para habilitar a visualização e geração de clips.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button 
                variant="arena"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Fazer Upload do Vídeo
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>
            
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Film className="h-3 w-3" />
                MP4, WebM, MOV
              </span>
              <span className="flex items-center gap-1">
                <LinkIcon className="h-3 w-3" />
                Máx. 2GB
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
