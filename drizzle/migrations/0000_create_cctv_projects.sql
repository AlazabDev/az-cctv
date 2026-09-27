CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  company TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.cctv_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL DEFAULT 'مشروع جديد',
  client_name TEXT,
  site_address TEXT,
  currency TEXT NOT NULL DEFAULT 'SAR',
  floorplan_path TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cctv_projects TO authenticated;
GRANT ALL ON public.cctv_projects TO service_role;

ALTER TABLE public.cctv_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own projects select" ON public.cctv_projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own projects insert" ON public.cctv_projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own projects update" ON public.cctv_projects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own projects delete" ON public.cctv_projects FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cctv_projects_touch
BEFORE UPDATE ON public.cctv_projects
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "floorplans owner read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'floorplans' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "floorplans owner insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'floorplans' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "floorplans owner update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'floorplans' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "floorplans owner delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'floorplans' AND (storage.foldername(name))[1] = auth.uid()::text);