-- Add clip_url column to match_events for storing extracted video clips
ALTER TABLE public.match_events 
ADD COLUMN IF NOT EXISTS clip_url TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN public.match_events.clip_url IS 'URL of the extracted video clip stored in Supabase Storage';