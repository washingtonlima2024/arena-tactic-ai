-- Add clip_pending column to track events needing clip generation
ALTER TABLE match_events 
ADD COLUMN IF NOT EXISTS clip_pending BOOLEAN DEFAULT true;

-- Create index for efficient querying of pending clips
CREATE INDEX IF NOT EXISTS idx_events_clip_pending 
ON match_events(match_id, clip_pending) 
WHERE clip_pending = true;

-- Update existing events: mark as not pending if they already have a clip_url
UPDATE match_events SET clip_pending = false WHERE clip_url IS NOT NULL;

-- Enable realtime for match_events to track changes
ALTER PUBLICATION supabase_realtime ADD TABLE match_events;