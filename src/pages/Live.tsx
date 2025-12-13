import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Link2, Camera, Radio, Settings } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { LiveStreamInput } from "@/components/live/LiveStreamInput";
import { LiveCameraInput } from "@/components/live/LiveCameraInput";
import { LiveMatchForm } from "@/components/live/LiveMatchForm";
import { LiveRecordingPanel } from "@/components/live/LiveRecordingPanel";
import { LiveEventsList } from "@/components/live/LiveEventsList";
import { LiveScoreDisplay } from "@/components/live/LiveScoreDisplay";
import { LiveTranscript } from "@/components/live/LiveTranscript";
import { useLiveBroadcast } from "@/hooks/useLiveBroadcast";

const Live = () => {
  const navigate = useNavigate();
  const [inputMode, setInputMode] = useState<"stream" | "camera">("stream");
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
    transcriptBuffer,
    transcriptChunks,
    isSavingTranscript,
    lastSavedAt,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    addManualEvent,
    approveEvent,
    editEvent,
    removeEvent,
    updateScore,
    finishMatch,
  } = useLiveBroadcast();

  const hasVideoSource = streamUrl || cameraStream;

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
            </div>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Video Source & Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Source Tabs */}
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

                <TabsContent value="stream">
                  <LiveStreamInput 
                    streamUrl={streamUrl} 
                    onStreamUrlChange={setStreamUrl}
                    isRecording={isRecording}
                  />
                </TabsContent>

                <TabsContent value="camera">
                  <LiveCameraInput 
                    cameraStream={cameraStream}
                    onCameraStreamChange={setCameraStream}
                    isRecording={isRecording}
                  />
                </TabsContent>
              </Tabs>
            </div>

            {/* Match Form */}
            <LiveMatchForm 
              matchInfo={matchInfo}
              onMatchInfoChange={setMatchInfo}
              disabled={isRecording}
            />

            {/* Recording Controls */}
            <LiveRecordingPanel
              isRecording={isRecording}
              isPaused={isPaused}
              recordingTime={recordingTime}
              hasVideoSource={!!hasVideoSource}
              hasMatchInfo={!!(matchInfo.homeTeam && matchInfo.awayTeam)}
              onStart={startRecording}
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
            />

            {/* Live Transcript */}
            <LiveTranscript
              transcriptBuffer={transcriptBuffer}
              transcriptChunks={transcriptChunks}
              isSaving={isSavingTranscript}
              lastSavedAt={lastSavedAt}
              isRecording={isRecording}
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
      </div>
    </AppLayout>
  );
};

export default Live;
