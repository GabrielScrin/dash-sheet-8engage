-- Remove the overly permissive public SELECT policy on share_tokens
-- The validate-share-token edge function uses service role key and doesn't need this policy
-- Owner access is already covered by "Users can view tokens of their projects" policy
DROP POLICY IF EXISTS "Anyone can validate active tokens" ON public.share_tokens;