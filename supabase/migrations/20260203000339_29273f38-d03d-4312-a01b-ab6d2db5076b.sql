CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_count INTEGER;
  new_role text;
BEGIN
  -- Count existing users
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  
  -- First user becomes superadmin, others become viewer
  IF user_count = 0 THEN
    new_role := 'superadmin';
  ELSE
    new_role := 'viewer';
  END IF;
  
  -- Insert profile WITHOUT auto-generating display_name
  -- Admin will define the name manually
  INSERT INTO public.profiles (user_id, email, display_name, credits_balance, credits_monthly_quota)
  VALUES (
    NEW.id, 
    NEW.email, 
    NULL,  -- Admin defines manually
    10,
    10
  );
  
  -- Insert role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, new_role);
  
  RETURN NEW;
END;
$$;