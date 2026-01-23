import { useState, useMemo, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Ruler, Grid3X3, Play, Target, AlertCircle, Camera, Loader2, Upload } from 'lucide-react';
import { OfficialFootballField } from '@/components/tactical/OfficialFootballField';
import { FieldMeasurementsOverlay } from '@/components/tactical/FieldMeasurementsOverlay';
import { GoalPlayAnimation, generateMockGoalPlay } from '@/components/tactical/GoalPlayAnimation';
import { FIFA_FIELD, metersToSvg } from '@/constants/fieldDimensions';
import { apiClient } from '@/lib/apiClient';
import { useQuery } from '@tanstack/react-query';
import { usePlayerDetection } from '@/hooks/usePlayerDetection';
import { useMatchSelection } from '@/hooks/useMatchSelection';
import { AppLayout } from '@/components/layout/AppLayout';

interface GoalEvent {
  id: string;
  minute: number;
  second: number;
  description: string;
  team: 'home' | 'away';
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
}

const Field = () => {
  const { currentMatchId, selectedMatch } = useMatchSelection();
  
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [theme2D, setTheme2D] = useState<'grass' | 'tactical' | 'minimal'>('grass');
  const [selectedGoal, setSelectedGoal] = useState<GoalEvent | null>(null);
  
  // YOLO detection state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const { detectFromImage, isDetecting, lastResult } = usePlayerDetection();

  // Fetch goal events from the selected match
  const { data: goalEvents = [], isLoading } = useQuery({
    queryKey: ['goal-events', currentMatchId],
    queryFn: async () => {
      if (!currentMatchId || !selectedMatch) return [];
      
      try {
        const events = await apiClient.getMatchEvents(currentMatchId);
        const goals = events.filter((e: any) => e.event_type === 'goal');
        
        return goals.map((e: any) => ({
          id: e.id,
          minute: e.minute || 0,
          second: e.second || 0,
          description: e.description || 'Gol',
          team: (e.metadata?.team === 'away' ? 'away' : 'home') as 'home' | 'away',
          matchId: currentMatchId,
          homeTeam: selectedMatch.home_team?.name || 'Time Casa',
          awayTeam: selectedMatch.away_team?.name || 'Time Fora',
          homeColor: selectedMatch.home_team?.primary_color || '#10b981',
          awayColor: selectedMatch.away_team?.primary_color || '#ef4444',
        }));
      } catch (error) {
        console.error('Erro ao buscar gols:', error);
        return [];
      }
    },
    enabled: !!currentMatchId
  });

  // Generate animation frames for selected goal
  const animationFrames = useMemo(() => {
    if (!selectedGoal) return generateMockGoalPlay('home');
    return generateMockGoalPlay(selectedGoal.team);
  }, [selectedGoal]);

  // Handle image upload for YOLO detection
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setUploadedImage(dataUrl);
      
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      await detectFromImage(base64, 0);
    };
    reader.readAsDataURL(file);
  };

  // Render detected players on field
  const renderDetectionOverlay = () => {
    if (!lastResult) return null;

    return (
      <g>
        {lastResult.players.map((player) => {
          const px = metersToSvg(player.x);
          const py = metersToSvg(player.y);
          const color = player.team === 'home' ? '#10b981' : player.team === 'away' ? '#ef4444' : '#888888';

          return (
            <g key={player.id}>
              <circle
                cx={px}
                cy={py}
                r={12}
                fill={color}
                stroke="#ffffff"
                strokeWidth={2}
                opacity={player.confidence}
              />
              <text
                x={px}
                y={py + 4}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="8"
                fontWeight="bold"
              >
                {Math.round(player.confidence * 100)}%
              </text>
            </g>
          );
        })}

        {lastResult.ball && (
          <circle
            cx={metersToSvg(lastResult.ball.x)}
            cy={metersToSvg(lastResult.ball.y)}
            r={8}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1}
          />
        )}

        {lastResult.referee && (
          <circle
            cx={metersToSvg(lastResult.referee.x)}
            cy={metersToSvg(lastResult.referee.y)}
            r={10}
            fill="#fbbf24"
            stroke="#000000"
            strokeWidth={2}
          />
        )}
      </g>
    );
  };

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
    <AppLayout key={currentMatchId}>
      <div className="p-6">
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
            <TabsList className="grid w-full max-w-2xl grid-cols-4">
              <TabsTrigger value="2d" className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                Campo 2D
              </TabsTrigger>
              <TabsTrigger value="detection" className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Detecção YOLO
              </TabsTrigger>
              <TabsTrigger value="animation" className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                Animação Gol
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

            {/* YOLO Detection Tab */}
            <TabsContent value="detection" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Image Upload & Preview */}
                <Card className="bg-card/50 backdrop-blur border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Camera className="h-5 w-5 text-primary" />
                      Imagem de Entrada
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isDetecting}
                        className="flex-1"
                      >
                        {isDetecting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Detectando...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Enviar Imagem
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {uploadedImage ? (
                      <div className="relative rounded-lg overflow-hidden border border-border">
                        <img 
                          src={uploadedImage} 
                          alt="Frame de vídeo" 
                          className="w-full h-auto"
                        />
                        {isDetecting && (
                          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                            <div className="text-center space-y-2">
                              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                              <p className="text-sm text-muted-foreground">Processando com YOLO...</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                        <Camera className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">
                          Envie uma imagem de partida de futebol para detectar jogadores
                        </p>
                      </div>
                    )}

                    {lastResult && (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-primary/10 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-primary">{lastResult.players.length}</p>
                          <p className="text-xs text-muted-foreground">Jogadores</p>
                        </div>
                        <div className="bg-secondary/50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold">{lastResult.ball ? '1' : '0'}</p>
                          <p className="text-xs text-muted-foreground">Bola</p>
                        </div>
                        <div className="bg-muted rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold">{lastResult.processingTimeMs}ms</p>
                          <p className="text-xs text-muted-foreground">Tempo</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Field Visualization */}
                <Card className="bg-card/50 backdrop-blur border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Target className="h-5 w-5 text-primary" />
                        Posições Detectadas
                      </CardTitle>
                      <Badge variant="outline" className="font-mono">
                        Roboflow API
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg overflow-hidden border border-border/50">
                      <OfficialFootballField
                        theme="tactical"
                        showMeasurements={false}
                        showGrid={true}
                      >
                        {renderDetectionOverlay()}
                      </OfficialFootballField>
                    </div>
                    
                    {lastResult && (
                      <div className="mt-4 flex gap-4 justify-center text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-primary" />
                          <span className="text-muted-foreground">Time Casa ({lastResult.players.filter(p => p.team === 'home').length})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-destructive" />
                          <span className="text-muted-foreground">Time Fora ({lastResult.players.filter(p => p.team === 'away').length})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-yellow-500" />
                          <span className="text-muted-foreground">Árbitro</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Goal Animation Tab */}
            <TabsContent value="animation" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Goal Selector */}
                <Card className="bg-card/50 backdrop-blur border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Target className="h-5 w-5 text-primary" />
                      Gols Detectados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Carregando gols...
                      </div>
                    ) : goalEvents.length === 0 ? (
                      <div className="text-center py-8 space-y-3">
                        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50" />
                        <p className="text-muted-foreground text-sm">
                          Nenhum gol detectado ainda
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedGoal({
                            id: 'demo',
                            minute: 45,
                            second: 0,
                            description: 'Gol de demonstração',
                            team: 'home',
                            matchId: 'demo',
                            homeTeam: 'Time Casa',
                            awayTeam: 'Time Visitante',
                            homeColor: '#10b981',
                            awayColor: '#ef4444'
                          })}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Ver Demo
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {goalEvents.map((goal) => (
                          <Button
                            key={goal.id}
                            variant={selectedGoal?.id === goal.id ? "default" : "outline"}
                            className="w-full justify-start text-left h-auto py-3"
                            onClick={() => setSelectedGoal(goal)}
                          >
                            <div className="flex items-center gap-3 w-full">
                              <Badge 
                                variant="secondary"
                                style={{ 
                                  backgroundColor: goal.team === 'home' ? goal.homeColor : goal.awayColor,
                                  color: '#fff'
                                }}
                              >
                                {goal.minute}'
                              </Badge>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-sm">
                                  {goal.team === 'home' ? goal.homeTeam : goal.awayTeam}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  vs {goal.team === 'home' ? goal.awayTeam : goal.homeTeam}
                                </p>
                              </div>
                            </div>
                          </Button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Animation Player */}
                <div className="lg:col-span-3">
                  <Card className="bg-card/50 backdrop-blur border-border/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Play className="h-5 w-5 text-primary" />
                          Animação da Jogada
                        </CardTitle>
                        <Badge variant="outline" className="font-mono">
                          SVG Animado
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {selectedGoal ? (
                        <GoalPlayAnimation
                          frames={animationFrames}
                          homeTeamColor={selectedGoal.homeColor}
                          awayTeamColor={selectedGoal.awayColor}
                          goalMinute={selectedGoal.minute}
                          goalTeam={selectedGoal.team}
                          description={`${selectedGoal.team === 'home' ? selectedGoal.homeTeam : selectedGoal.awayTeam} - ${selectedGoal.description}`}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                          <Play className="h-16 w-16 text-muted-foreground/30 mb-4" />
                          <p className="text-muted-foreground">
                            Selecione um gol para visualizar a animação da jogada
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
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
    </AppLayout>
  );
};

export default Field;
