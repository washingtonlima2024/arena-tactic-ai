import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Image, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { toast } from 'sonner';
import type { Team, TeamInsert, TeamUpdate } from '@/hooks/useTeams';

interface TeamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team?: Team | null;
  onSubmit: (data: TeamInsert | TeamUpdate) => void;
  isLoading?: boolean;
}

export function TeamFormDialog({ 
  open, 
  onOpenChange, 
  team, 
  onSubmit, 
  isLoading 
}: TeamFormDialogProps) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#10b981');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');
  const [logoUrl, setLogoUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (team) {
      setName(team.name);
      setShortName(team.short_name || '');
      setPrimaryColor(team.primary_color || '#10b981');
      setSecondaryColor(team.secondary_color || '#ffffff');
      setLogoUrl(team.logo_url || '');
    } else {
      setName('');
      setShortName('');
      setPrimaryColor('#10b981');
      setSecondaryColor('#ffffff');
      setLogoUrl('');
    }
  }, [team, open]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione um arquivo de imagem');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB');
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to local server (use 'general' as matchId for team logos)
      const uploadResult = await apiClient.uploadBlob(
        'teams',
        'logos',
        file,
        fileName
      );

      if (!uploadResult?.url) {
        throw new Error('Falha no upload');
      }

      setLogoUrl(uploadResult.url);
      toast.success('Logo carregada com sucesso!');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Erro ao fazer upload da logo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      name,
      short_name: shortName || null,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      logo_url: logoUrl || null,
    };

    if (team) {
      onSubmit({ ...data, id: team.id });
    } else {
      onSubmit(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display">
            {team ? 'Editar Time' : 'Novo Time'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Time *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Flamengo"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shortName">Nome Abreviado</Label>
            <Input
              id="shortName"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="Ex: FLA"
              maxLength={5}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Cor Principal</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  id="primaryColor"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-14 rounded border border-border cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#10b981"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondaryColor">Cor Secundária</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  id="secondaryColor"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-10 w-14 rounded border border-border cursor-pointer"
                />
                <Input
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  placeholder="#ffffff"
                />
              </div>
            </div>
          </div>

          {/* Logo Upload Section */}
          <div className="space-y-2">
            <Label>Logo do Time</Label>
            <div className="flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload de Imagem
                  </>
                )}
              </Button>
              
              {logoUrl && (
                <div className="h-10 w-10 rounded border border-border overflow-hidden bg-muted flex items-center justify-center">
                  <img 
                    src={logoUrl} 
                    alt="Logo preview" 
                    className="h-8 w-8 object-contain"
                  />
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Image className="h-3 w-3" />
              <span>ou cole uma URL:</span>
            </div>
            <Input
              id="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://exemplo.com/logo.png"
              type="url"
            />
          </div>

          {/* Preview */}
          {(logoUrl || primaryColor) && (
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <div 
                className="h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold overflow-hidden"
                style={{ 
                  backgroundColor: primaryColor,
                  color: secondaryColor
                }}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt={name} className="h-10 w-10 object-contain" />
                ) : (
                  shortName?.slice(0, 2) || name?.slice(0, 2)
                )}
              </div>
              <div>
                <p className="font-medium">{name || 'Nome do Time'}</p>
                <p className="text-sm text-muted-foreground">{shortName || 'ABR'}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              variant="arena" 
              disabled={isLoading || !name || isUploading}
            >
              {isLoading ? 'Salvando...' : (team ? 'Salvar' : 'Criar Time')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
