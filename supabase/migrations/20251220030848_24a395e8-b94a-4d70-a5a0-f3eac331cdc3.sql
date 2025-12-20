-- Drop the existing check constraint and recreate with "live" status included
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;

-- Add new constraint that includes "live" status
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check 
CHECK (status IN ('pending', 'analyzing', 'analyzed', 'completed', 'error', 'live'));