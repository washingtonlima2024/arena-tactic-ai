-- Tabela para armazenar playlists compiladas do ArenaPlay
CREATE TABLE public.playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Clips incluídos (array de IDs de eventos)
  clip_ids UUID[] NOT NULL,
  
  -- Configuração de duração
  target_duration_seconds INTEGER NOT NULL DEFAULT 60,
  actual_duration_seconds INTEGER,
  
  -- Configuração de vinhetas
  include_opening BOOLEAN DEFAULT true,
  include_transitions BOOLEAN DEFAULT true,
  include_closing BOOLEAN DEFAULT true,
  opening_duration_ms INTEGER DEFAULT 4000,
  transition_duration_ms INTEGER DEFAULT 1500,
  closing_duration_ms INTEGER DEFAULT 3000,
  
  -- Formato do vídeo
  format TEXT DEFAULT '9:16' CHECK (format IN ('9:16', '16:9', '1:1', '4:5')),
  
  -- Resultado da compilação
  video_url TEXT,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready', 'error')),
  
  -- Metadados
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX playlists_match_id_idx ON playlists(match_id);
CREATE INDEX playlists_team_id_idx ON playlists(team_id);
CREATE INDEX playlists_status_idx ON playlists(status);
CREATE INDEX playlists_created_by_idx ON playlists(created_by);

-- RLS
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver playlists"
  ON playlists FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Usuários podem criar suas playlists"
  ON playlists FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Usuários podem atualizar suas playlists"
  ON playlists FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Usuários podem deletar suas playlists"
  ON playlists FOR DELETE USING (auth.uid() = created_by);

-- Trigger para updated_at
CREATE TRIGGER update_playlists_updated_at
  BEFORE UPDATE ON playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();