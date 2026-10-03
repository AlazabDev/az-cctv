-- CCTV layouts: normalized backend model for multi-layout projects.
-- Backward compatible: existing cctv_projects.data / floorplan_path remain untouched.

CREATE TABLE IF NOT EXISTS public.cctv_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.cctv_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  ceiling_height_m NUMERIC(7,3) NOT NULL DEFAULT 3 CHECK (ceiling_height_m > 0 AND ceiling_height_m <= 100),
  floorplan_path TEXT,
  rendered_plan_path TEXT,
  source_mime_type TEXT,
  source_page INTEGER CHECK (source_page IS NULL OR source_page > 0),
  px_per_meter NUMERIC(14,6) CHECK (px_per_meter IS NULL OR px_per_meter > 0),
  image_width INTEGER CHECK (image_width IS NULL OR image_width > 0),
  image_height INTEGER CHECK (image_height IS NULL OR image_height > 0),
  geometry_status TEXT NOT NULL DEFAULT 'draft' CHECK (geometry_status IN ('draft','detected','review','approved')),
  geometry JSONB NOT NULL DEFAULT '{"walls":[],"boundary":[],"openings":[]}'::jsonb,
  design_data JSONB NOT NULL DEFAULT '{"devices":[],"cables":[],"roomLabels":[]}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cctv_layouts_name_not_blank CHECK (length(btrim(name)) > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cctv_layouts TO authenticated;
GRANT ALL ON public.cctv_layouts TO service_role;

ALTER TABLE public.cctv_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own layouts select" ON public.cctv_layouts;
CREATE POLICY "own layouts select" ON public.cctv_layouts
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own layouts insert" ON public.cctv_layouts;
CREATE POLICY "own layouts insert" ON public.cctv_layouts
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.cctv_projects p
    WHERE p.id = project_id AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "own layouts update" ON public.cctv_layouts;
CREATE POLICY "own layouts update" ON public.cctv_layouts
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.cctv_projects p
    WHERE p.id = project_id AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "own layouts delete" ON public.cctv_layouts;
CREATE POLICY "own layouts delete" ON public.cctv_layouts
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS cctv_layouts_project_sort_idx
  ON public.cctv_layouts(project_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS cctv_layouts_user_updated_idx
  ON public.cctv_layouts(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS cctv_layouts_geometry_status_idx
  ON public.cctv_layouts(project_id, geometry_status);
CREATE UNIQUE INDEX IF NOT EXISTS cctv_layouts_one_active_per_project_idx
  ON public.cctv_layouts(project_id)
  WHERE is_active;

DROP TRIGGER IF EXISTS cctv_layouts_touch ON public.cctv_layouts;
CREATE TRIGGER cctv_layouts_touch
BEFORE UPDATE ON public.cctv_layouts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS cctv_layouts_lock_owner ON public.cctv_layouts;
CREATE TRIGGER cctv_layouts_lock_owner
BEFORE UPDATE ON public.cctv_layouts
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();

CREATE OR REPLACE FUNCTION public.enforce_layout_project_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cctv_projects p
    WHERE p.id = NEW.project_id AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'layout owner must match project owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cctv_layouts_project_owner_guard ON public.cctv_layouts;
CREATE TRIGGER cctv_layouts_project_owner_guard
BEFORE INSERT OR UPDATE OF project_id, user_id ON public.cctv_layouts
FOR EACH ROW EXECUTE FUNCTION public.enforce_layout_project_owner();

CREATE OR REPLACE FUNCTION public.normalize_active_layout()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM public.cctv_layouts l WHERE l.project_id = NEW.project_id
  ) THEN
    NEW.is_active := true;
  END IF;

  IF NEW.is_active THEN
    UPDATE public.cctv_layouts
       SET is_active = false
     WHERE project_id = NEW.project_id
       AND id <> NEW.id
       AND is_active = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cctv_layouts_active_guard ON public.cctv_layouts;
CREATE TRIGGER cctv_layouts_active_guard
BEFORE INSERT OR UPDATE OF is_active ON public.cctv_layouts
FOR EACH ROW EXECUTE FUNCTION public.normalize_active_layout();
