-- Update the existing user trigger to handle role and preferences
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the existing users table with metadata
  UPDATE public.users 
  SET 
    name = COALESCE(NEW.raw_user_meta_data ->> 'name', name),
    role = COALESCE(NEW.raw_user_meta_data ->> 'role', 'tenant'),
    phone = COALESCE(NEW.raw_user_meta_data ->> 'phone', phone),
    updated_at = NOW()
  WHERE id = NEW.id;
  
  -- Create default user preferences
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
