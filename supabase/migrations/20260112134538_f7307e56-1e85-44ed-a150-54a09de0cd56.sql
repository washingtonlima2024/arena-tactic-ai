-- Add credit columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS credits_balance integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS credits_monthly_quota integer DEFAULT 10;