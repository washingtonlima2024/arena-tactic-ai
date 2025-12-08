-- Create thumbnails table
CREATE TABLE public.thumbnails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL,
  match_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.thumbnails ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Allow public read access on thumbnails" 
ON public.thumbnails 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert on thumbnails" 
ON public.thumbnails 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update on thumbnails" 
ON public.thumbnails 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete on thumbnails" 
ON public.thumbnails 
FOR DELETE 
USING (true);

-- Create storage bucket for thumbnails
INSERT INTO storage.buckets (id, name, public) VALUES ('thumbnails', 'thumbnails', true);

-- Storage policies
CREATE POLICY "Allow public read on thumbnails bucket" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'thumbnails');

CREATE POLICY "Allow public upload on thumbnails bucket" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'thumbnails');

CREATE POLICY "Allow public update on thumbnails bucket" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'thumbnails');

CREATE POLICY "Allow public delete on thumbnails bucket" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'thumbnails');