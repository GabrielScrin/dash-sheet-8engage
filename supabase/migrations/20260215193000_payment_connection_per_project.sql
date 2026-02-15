-- Make payment connections project-scoped and move sensitive data to a private table.

ALTER TABLE public.payment_connections
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_payment_connections_project_id
  ON public.payment_connections(project_id);

DO $$
BEGIN
  ALTER TABLE public.payment_connections
    DROP CONSTRAINT IF EXISTS payment_connections_user_id_provider_key;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_connections_project_provider
  ON public.payment_connections(project_id, provider)
  WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_connection_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL UNIQUE REFERENCES public.payment_connections(id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  secret_last4 TEXT NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_connection_secrets ENABLE ROW LEVEL SECURITY;

-- No SELECT policy on purpose: frontend cannot read secrets after creation.
DROP POLICY IF EXISTS "Owners can insert payment connection secrets" ON public.payment_connection_secrets;
CREATE POLICY "Owners can insert payment connection secrets"
  ON public.payment_connection_secrets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.payment_connections pc
      WHERE pc.id = payment_connection_secrets.connection_id
        AND pc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can update payment connection secrets" ON public.payment_connection_secrets;
CREATE POLICY "Owners can update payment connection secrets"
  ON public.payment_connection_secrets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.payment_connections pc
      WHERE pc.id = payment_connection_secrets.connection_id
        AND pc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can delete payment connection secrets" ON public.payment_connection_secrets;
CREATE POLICY "Owners can delete payment connection secrets"
  ON public.payment_connection_secrets FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.payment_connections pc
      WHERE pc.id = payment_connection_secrets.connection_id
        AND pc.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS update_payment_connection_secrets_updated_at ON public.payment_connection_secrets;
CREATE TRIGGER update_payment_connection_secrets_updated_at
  BEFORE UPDATE ON public.payment_connection_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
