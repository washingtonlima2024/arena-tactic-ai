-- Create social_campaigns table for marketing campaigns
CREATE TABLE public.social_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  target_platforms TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create social_scheduled_posts table for individual scheduled posts
CREATE TABLE public.social_scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.social_campaigns(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'x', 'linkedin', 'youtube', 'tiktok')),
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video', 'reel', 'story', 'short')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  error_message TEXT,
  external_post_id TEXT,
  match_id UUID,
  event_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.social_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for campaigns
CREATE POLICY "Users can view their own campaigns"
ON public.social_campaigns FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own campaigns"
ON public.social_campaigns FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
ON public.social_campaigns FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
ON public.social_campaigns FOR DELETE
USING (auth.uid() = user_id);

-- Create RLS policies for scheduled posts
CREATE POLICY "Users can view their own scheduled posts"
ON public.social_scheduled_posts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled posts"
ON public.social_scheduled_posts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled posts"
ON public.social_scheduled_posts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled posts"
ON public.social_scheduled_posts FOR DELETE
USING (auth.uid() = user_id);

-- Create triggers for updated_at
CREATE TRIGGER update_social_campaigns_updated_at
BEFORE UPDATE ON public.social_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_social_scheduled_posts_updated_at
BEFORE UPDATE ON public.social_scheduled_posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient scheduled post queries
CREATE INDEX idx_scheduled_posts_scheduled_at ON public.social_scheduled_posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_scheduled_posts_campaign ON public.social_scheduled_posts(campaign_id);
CREATE INDEX idx_campaigns_status ON public.social_campaigns(status);