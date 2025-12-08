-- Create storage bucket for event clips
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-clips', 'event-clips', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for public read access on event clips
CREATE POLICY "Public read access on event-clips" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'event-clips');

-- Create storage policy for public insert on event clips
CREATE POLICY "Public insert on event-clips" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'event-clips');

-- Create storage policy for public delete on event clips
CREATE POLICY "Public delete on event-clips" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'event-clips');