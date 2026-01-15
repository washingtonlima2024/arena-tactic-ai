-- Add score_locked column to matches table
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS score_locked BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.matches.score_locked IS 'When true, score was manually edited by admin and should not be auto-updated from events';