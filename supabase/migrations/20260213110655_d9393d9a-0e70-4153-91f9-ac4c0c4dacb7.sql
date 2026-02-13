
ALTER TABLE public.match_events ADD COLUMN IF NOT EXISTS time_source TEXT DEFAULT 'transcription';
COMMENT ON COLUMN public.match_events.time_source IS 'Origin of event timing: transcription, ocr_scoreboard, manual_edit';
