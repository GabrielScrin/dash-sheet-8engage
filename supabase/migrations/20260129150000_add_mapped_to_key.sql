-- Add mapped_to_key column to column_mappings table
ALTER TABLE public.column_mappings 
ADD COLUMN IF NOT EXISTS mapped_to_key TEXT;
