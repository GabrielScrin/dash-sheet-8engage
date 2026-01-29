-- Remove the dangerous public SELECT policy that exposes all share tokens
DROP POLICY IF EXISTS "Anyone can validate active tokens" ON public.share_tokens;