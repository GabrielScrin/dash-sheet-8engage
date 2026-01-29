-- Add sheet_names column for multiple sheet support
ALTER TABLE public.projects 
ADD COLUMN sheet_names JSONB DEFAULT '[]'::jsonb;

-- Migrate existing data from sheet_name to sheet_names array
UPDATE public.projects 
SET sheet_names = jsonb_build_array(sheet_name)
WHERE sheet_name IS NOT NULL AND sheet_name != '';