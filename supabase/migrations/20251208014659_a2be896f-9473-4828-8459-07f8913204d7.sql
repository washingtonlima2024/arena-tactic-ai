-- Add unique constraint on event_id for upsert to work
ALTER TABLE public.thumbnails ADD CONSTRAINT thumbnails_event_id_unique UNIQUE (event_id);