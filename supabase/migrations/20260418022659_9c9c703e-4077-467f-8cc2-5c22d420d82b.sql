CREATE POLICY "Owners can view payment connection secrets"
ON public.payment_connection_secrets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.payment_connections pc
    WHERE pc.id = payment_connection_secrets.connection_id
      AND pc.user_id = auth.uid()
  )
);