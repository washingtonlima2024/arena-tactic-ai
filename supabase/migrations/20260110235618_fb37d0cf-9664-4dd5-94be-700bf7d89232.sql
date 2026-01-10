-- Create social_connections table for storing API credentials
CREATE TABLE public.social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'x', 'linkedin', 'youtube', 'tiktok')),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  account_name TEXT,
  account_id TEXT,
  is_connected BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- Enable RLS
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own connections"
ON public.social_connections
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own connections"
ON public.social_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connections"
ON public.social_connections
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connections"
ON public.social_connections
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_social_connections_updated_at
BEFORE UPDATE ON public.social_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();