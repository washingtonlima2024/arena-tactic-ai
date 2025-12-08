import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, CameraOff, RefreshCw } from "lucide-react";

interface LiveCameraInputProps {
  cameraStream: MediaStream | null;
  onCameraStreamChange: (stream: MediaStream | null) => void;
  isRecording: boolean;
}

interface DeviceInfo {
  deviceId: string;
  label: string;
}

export const LiveCameraInput = ({
  cameraStream,
  onCameraStreamChange,
  isRecording,
}: LiveCameraInputProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<{ video: DeviceInfo[]; audio: DeviceInfo[] }>({
    video: [],
    audio: [],
  });
  const [selectedVideo, setSelectedVideo] = useState("");
  const [selectedAudio, setSelectedAudio] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const loadDevices = async () => {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      
      const videoDevices = deviceList
        .filter((d) => d.kind === "videoinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Câmera ${d.deviceId.slice(0, 8)}`,
        }));

      const audioDevices = deviceList
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microfone ${d.deviceId.slice(0, 8)}`,
        }));

      setDevices({ video: videoDevices, audio: audioDevices });

      if (videoDevices.length > 0) setSelectedVideo(videoDevices[0].deviceId);
      if (audioDevices.length > 0) setSelectedAudio(audioDevices[0].deviceId);
    } catch (error) {
      console.error("Error loading devices:", error);
    }
  };

  const startCamera = async () => {
    setIsLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideo ? { deviceId: { exact: selectedVideo } } : true,
        audio: selectedAudio ? { deviceId: { exact: selectedAudio } } : true,
      });
      onCameraStreamChange(stream);
    } catch (error) {
      console.error("Error starting camera:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      onCameraStreamChange(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Device Selection */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Câmera</label>
          <Select value={selectedVideo} onValueChange={setSelectedVideo} disabled={isRecording}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a câmera" />
            </SelectTrigger>
            <SelectContent>
              {devices.video.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Microfone</label>
          <Select value={selectedAudio} onValueChange={setSelectedAudio} disabled={isRecording}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o microfone" />
            </SelectTrigger>
            <SelectContent>
              {devices.audio.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Camera Controls */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={loadDevices}
          disabled={isRecording}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        
        {cameraStream ? (
          <Button
            variant="destructive"
            onClick={stopCamera}
            disabled={isRecording}
            className="flex-1"
          >
            <CameraOff className="h-4 w-4 mr-2" />
            Desligar Câmera
          </Button>
        ) : (
          <Button
            onClick={startCamera}
            disabled={isLoading || isRecording}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-2" />
            {isLoading ? "Conectando..." : "Ligar Câmera"}
          </Button>
        )}
      </div>

      {/* Video Preview */}
      <div className="aspect-video bg-black/50 rounded-lg overflow-hidden border border-border">
        {cameraStream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <Camera className="h-12 w-12 mb-2 opacity-50" />
            <p>Selecione e ligue a câmera</p>
          </div>
        )}
      </div>
    </div>
  );
};
