-- Planos de Assinatura
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  price_monthly INTEGER NOT NULL DEFAULT 0,
  price_yearly INTEGER,
  credits_per_month INTEGER NOT NULL DEFAULT 50,
  max_users INTEGER DEFAULT 1,
  max_matches_per_month INTEGER,
  storage_limit_bytes BIGINT NOT NULL DEFAULT 5368709120,
  features JSONB DEFAULT '[]'::jsonb,
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Organizações/Empresas
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  owner_id UUID REFERENCES auth.users(id),
  plan_id UUID REFERENCES public.subscription_plans(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  credits_balance INTEGER DEFAULT 0,
  credits_monthly_quota INTEGER DEFAULT 50,
  storage_used_bytes BIGINT DEFAULT 0,
  storage_limit_bytes BIGINT DEFAULT 5368709120,
  is_active BOOLEAN DEFAULT true,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Membros da Organização
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Transações de Crédito
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  description TEXT,
  match_id UUID REFERENCES public.matches(id),
  stripe_payment_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Convites Pendentes
CREATE TABLE public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  used_at TIMESTAMPTZ
);

-- Adicionar organization_id às tabelas existentes
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies para subscription_plans (público para leitura)
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage plans" ON public.subscription_plans
  FOR ALL USING (public.is_admin());

-- RLS Policies para organizations
CREATE POLICY "Users can view their organizations" ON public.organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
    OR owner_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "Owners can update their organization" ON public.organizations
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "Authenticated users can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete organizations" ON public.organizations
  FOR DELETE USING (public.is_admin());

-- RLS Policies para organization_members
CREATE POLICY "Members can view their org members" ON public.organization_members
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Org owners/admins can manage members" ON public.organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    )
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR public.is_admin()
  );

-- RLS Policies para credit_transactions
CREATE POLICY "Members can view org credit transactions" ON public.credit_transactions
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "System can insert credit transactions" ON public.credit_transactions
  FOR INSERT WITH CHECK (public.is_admin() OR auth.uid() IS NOT NULL);

-- RLS Policies para organization_invites
CREATE POLICY "Org members can view invites" ON public.organization_invites
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Org admins can manage invites" ON public.organization_invites
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR public.is_admin()
  );

-- Trigger para updated_at em organizations
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir planos padrão
INSERT INTO public.subscription_plans (name, slug, price_monthly, price_yearly, credits_per_month, max_users, max_matches_per_month, storage_limit_bytes, features, sort_order) VALUES
  ('Starter', 'starter', 0, 0, 50, 1, 1, 5368709120, '["Análise básica", "1 partida/mês", "5GB storage", "Suporte por email"]'::jsonb, 1),
  ('Pro', 'pro', 19900, 199000, 500, 3, 10, 53687091200, '["IA avançada", "10 partidas/mês", "50GB storage", "Clips automáticos", "Transcrição de áudio", "Suporte prioritário"]'::jsonb, 2),
  ('Business', 'business', 49900, 499000, 2000, 10, null, 214748364800, '["Partidas ilimitadas", "10 usuários", "200GB storage", "API access", "White-label básico", "Suporte dedicado"]'::jsonb, 3),
  ('Enterprise', 'enterprise', 0, 0, 999999, 999, null, 1099511627776, '["Tudo do Business", "Usuários ilimitados", "Storage ilimitado", "White-label completo", "SLA garantido", "Suporte 24/7"]'::jsonb, 4);