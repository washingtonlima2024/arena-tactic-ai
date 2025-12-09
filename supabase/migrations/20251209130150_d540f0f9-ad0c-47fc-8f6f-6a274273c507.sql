-- Projetos de edição inteligente
CREATE TABLE public.smart_edit_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT NOT NULL,
  source_video_url TEXT NOT NULL,
  transcription TEXT,
  status TEXT DEFAULT 'pending',
  language TEXT DEFAULT 'pt',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Configurações do projeto
CREATE TABLE public.smart_edit_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.smart_edit_projects(id) ON DELETE CASCADE,
  min_clip_duration INTEGER DEFAULT 5,
  max_clip_duration INTEGER DEFAULT 60,
  max_clips INTEGER DEFAULT 10,
  cut_intensity TEXT DEFAULT 'medium',
  channel_name TEXT DEFAULT 'Meu Canal',
  opening_text TEXT DEFAULT 'Bem-vindo!',
  transition_text TEXT DEFAULT 'Oferecimento',
  closing_text TEXT DEFAULT 'Até o próximo vídeo!',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Clips detectados
CREATE TABLE public.smart_edit_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.smart_edit_projects(id) ON DELETE CASCADE,
  start_second FLOAT NOT NULL,
  end_second FLOAT NOT NULL,
  title TEXT,
  event_type TEXT,
  confidence FLOAT,
  is_enabled BOOLEAN DEFAULT true,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Vídeo final renderizado
CREATE TABLE public.smart_edit_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.smart_edit_projects(id) ON DELETE CASCADE,
  video_url TEXT,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.smart_edit_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_edit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_edit_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_edit_renders ENABLE ROW LEVEL SECURITY;

-- RLS Policies (permitir acesso público para MVP)
CREATE POLICY "Allow all access to smart_edit_projects" ON public.smart_edit_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to smart_edit_settings" ON public.smart_edit_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to smart_edit_clips" ON public.smart_edit_clips FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to smart_edit_renders" ON public.smart_edit_renders FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket para vídeos do editor
INSERT INTO storage.buckets (id, name, public) VALUES ('smart-editor', 'smart-editor', true) ON CONFLICT DO NOTHING;

CREATE POLICY "Allow public access to smart-editor bucket" ON storage.objects FOR ALL USING (bucket_id = 'smart-editor') WITH CHECK (bucket_id = 'smart-editor');