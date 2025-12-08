-- Create table for storing generated audio content
CREATE TABLE public.generated_audio (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  audio_type TEXT NOT NULL, -- 'narration', 'podcast_tactical', 'podcast_summary', 'podcast_debate'
  voice TEXT,
  script TEXT,
  audio_url TEXT, -- URL in storage bucket
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint to prevent duplicates
  UNIQUE(match_id, audio_type, voice)
);

-- Enable RLS
ALTER TABLE public.generated_audio ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for now (no auth in this app)
CREATE POLICY "Allow public read access to generated_audio"
  ON public.generated_audio
  FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to generated_audio"
  ON public.generated_audio
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to generated_audio"
  ON public.generated_audio
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete to generated_audio"
  ON public.generated_audio
  FOR DELETE
  USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_generated_audio_updated_at
  BEFORE UPDATE ON public.generated_audio
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-audio', 'generated-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for audio bucket
CREATE POLICY "Allow public read access to generated-audio bucket"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'generated-audio');

CREATE POLICY "Allow public upload to generated-audio bucket"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'generated-audio');

CREATE POLICY "Allow public update to generated-audio bucket"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'generated-audio');

CREATE POLICY "Allow public delete from generated-audio bucket"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'generated-audio');