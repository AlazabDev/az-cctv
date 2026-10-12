-- Immutable snapshots for geometry/design review and approval.

CREATE TABLE IF NOT EXISTS public.cctv_layout_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID NOT NULL REFERENCES public.cctv_layouts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.cctv_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  reason TEXT NOT NULL DEFAULT 'manual',
  geometry_status TEXT NOT NULL CHECK (geometry_status IN ('draft','detected','review','approved')),
  geometry JSONB NOT NULL,
  design_data JSONB NOT NULL,
  px_per_meter NUMERIC(14,6),
  ceiling_height_m NUMERIC(7,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(layout_id, revision_no)
);

GRANT SELECT, INSERT ON public.cctv_layout_revisions TO authenticated;
GRANT ALL ON public.cctv_layout_revisions TO service_role;

ALTER TABLE public.cctv_layout_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own layout revisions select" ON public.cctv_layout_revisions;
CREATE POLICY "own layout revisions select" ON public.cctv_layout_revisions
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own layout revisions insert" ON public.cctv_layout_revisions;
CREATE POLICY "own layout revisions insert" ON public.cctv_layout_revisions
FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.cctv_layouts l
    WHERE l.id = layout_id AND l.user_id = auth.uid() AND l.project_id = project_id
  )
);

CREATE INDEX IF NOT EXISTS cctv_layout_revisions_layout_idx
  ON public.cctv_layout_revisions(layout_id, revision_no DESC);
CREATE INDEX IF NOT EXISTS cctv_layout_revisions_project_idx
  ON public.cctv_layout_revisions(project_id, created_at DESC);

-- Save a revision from the current layout state. The row is immutable by RLS:
-- authenticated users receive no UPDATE/DELETE grants or policies.
CREATE OR REPLACE FUNCTION public.snapshot_cctv_layout(
  p_layout_id UUID,
  p_reason TEXT DEFAULT 'manual'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_layout public.cctv_layouts%ROWTYPE;
  v_revision_no INTEGER;
  v_revision_id UUID;
BEGIN
  SELECT * INTO v_layout
  FROM public.cctv_layouts
  WHERE id = p_layout_id AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'layout not found or not owned by current user';
  END IF;

  SELECT COALESCE(MAX(revision_no), 0) + 1
    INTO v_revision_no
  FROM public.cctv_layout_revisions
  WHERE layout_id = p_layout_id;

  INSERT INTO public.cctv_layout_revisions (
    layout_id, project_id, user_id, revision_no, reason,
    geometry_status, geometry, design_data, px_per_meter, ceiling_height_m
  ) VALUES (
    v_layout.id, v_layout.project_id, v_layout.user_id, v_revision_no,
    COALESCE(NULLIF(btrim(p_reason), ''), 'manual'),
    v_layout.geometry_status, v_layout.geometry, v_layout.design_data,
    v_layout.px_per_meter, v_layout.ceiling_height_m
  )
  RETURNING id INTO v_revision_id;

  RETURN v_revision_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_cctv_layout(UUID, TEXT) TO authenticated;

-- Approves validated geometry atomically and records the approved snapshot.
CREATE OR REPLACE FUNCTION public.approve_cctv_layout_geometry(
  p_layout_id UUID,
  p_geometry JSONB,
  p_px_per_meter NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_layout public.cctv_layouts%ROWTYPE;
  v_revision_no INTEGER;
  v_revision_id UUID;
BEGIN
  IF p_geometry IS NULL OR jsonb_typeof(p_geometry) <> 'object' THEN
    RAISE EXCEPTION 'geometry must be a JSON object';
  END IF;

  IF p_px_per_meter IS NOT NULL AND p_px_per_meter <= 0 THEN
    RAISE EXCEPTION 'px_per_meter must be greater than zero';
  END IF;

  SELECT * INTO v_layout
  FROM public.cctv_layouts
  WHERE id = p_layout_id AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'layout not found or not owned by current user';
  END IF;

  UPDATE public.cctv_layouts
  SET geometry = p_geometry,
      geometry_status = 'approved',
      px_per_meter = COALESCE(p_px_per_meter, px_per_meter)
  WHERE id = p_layout_id
  RETURNING * INTO v_layout;

  SELECT COALESCE(MAX(revision_no), 0) + 1
    INTO v_revision_no
  FROM public.cctv_layout_revisions
  WHERE layout_id = p_layout_id;

  INSERT INTO public.cctv_layout_revisions (
    layout_id, project_id, user_id, revision_no, reason,
    geometry_status, geometry, design_data, px_per_meter, ceiling_height_m
  ) VALUES (
    v_layout.id, v_layout.project_id, v_layout.user_id, v_revision_no,
    'geometry-approved', v_layout.geometry_status, v_layout.geometry,
    v_layout.design_data, v_layout.px_per_meter, v_layout.ceiling_height_m
  )
  RETURNING id INTO v_revision_id;

  RETURN v_revision_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_cctv_layout_geometry(UUID, JSONB, NUMERIC) TO authenticated;
