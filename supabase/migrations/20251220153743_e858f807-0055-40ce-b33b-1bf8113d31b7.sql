-- Remover constraint antiga
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_status_check;

-- Adicionar nova constraint com 'recording' como status válido
ALTER TABLE videos ADD CONSTRAINT videos_status_check 
  CHECK (status IN ('pending', 'processing', 'completed', 'error', 'recording'));