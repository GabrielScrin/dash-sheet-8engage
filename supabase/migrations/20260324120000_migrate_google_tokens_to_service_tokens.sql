INSERT INTO public.service_tokens (
  user_id,
  provider,
  access_token,
  refresh_token,
  token_type,
  created_at,
  updated_at
)
SELECT
  p.user_id,
  'google',
  '',
  p.google_refresh_token,
  'Bearer',
  now(),
  now()
FROM public.profiles AS p
WHERE p.google_refresh_token IS NOT NULL
ON CONFLICT (user_id, provider) DO UPDATE
SET
  refresh_token = EXCLUDED.refresh_token,
  updated_at = now();

UPDATE public.profiles
SET google_refresh_token = NULL
WHERE google_refresh_token IS NOT NULL;
