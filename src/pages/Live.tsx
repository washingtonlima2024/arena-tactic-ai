import { useState, useCallback, useMemo, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Link2, Camera, Radio, Settings, ExternalLink, Loader2, Video, BarChart3 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { LiveStreamInput } from "@/components/live/LiveStreamInput";
import { LiveCameraInput, LiveCameraInputRef } from "@/components/live/LiveCameraInput";
import { LiveMatchForm } from "@/components/live/LiveMatchForm";
import { LiveRecordingPanel } from "@/components/live/LiveRecordingPanel";
import { LiveEventsList } from "@/components/live/LiveEventsList";
import { LiveScoreDisplay } from "@/components/live/LiveScoreDisplay";
import { LiveTranscriptRealtime } from "@/components/live/LiveTranscriptRealtime";
import { LiveFinishDialog } from "@/components/live/LiveFinishDialog";
import { LiveSummaryDialog } from "@/components/live/LiveSummaryDialog";
import { LiveEventPlayer } from "@/components/live/LiveEventPlayer";
import { LiveAnalysisPanel } from "@/components/live/LiveAnalysisPanel";
import { LiveTacticalField } from "@/components/tactical/LiveTacticalField";
import { LiveClipProgress } from "@/components/live/LiveClipProgress";
import { useLiveBroadcastContext } from "@/contexts/LiveBroadcastContext";
import { useEventBasedAnalysis } from "@/hooks/useEventBasedAnalysis";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const Live = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [inputMode, setInputMode] = useState<"stream" | "camera">("stream");
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  
  // Video element state - for stream mode
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  
  // Camera video element ref - for camera mode
  const cameraInputRef = useRef<LiveCameraInputRef>(null);
  const [cameraVideoElement, setCameraVideoElement] = useState<HTMLVideoElement | null>(null);
  
  // Use global context instead of local hook
  const {
    matchInfo,
    setMatchInfo,
    streamUrl,
    setStreamUrl,
    cameraStream,
    setCameraStream,
    isRecording,
    isPaused,
    recordingTime,
    detectedEvents,
    approvedEvents,
    currentScore,
    currentMatchId,
    transcriptBuffer,
    isRecordingVideo,
    videoUploadProgress,
    isUploadingVideo,
    isFinishing,
    finishResult,
    resetFinishResult,
    clipGenerationQueue,
    storageProgress,
    isAnalyzingLive,
    analysisProgress,
    // Manual clip states
    isClipRecording,
    clipStartTime,
    clipEventType,
    // Actions
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    addManualEvent,
    addDetectedEvent,
    approveEvent,
    editEvent,
    removeEvent,
    updateScore,
    finishMatch,
    getClipChunksForTime,
    // Manual clip actions
    startManualClip,
    finishManualClip,
  } = useLiveBroadcastContext();

  const hasVideoSource = streamUrl || cameraStream;

  // Convert approved events for the analysis hook
  const analysisEvents = useMemo(() => {
    return approvedEvents.map(event => ({
      id: event.id,
      event_type: event.type,
      minute: event.minute,
      second: event.second,
      description: event.description,
      is_highlight: true,
      metadata: { team: event.type.includes('home') ? 'home' : event.type.includes('away') ? 'away' : null }
    }));
  }, [approvedEvents]);

  // Use the analysis hook with live events
  const liveAnalysis = useEventBasedAnalysis(
    analysisEvents,
    { name: matchInfo.homeTeam || 'Time Casa' },
    { name: matchInfo.awayTeam || 'Time Visitante' }
  );

  // Convert events for tactical field (with estimated positions)
  const tacticalEvents = useMemo(() => {
    return approvedEvents.map(event => ({
      id: event.id,
      event_type: event.type,
      minute: event.minute,
      description: event.description,
      position_x: null,
      position_y: null,
    }));
  }, [approvedEvents]);

  // Callback to receive video element from LiveStreamInput
  const handleVideoElementReady = useCallback((element: HTMLVideoElement | null) => {
    console.log('[Live] Stream video element ready:', element ? 'available' : 'null');
    setVideoElement(element);
  }, []);

  // Callback to receive video element from LiveCameraInput
  const handleCameraVideoElementReady = useCallback((element: HTMLVideoElement | null) => {
    console.log('[Live] Camera video element ready:', element ? 'available' : 'null');
    setCameraVideoElement(element);
  }, []);

  // Get the appropriate video element based on current mode
  const getActiveVideoElement = useCallback((): HTMLVideoElement | null => {
    if (inputMode === 'stream') {
      return videoElement;
    } else {
      // Try to get from ref first, then from callback state
      return cameraInputRef.current?.getVideoElement() || cameraVideoElement;
    }
  }, [inputMode, videoElement, cameraVideoElement]);

  // Modified start recording to pass video element AND selectedMatchId with validation
  const handleStartRecording = useCallback(() => {
    const activeVideoElement = getActiveVideoElement();
    
    // Validate that we have a video source
    if (!activeVideoElement && !cameraStream) {
      console.warn('[Live] No video source available');
      toast({
        title: "Fonte de vídeo não disponível",
        description: inputMode === 'camera' 
          ? "Ligue a câmera antes de iniciar a gravação"
          : "Carregue um stream válido antes de iniciar a gravação",
        variant: "destructive",
      });
      return;
    }
    
    console.log('[Live] Starting recording with video element:', activeVideoElement ? 'available' : 'null');
    console.log('[Live] Camera stream:', cameraStream ? 'available' : 'null');
    
    startRecording(activeVideoElement, selectedMatchId);
  }, [startRecording, getActiveVideoElement, selectedMatchId, cameraStream, inputMode, toast]);

  // Handle finish button click - show confirmation dialog
  const handleFinishClick = useCallback(() => {
    setShowFinishDialog(true);
  }, []);

  // Handle confirm finish
  const handleConfirmFinish = useCallback(async () => {
    const result = await finishMatch();
    setShowFinishDialog(false);
    if (result) {
      setShowSummaryDialog(true);
    }
  }, [finishMatch]);

  // Handle summary dialog close
  const handleSummaryClose = useCallback(() => {
    setShowSummaryDialog(false);
    resetFinishResult();
    setSelectedMatchId(null);
  }, [resetFinishResult]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30">
            <Radio className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Transmissão Ao Vivo</h1>
            <p className="text-muted-foreground">Grave e analise partidas em tempo real</p>
          </div>
          {isRecording && (
            <div className="ml-auto flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-red-500 font-semibold">AO VIVO</span>
              {currentMatchId && (
                <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-500 px-2 py-1 rounded-full border border-green-500/30 ml-2">
              ✓ Partida Registrada
                </span>
              )}
              {isRecordingVideo ? (
                <span className="flex items-center gap-1 text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded-full border border-green-500/30 ml-2">
                  <Video className="h-3 w-3" />
                  Gravando vídeo
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-full border border-yellow-500/30 ml-2">
                  <Video className="h-3 w-3" />
                  Apenas áudio
                </span>
              )}
            </div>
          )}
          {streamUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const viewerUrl = `${window.location.origin}/viewer?url=${encodeURIComponent(streamUrl)}`;
                window.open(viewerUrl, 'ArenaPlayViewer', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
              }}
              className="border-primary/50 text-primary hover:bg-primary/10"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir Player
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/live/config")}
            className="ml-auto"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configuração Avançada
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column - Video Source + Transcript & Controls */}
          <div className="xl:col-span-2 space-y-6">
            {/* Video Source + Transcript Side by Side */}
            <div className="glass-card p-6 rounded-xl">
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "stream" | "camera")}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="stream" className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Link de Stream
                  </TabsTrigger>
                  <TabsTrigger value="camera" className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Câmera Local
                  </TabsTrigger>
                </TabsList>

                {/* Video + Transcript Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Video Player */}
                  <div>
                    <TabsContent value="stream" className="mt-0">
                      <LiveStreamInput 
                        streamUrl={streamUrl} 
                        onStreamUrlChange={setStreamUrl}
                        isRecording={isRecording}
                        onVideoElementReady={handleVideoElementReady}
                      />
                    </TabsContent>

                    <TabsContent value="camera" className="mt-0">
                      <LiveCameraInput 
                        ref={cameraInputRef}
                        cameraStream={cameraStream}
                        onCameraStreamChange={setCameraStream}
                        isRecording={isRecording}
                        onVideoElementReady={handleCameraVideoElementReady}
                      />
                    </TabsContent>
                  </div>

                  {/* Live Transcript - Side by side with video */}
                  <div className="h-full">
                    <LiveTranscriptRealtime
                      isRecording={isRecording}
                      matchId={currentMatchId || selectedMatchId}
                      homeTeam={matchInfo.homeTeam}
                      awayTeam={matchInfo.awayTeam}
                      currentScore={currentScore}
                      videoElement={videoElement}
                      onTranscriptUpdate={(buffer, chunks) => {
                        console.log('Transcript updated:', buffer.length, 'chars,', chunks.length, 'chunks');
                      }}
                      onEventDetected={(event) => {
                        console.log('Event detected from transcript:', event);
                        addDetectedEvent({
                          type: event.type,
                          minute: event.minute,
                          second: event.second,
                          description: event.description,
                          confidence: event.confidence,
                          source: 'ai-transcript',
                        });
                      }}
                    />
                  </div>
                </div>
              </Tabs>
            </div>

            {/* Match Form */}
            <LiveMatchForm 
              matchInfo={matchInfo}
              onMatchInfoChange={setMatchInfo}
              disabled={isRecording}
              selectedMatchId={selectedMatchId}
              onMatchIdChange={setSelectedMatchId}
            />

            {/* Recording Controls */}
            <LiveRecordingPanel
              isRecording={isRecording}
              isPaused={isPaused}
              recordingTime={recordingTime}
              hasVideoSource={!!hasVideoSource}
              hasMatchInfo={!!(matchInfo.homeTeam && matchInfo.awayTeam)}
              currentMatchId={currentMatchId}
              isClipRecording={isClipRecording}
              clipEventType={clipEventType}
              clipStartTime={clipStartTime}
              onStart={handleStartRecording}
              onStop={stopRecording}
              onPause={pauseRecording}
              onResume={resumeRecording}
              onFinish={handleFinishClick}
              onAddManualEvent={addManualEvent}
              onStartClip={startManualClip}
              onFinishClip={finishManualClip}
            />
          </div>

          {/* Right Column - Score & Events */}
          <div className="space-y-6">
            {/* Score Display */}
            <LiveScoreDisplay
              homeTeam={matchInfo.homeTeam || "Time Casa"}
              awayTeam={matchInfo.awayTeam || "Time Fora"}
              homeScore={currentScore.home}
              awayScore={currentScore.away}
              onScoreChange={updateScore}
              disabled={!isRecording}
              isRecording={isRecording}
              recordingTime={recordingTime}
            />

            {/* Events List */}
            <LiveEventsList
              detectedEvents={detectedEvents}
              approvedEvents={approvedEvents}
              onApprove={approveEvent}
              onEdit={editEvent}
              onRemove={removeEvent}
            />

            {/* Event Player - Clips Timeline */}
            {approvedEvents.length > 0 && (
              <LiveEventPlayer
                events={approvedEvents}
                videoElement={videoElement}
                recordingTime={recordingTime}
                isRecording={isRecording}
                getClipChunks={getClipChunksForTime}
              />
            )}
          </div>
        </div>

        {/* Live Tactical Analysis Section */}
        {approvedEvents.length > 0 && (
          <div className="glass-card p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Análise Tática Ao Vivo</h2>
                <p className="text-sm text-muted-foreground">
                  Atualiza automaticamente com cada evento aprovado
                </p>
              </div>
              <Badge variant="outline" className="ml-auto bg-green-500/10 border-green-500/30 text-green-500">
                <span className="relative flex h-2 w-2 mr-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Análise Ativa
              </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tactical Field */}
              <div className="bg-muted/20 rounded-xl p-4 border border-border/50">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Campo Tático • Eventos Animados
                </h3>
                <div className="aspect-[3/2] relative">
                  <LiveTacticalField
                    events={tacticalEvents}
                    homeTeam={matchInfo.homeTeam}
                    awayTeam={matchInfo.awayTeam}
                    className="w-full h-full"
                  />
                </div>
              </div>

              {/* Analysis Panel */}
              <div>
                <LiveAnalysisPanel
                  homeTeam={matchInfo.homeTeam || 'Time Casa'}
                  awayTeam={matchInfo.awayTeam || 'Time Visitante'}
                  homeStats={liveAnalysis.homeStats}
                  awayStats={liveAnalysis.awayStats}
                  insights={liveAnalysis.insights}
                  keyMoments={liveAnalysis.keyMoments}
                  matchSummary={liveAnalysis.matchSummary}
                  possession={liveAnalysis.possession}
                  eventsCount={approvedEvents.length}
                />
              </div>
            </div>
          </div>
        )}
        {isUploadingVideo && (
          <div className="fixed bottom-4 right-4 bg-card p-4 rounded-lg shadow-lg border z-50 min-w-[280px]">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Enviando vídeo...</p>
                <Progress value={videoUploadProgress} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {videoUploadProgress}% concluído
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Finish Confirmation Dialog */}
      <LiveFinishDialog
        isOpen={showFinishDialog}
        onClose={() => setShowFinishDialog(false)}
        onConfirm={handleConfirmFinish}
        matchInfo={matchInfo}
        score={currentScore}
        recordingTime={recordingTime}
        eventsCount={approvedEvents.length}
        transcriptWords={transcriptBuffer?.split(" ").filter(w => w.trim()).length || 0}
        isFinishing={isFinishing}
      />

      {/* Summary Dialog */}
      <LiveSummaryDialog
        isOpen={showSummaryDialog}
        onClose={handleSummaryClose}
        result={finishResult}
        matchInfo={matchInfo}
        score={currentScore}
      />

      {/* Clip Generation Progress */}
      {isRecording && (
        <LiveClipProgress
          clipQueue={clipGenerationQueue}
          storageProgress={storageProgress}
        />
      )}
    </AppLayout>
  );
};

export default Live;
