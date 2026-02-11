-- Phase 1: Payment attribution foundation (sessions + orders + connections)

-- 1) Payment connections per user/provider
CREATE TABLE IF NOT EXISTS public.payment_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('hotmart', 'eduzz', 'kiwify', 'manual')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'error')),
  name TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.payment_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment connections"
  ON public.payment_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own payment connections"
  ON public.payment_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own payment connections"
  ON public.payment_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own payment connections"
  ON public.payment_connections FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_payment_connections_updated_at ON public.payment_connections;
CREATE TRIGGER update_payment_connections_updated_at
  BEFORE UPDATE ON public.payment_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Attribution sessions captured from landing/checkout context
CREATE TABLE IF NOT EXISTS public.attribution_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  session_key TEXT NOT NULL,
  landing_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  campaign_name TEXT,
  adset_name TEXT,
  ad_name TEXT,
  fbclid TEXT,
  fbc TEXT,
  fbp TEXT,
  gclid TEXT,
  client_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_attribution_sessions_user_project_created_at
  ON public.attribution_sessions(user_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attribution_sessions_meta_ids
  ON public.attribution_sessions(campaign_id, adset_id, ad_id);

ALTER TABLE public.attribution_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own attribution sessions"
  ON public.attribution_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own attribution sessions"
  ON public.attribution_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own attribution sessions"
  ON public.attribution_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own attribution sessions"
  ON public.attribution_sessions FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_attribution_sessions_updated_at ON public.attribution_sessions;
CREATE TRIGGER update_attribution_sessions_updated_at
  BEFORE UPDATE ON public.attribution_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Payment orders/events normalized for attribution
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('hotmart', 'eduzz', 'kiwify', 'manual')),
  external_order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  currency TEXT DEFAULT 'BRL',
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  refunded_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  attribution_session_id UUID REFERENCES public.attribution_sessions(id) ON DELETE SET NULL,
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  campaign_name TEXT,
  adset_name TEXT,
  ad_name TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  fbc TEXT,
  fbp TEXT,
  customer_email TEXT,
  customer_id TEXT,
  tracking JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_approved_at
  ON public.payment_orders(user_id, approved_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_orders_project_approved_at
  ON public.payment_orders(project_id, approved_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_orders_meta_ids
  ON public.payment_orders(campaign_id, adset_id, ad_id);

CREATE INDEX IF NOT EXISTS idx_payment_orders_status
  ON public.payment_orders(status);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment orders"
  ON public.payment_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own payment orders"
  ON public.payment_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own payment orders"
  ON public.payment_orders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own payment orders"
  ON public.payment_orders FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_payment_orders_updated_at ON public.payment_orders;
CREATE TRIGGER update_payment_orders_updated_at
  BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

