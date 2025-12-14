import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Ruler, Box, Grid3X3, Eye, RotateCcw } from 'lucide-react';
import { OfficialFootballField } from '@/components/tactical/OfficialFootballField';
import { OfficialField3D } from '@/components/tactical/OfficialField3D';
import { FieldMeasurementsOverlay } from '@/components/tactical/FieldMeasurementsOverlay';
import { FIFA_FIELD } from '@/constants/fieldDimensions';

const Field = () => {
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [theme2D, setTheme2D] = useState<'grass' | 'tactical' | 'minimal'>('grass');
  const [cameraPreset, setCameraPreset] = useState<'tv' | 'tactical' | 'corner' | 'goal'>('tv');
  const [autoRotate, setAutoRotate] = useState(false);

  const measurements = [
    { label: 'Comprimento do campo', value: `${FIFA_FIELD.length}m`, desc: '100-110m permitido' },
    { label: 'Largura do campo', value: `${FIFA_FIELD.width}m`, desc: '64-75m permitido' },
    { label: 'Área de pênalti', value: `${FIFA_FIELD.penaltyAreaWidth}m × ${FIFA_FIELD.penaltyAreaDepth}m`, desc: 'Grande área' },
    { label: 'Área do gol', value: `${FIFA_FIELD.goalAreaWidth}m × ${FIFA_FIELD.goalAreaDepth}m`, desc: 'Pequena área' },
    { label: 'Círculo central', value: `${FIFA_FIELD.centerCircleRadius}m raio`, desc: '10 jardas' },
    { label: 'Marca do pênalti', value: `${FIFA_FIELD.penaltySpotDistance}m`, desc: 'Da linha de gol' },
    { label: 'Largura do gol', value: `${FIFA_FIELD.goalWidth}m`, desc: '8 jardas' },
    { label: 'Altura do gol', value: `${FIFA_FIELD.goalHeight}m`, desc: '8 pés' },
    { label: 'Arco de escanteio', value: `${FIFA_FIELD.cornerArcRadius}m raio`, desc: '1 metro' },
    { label: 'Largura das linhas', value: `${FIFA_FIELD.lineWidth * 100}cm`, desc: 'Máximo 12cm' },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Campo Oficial FIFA</h1>
            <p className="text-muted-foreground">Visualização com medidas oficiais FIFA 2023/24</p>
          </div>
          <Badge variant="outline" className="text-primary border-primary">
            <Ruler className="mr-1 h-3 w-3" />
            {FIFA_FIELD.length}m × {FIFA_FIELD.width}m
          </Badge>
        </div>

        <Tabs defaultValue="2d" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="2d" className="flex items-center gap-2">
              <Grid3X3 className="h-4 w-4" />
              Campo 2D
            </TabsTrigger>
            <TabsTrigger value="3d" className="flex items-center gap-2">
              <Box className="h-4 w-4" />
              Campo 3D
            </TabsTrigger>
            <TabsTrigger value="measures" className="flex items-center gap-2">
              <Ruler className="h-4 w-4" />
              Medidas
            </TabsTrigger>
          </TabsList>

          {/* 2D Field Tab */}
          <TabsContent value="2d" className="space-y-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Controles 2D</CardTitle>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="measurements-2d"
                        checked={showMeasurements}
                        onCheckedChange={setShowMeasurements}
                      />
                      <Label htmlFor="measurements-2d" className="text-sm">Medidas</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="grid-2d"
                        checked={showGrid}
                        onCheckedChange={setShowGrid}
                      />
                      <Label htmlFor="grid-2d" className="text-sm">Grade</Label>
                    </div>
                    <Select value={theme2D} onValueChange={(v) => setTheme2D(v as typeof theme2D)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grass">Grama</SelectItem>
                        <SelectItem value="tactical">Tático</SelectItem>
                        <SelectItem value="minimal">Minimalista</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg overflow-hidden border border-border/50">
                  <OfficialFootballField
                    showMeasurements={showMeasurements}
                    showGrid={showGrid}
                    theme={theme2D}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3D Field Tab */}
          <TabsContent value="3d" className="space-y-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Controles 3D</CardTitle>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="measurements-3d"
                        checked={showMeasurements}
                        onCheckedChange={setShowMeasurements}
                      />
                      <Label htmlFor="measurements-3d" className="text-sm">Medidas</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="grid-3d"
                        checked={showGrid}
                        onCheckedChange={setShowGrid}
                      />
                      <Label htmlFor="grid-3d" className="text-sm">Grade</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="rotate-3d"
                        checked={autoRotate}
                        onCheckedChange={setAutoRotate}
                      />
                      <Label htmlFor="rotate-3d" className="text-sm flex items-center gap-1">
                        <RotateCcw className="h-3 w-3" />
                        Rotação
                      </Label>
                    </div>
                    <Select value={cameraPreset} onValueChange={(v) => setCameraPreset(v as typeof cameraPreset)}>
                      <SelectTrigger className="w-36">
                        <Eye className="mr-2 h-4 w-4" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tv">Transmissão</SelectItem>
                        <SelectItem value="tactical">Tático</SelectItem>
                        <SelectItem value="corner">Escanteio</SelectItem>
                        <SelectItem value="goal">Gol</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[600px] rounded-lg overflow-hidden border border-border/50">
                  <OfficialField3D
                    showMeasurements={showMeasurements}
                    showGrid={showGrid}
                    cameraPreset={cameraPreset}
                    autoRotate={autoRotate}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Measurements Tab */}
          <TabsContent value="measures" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ruler className="h-5 w-5 text-primary" />
                    Medidas Oficiais FIFA 2023/24
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {measurements.map((m, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                        <div>
                          <p className="font-medium text-foreground">{m.label}</p>
                          <p className="text-xs text-muted-foreground">{m.desc}</p>
                        </div>
                        <Badge variant="secondary" className="font-mono">
                          {m.value}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <FieldMeasurementsOverlay variant="detailed" />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Field;
