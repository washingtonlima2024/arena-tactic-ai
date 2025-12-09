import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Settings2 } from 'lucide-react';

export interface SmartEditorSettings {
  channelName: string;
  openingText: string;
  transitionText: string;
  closingText: string;
  language: string;
  minClipDuration: number;
  maxClipDuration: number;
  maxClips: number;
  cutIntensity: 'basic' | 'medium' | 'detailed';
}

interface VignetteSettingsProps {
  settings: SmartEditorSettings;
  onSettingsChange: (settings: SmartEditorSettings) => void;
}

export const VignetteSettings = ({
  settings,
  onSettingsChange
}: VignetteSettingsProps) => {
  const updateSetting = <K extends keyof SmartEditorSettings>(
    key: K,
    value: SmartEditorSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* Vignette Text Settings */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-arena-green" />
            Textos das Vinhetas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name" className="text-sm">Nome do Canal</Label>
            <Input
              id="channel-name"
              value={settings.channelName}
              onChange={(e) => updateSetting('channelName', e.target.value)}
              placeholder="Meu Canal"
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="opening-text" className="text-sm">Texto de Abertura</Label>
            <Input
              id="opening-text"
              value={settings.openingText}
              onChange={(e) => updateSetting('openingText', e.target.value)}
              placeholder="Bem-vindo!"
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transition-text" className="text-sm">Texto de Transição</Label>
            <Input
              id="transition-text"
              value={settings.transitionText}
              onChange={(e) => updateSetting('transitionText', e.target.value)}
              placeholder="Oferecimento"
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="closing-text" className="text-sm">Texto de Encerramento</Label>
            <Input
              id="closing-text"
              value={settings.closingText}
              onChange={(e) => updateSetting('closingText', e.target.value)}
              placeholder="Até o próximo vídeo!"
              className="bg-background"
            />
          </div>
        </CardContent>
      </Card>

      {/* Analysis Settings */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-arena-green" />
            Configurações de Análise
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="language" className="text-sm">Idioma da Transcrição</Label>
            <Select
              value={settings.language}
              onValueChange={(value) => updateSetting('language', value)}
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt">Português</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Duração Mínima dos Clips: {settings.minClipDuration}s</Label>
            <Slider
              value={[settings.minClipDuration]}
              onValueChange={([value]) => updateSetting('minClipDuration', value)}
              min={3}
              max={30}
              step={1}
              className="py-2"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Duração Máxima dos Clips: {settings.maxClipDuration}s</Label>
            <Slider
              value={[settings.maxClipDuration]}
              onValueChange={([value]) => updateSetting('maxClipDuration', value)}
              min={10}
              max={120}
              step={5}
              className="py-2"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Quantidade Máxima de Clips: {settings.maxClips}</Label>
            <Slider
              value={[settings.maxClips]}
              onValueChange={([value]) => updateSetting('maxClips', value)}
              min={3}
              max={20}
              step={1}
              className="py-2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cut-intensity" className="text-sm">Intensidade do Corte</Label>
            <Select
              value={settings.cutIntensity}
              onValueChange={(value: 'basic' | 'medium' | 'detailed') => 
                updateSetting('cutIntensity', value)
              }
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Básico (poucos clips longos)</SelectItem>
                <SelectItem value="medium">Médio (equilíbrio)</SelectItem>
                <SelectItem value="detailed">Detalhado (muitos clips curtos)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VignetteSettings;
