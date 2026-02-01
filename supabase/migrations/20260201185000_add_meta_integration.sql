-- Create service_tokens table for secure OAuth token storage
CREATE TABLE IF NOT EXISTS public.service_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'google')),
  access_token TEXT NOT NULL, -- This should be encrypted in application logic or use pgsodium if available
  refresh_token TEXT,
  token_type TEXT,
  scope TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS for service_tokens
ALTER TABLE public.service_tokens ENABLE ROW LEVEL SECURITY;

-- Service tokens policies
-- Users can only view and manage their own tokens
CREATE POLICY "Users can view their own service tokens"
  ON public.service_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own service tokens"
  ON public.service_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own service tokens"
  ON public.service_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own service tokens"
  ON public.service_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_service_tokens_updated_at
  BEFORE UPDATE ON public.service_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update projects table to support multiple sources
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'sheet' CHECK (source_type IN ('sheet', 'meta_ads')),
ADD COLUMN IF NOT EXISTS source_config JSONB DEFAULT '{}'::jsonb;
