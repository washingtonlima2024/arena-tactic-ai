-- =====================================================
-- Criar tabela user_payments para histórico de pagamentos
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('pix', 'credit_card', 'debit_card')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'approved', 'failed', 'refunded')),
  credits_added integer,
  pix_code text,
  pix_qr_code text,
  pix_expiration timestamp with time zone,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Índices para user_payments
CREATE INDEX IF NOT EXISTS idx_user_payments_user_id ON public.user_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_payments_status ON public.user_payments(status);
CREATE INDEX IF NOT EXISTS idx_user_payments_created_at ON public.user_payments(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.user_payments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para user_payments
CREATE POLICY "Users can view own payments" 
ON public.user_payments 
FOR SELECT 
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users can insert own payments" 
ON public.user_payments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update payments" 
ON public.user_payments 
FOR UPDATE 
USING (auth.uid() = user_id OR public.is_admin());

-- Trigger para atualizar updated_at
CREATE TRIGGER update_user_payments_updated_at
BEFORE UPDATE ON public.user_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();