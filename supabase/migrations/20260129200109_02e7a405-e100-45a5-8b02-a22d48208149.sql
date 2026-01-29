-- Fix 1: Remove dangerous public INSERT policy on access_logs
-- The edge function uses service_role key and bypasses RLS anyway
DROP POLICY IF EXISTS "Anyone can insert access logs" ON public.access_logs;

-- Fix 2: Improve handle_new_user trigger with input validation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_avatar_url TEXT;
BEGIN
  -- Validate and truncate full_name (max 100 chars)
  v_full_name := SUBSTRING(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 1, 100);
  
  -- Validate avatar_url is HTTPS or NULL
  v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  IF v_avatar_url IS NOT NULL AND NOT v_avatar_url LIKE 'https://%' THEN
    v_avatar_url := NULL;
  END IF;
  
  INSERT INTO public.profiles (user_id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, v_full_name, v_avatar_url);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix 3: Add database constraints for extra protection
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS full_name_length;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS avatar_url_https;

ALTER TABLE public.profiles 
ADD CONSTRAINT full_name_length CHECK (full_name IS NULL OR LENGTH(full_name) <= 100);

ALTER TABLE public.profiles
ADD CONSTRAINT avatar_url_https CHECK (avatar_url IS NULL OR avatar_url LIKE 'https://%');