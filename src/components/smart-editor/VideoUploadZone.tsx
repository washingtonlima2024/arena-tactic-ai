import { useState, useCallback } from 'react';
import { Upload, Film, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface VideoUploadZoneProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadProgress: number;
  status: string;
}

export const VideoUploadZone = ({
  onUpload,
  isUploading,
  uploadProgress,
  status
}: VideoUploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/')) {
        onUpload(file);
      }
    }
  }, [onUpload]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUpload(files[0]);
    }
  };

  if (isUploading) {
    return (
      <div className="border-2 border-dashed border-arena-green/30 rounded-xl p-12 bg-card/50">
        <div className="flex flex-col items-center gap-6">
          <Loader2 className="w-12 h-12 text-arena-green animate-spin" />
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">{status}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {uploadProgress}% concluído
            </p>
          </div>
          <Progress value={uploadProgress} className="w-full max-w-md h-2" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-12 transition-all cursor-pointer ${
        isDragging 
          ? 'border-arena-green bg-arena-green/10 scale-[1.02]' 
          : 'border-border hover:border-arena-green/50 bg-card/30 hover:bg-card/50'
      }`}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => document.getElementById('video-input')?.click()}
    >
      <input
        id="video-input"
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      
      <div className="flex flex-col items-center gap-4">
        <div className={`p-4 rounded-full transition-colors ${
          isDragging ? 'bg-arena-green/20' : 'bg-muted'
        }`}>
          {isDragging ? (
            <Film className="w-10 h-10 text-arena-green" />
          ) : (
            <Upload className="w-10 h-10 text-muted-foreground" />
          )}
        </div>
        
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">
            {isDragging ? 'Solte o vídeo aqui' : 'Arraste seu vídeo ou clique para selecionar'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Suporta MP4, MOV, AVI, MKV até 2GB
          </p>
        </div>
      </div>
    </div>
  );
};

export default VideoUploadZone;
