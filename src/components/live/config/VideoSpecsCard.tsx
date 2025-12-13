import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, Monitor, Film, Gauge } from "lucide-react";

interface VideoSpecs {
  resolution: string;
  aspectRatio: string;
  scanType: string;
  codec: string;
  frameRate: number;
  bitrate: number;
}

interface VideoSpecsCardProps {
  specs: VideoSpecs;
  onSpecsChange: (specs: VideoSpecs) => void;
}

const EXPECTED_SPECS = {
  resolution: "720p",
  aspectRatio: "16:9",
  scanType: "progressive",
  codec: "H.264",
  frameRateMin: 25,
  frameRateMax: 60,
  bitrateMin: 3000,
  bitrateMax: 8000,
};

export function VideoSpecsCard({ specs, onSpecsChange }: VideoSpecsCardProps) {
  const getStatus = (field: keyof VideoSpecs, value: string | number) => {
    switch (field) {
      case "resolution":
        return value === EXPECTED_SPECS.resolution ? "ok" : value === "1080p" ? "warning" : "error";
      case "aspectRatio":
        return value === EXPECTED_SPECS.aspectRatio ? "ok" : "error";
      case "scanType":
        return value === EXPECTED_SPECS.scanType ? "ok" : "error";
      case "codec":
        return value === EXPECTED_SPECS.codec ? "ok" : value === "H.265" ? "warning" : "error";
      case "frameRate":
        const fr = value as number;
        return fr >= EXPECTED_SPECS.frameRateMin && fr <= EXPECTED_SPECS.frameRateMax ? "ok" : "error";
      case "bitrate":
        const br = value as number;
        return br >= EXPECTED_SPECS.bitrateMin && br <= EXPECTED_SPECS.bitrateMax ? "ok" : br < EXPECTED_SPECS.bitrateMin ? "warning" : "error";
      default:
        return "ok";
    }
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "ok") return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const specItems = [
    { 
      key: "resolution" as const, 
      label: "Resolução", 
      value: specs.resolution, 
      expected: EXPECTED_SPECS.resolution,
      icon: Monitor 
    },
    { 
      key: "aspectRatio" as const, 
      label: "Aspect Ratio", 
      value: specs.aspectRatio, 
      expected: EXPECTED_SPECS.aspectRatio,
      icon: Monitor 
    },
    { 
      key: "scanType" as const, 
      label: "Tipo de Scan", 
      value: specs.scanType === "progressive" ? "Progressivo" : "Entrelaçado", 
      expected: "Progressivo",
      icon: Film 
    },
    { 
      key: "codec" as const, 
      label: "Codec", 
      value: specs.codec, 
      expected: EXPECTED_SPECS.codec,
      icon: Film 
    },
    { 
      key: "frameRate" as const, 
      label: "Frame Rate", 
      value: `${specs.frameRate} fps`, 
      expected: `${EXPECTED_SPECS.frameRateMin}-${EXPECTED_SPECS.frameRateMax} fps`,
      icon: Gauge 
    },
    { 
      key: "bitrate" as const, 
      label: "Bitrate", 
      value: `${specs.bitrate} kbps`, 
      expected: `${EXPECTED_SPECS.bitrateMin}-${EXPECTED_SPECS.bitrateMax} kbps`,
      icon: Gauge 
    },
  ];

  const allOk = specItems.every(item => getStatus(item.key, item.key === "frameRate" ? specs.frameRate : item.key === "bitrate" ? specs.bitrate : specs[item.key]) === "ok");

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            Especificações de Vídeo
          </CardTitle>
          <Badge variant={allOk ? "default" : "destructive"}>
            {allOk ? "Conforme" : "Ajustes Necessários"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {specItems.map((item) => {
            const status = getStatus(item.key, item.key === "frameRate" ? specs.frameRate : item.key === "bitrate" ? specs.bitrate : specs[item.key]);
            return (
              <div 
                key={item.key}
                className={`p-3 rounded-lg border ${
                  status === "ok" ? "border-green-500/30 bg-green-500/5" :
                  status === "warning" ? "border-yellow-500/30 bg-yellow-500/5" :
                  "border-red-500/30 bg-red-500/5"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <StatusIcon status={status} />
                </div>
                <p className="font-medium text-sm">{item.value}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esperado: {item.expected}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
