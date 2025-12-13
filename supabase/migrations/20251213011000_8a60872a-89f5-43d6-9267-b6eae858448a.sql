-- Create stream_configurations table for live broadcast settings
CREATE TABLE public.stream_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  stream_url TEXT NOT NULL,
  video_resolution TEXT DEFAULT '720p',
  video_codec TEXT DEFAULT 'H.264',
  video_aspect_ratio TEXT DEFAULT '16:9',
  video_scan_type TEXT DEFAULT 'progressive',
  video_frame_rate INTEGER DEFAULT 30,
  video_bitrate INTEGER DEFAULT 5000,
  audio_channels JSONB DEFAULT '[
    {"channel": 1, "type": "narration", "label": "Narração Principal", "active": true, "level": -6},
    {"channel": 2, "type": "ambient", "label": "Áudio Ambiente", "active": true, "level": -12},
    {"channel": 3, "type": "commentary", "label": "Comentarista", "active": true, "level": -6},
    {"channel": 4, "type": "effects", "label": "Reserva/Efeitos", "active": false, "level": -18}
  ]'::jsonb,
  ntp_server TEXT DEFAULT 'pool.ntp.org',
  ntp_offset_ms INTEGER DEFAULT 0,
  ntp_last_sync TIMESTAMPTZ,
  validation_status TEXT DEFAULT 'pending',
  validation_errors JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stream_configurations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow public read on stream_configurations" 
ON public.stream_configurations FOR SELECT USING (true);

CREATE POLICY "Allow public insert on stream_configurations" 
ON public.stream_configurations FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on stream_configurations" 
ON public.stream_configurations FOR UPDATE USING (true);

CREATE POLICY "Allow public delete on stream_configurations" 
ON public.stream_configurations FOR DELETE USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_stream_configurations_updated_at
BEFORE UPDATE ON public.stream_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();