-- Remover eventos órfãos (sem video_id)
DELETE FROM match_events WHERE video_id IS NULL;

-- Log para verificar quantos foram removidos
-- (os eventos sem vídeo são dados inconsistentes)