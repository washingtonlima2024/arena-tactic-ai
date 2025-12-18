-- Add column to identify which half the event belongs to
ALTER TABLE public.match_events ADD COLUMN IF NOT EXISTS match_half TEXT;

-- Add index for faster filtering by half
CREATE INDEX IF NOT EXISTS idx_match_events_match_half ON public.match_events(match_half);

-- Update existing events based on minute (best effort migration)
UPDATE public.match_events 
SET match_half = CASE 
  WHEN minute < 45 THEN 'first'
  WHEN minute >= 45 THEN 'second'
  ELSE NULL
END
WHERE match_half IS NULL;