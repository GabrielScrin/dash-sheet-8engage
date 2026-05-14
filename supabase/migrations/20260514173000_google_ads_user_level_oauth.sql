DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_tokens_provider_check'
      AND conrelid = 'public.service_tokens'::regclass
  ) THEN
    ALTER TABLE public.service_tokens DROP CONSTRAINT service_tokens_provider_check;
  END IF;
END $$;

ALTER TABLE public.service_tokens
  ADD CONSTRAINT service_tokens_provider_check
  CHECK (provider IN ('meta', 'google', 'google_ads'));

ALTER TABLE public.project_google_ads_connections
  ALTER COLUMN refresh_token DROP NOT NULL;
