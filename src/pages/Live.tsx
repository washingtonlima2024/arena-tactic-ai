import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link2, Camera, Radio, Settings, ExternalLink, Loader2, Video } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { LiveStreamInput } from "@/components/live/LiveStreamInput";
import { LiveCameraInput } from "@/components/live/LiveCameraInput";
import { LiveMatchForm } from "@/components/live/LiveMatchForm";
import { LiveRecordingPanel } from "@/components/live/LiveRecordingPanel";
import { LiveEventsList } from "@/components/live/LiveEventsList";
import { LiveScoreDisplay } from "@/components/live/LiveScoreDisplay";
import { LiveTranscriptRealtime } from "@/components/live/LiveTranscriptRealtime";
import { useLiveBroadcast, TranscriptChunk } from "@/hooks/useLiveBroadcast";

const Live = () => {
  const navigate = useNavigate();
  const [inputMode, setInputMode] = useState<"stream" | "camera">("stream");
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  
  // Ref for video element (for recording)
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  
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
    // NEW: Video recording states
    isRecordingVideo,
    videoUploadProgress,
    isUploadingVideo,
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
  } = useLiveBroadcast();

  const hasVideoSource = streamUrl || cameraStream;

  // Callback to receive video element from LiveStreamInput
  const handleVideoElementReady = useCallback((videoElement: HTMLVideoElement | null) => {
    videoElementRef.current = videoElement;
    console.log('Video element ready:', videoElement ? 'available' : 'null');
  }, []);

  // Modified start recording to pass video element
  const handleStartRecording = useCallback(() => {
    startRecording(videoElementRef.current);
  }, [startRecording]);

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
              {isRecordingVideo && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                  <Video className="h-3 w-3" />
                  Gravando vídeo
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
                        cameraStream={cameraStream}
                        onCameraStreamChange={setCameraStream}
                        isRecording={isRecording}
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
                      videoElement={videoElementRef.current}
                      onTranscriptUpdate={(buffer, chunks) => {
                        console.log('Transcript updated:', buffer.length, 'chars,', chunks.length, 'chunks');
                      }}
                      onEventDetected={(event) => {
                        console.log('Event detected from transcript:', event);
                        // Add as detected event to the live events list
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
              onStart={handleStartRecording}
              onStop={stopRecording}
              onPause={pauseRecording}
              onResume={resumeRecording}
              onFinish={finishMatch}
              onAddManualEvent={addManualEvent}
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
          </div>
        </div>

        {/* Video Upload Progress Indicator */}
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
    </AppLayout>
  );
};

export default Live;
