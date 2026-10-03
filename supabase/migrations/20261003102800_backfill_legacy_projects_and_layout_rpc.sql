-- Backfill the existing single-plan project model into cctv_layouts without
-- deleting or rewriting legacy project data. Safe to run repeatedly.

INSERT INTO public.cctv_layouts (
  project_id,
  user_id,
  name,
  ceiling_height_m,
  floorplan_path,
  px_per_meter,
  image_width,
  image_height,
  geometry_status,
  geometry,
  design_data,
  is_active
)
SELECT
  p.id,
  p.user_id,
  COALESCE(NULLIF(btrim(p.data->>'layoutName'), ''), p.name, 'Layout 1'),
  CASE
    WHEN COALESCE(p.data->>'ceilingHeightM', '') ~ '^[0-9]+([.][0-9]+)?$'
      AND (p.data->>'ceilingHeightM')::numeric > 0
      THEN (p.data->>'ceilingHeightM')::numeric
    ELSE 3
  END,
  p.floorplan_path,
  CASE
    WHEN COALESCE(p.data->>'pxPerMeter', '') ~ '^[0-9]+([.][0-9]+)?$'
      AND (p.data->>'pxPerMeter')::numeric > 0
      THEN (p.data->>'pxPerMeter')::numeric
    ELSE NULL
  END,
  CASE
    WHEN COALESCE(p.data->>'imageWidth', '') ~ '^[0-9]+$'
      THEN (p.data->>'imageWidth')::integer
    ELSE NULL
  END,
  CASE
    WHEN COALESCE(p.data->>'imageHeight', '') ~ '^[0-9]+$'
      THEN (p.data->>'imageHeight')::integer
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(p.data->'walls') = 'array' AND jsonb_array_length(p.data->'walls') > 0
      THEN 'review'
    ELSE 'draft'
  END,
  jsonb_build_object(
    'walls', COALESCE(p.data->'walls', '[]'::jsonb),
    'boundary', '[]'::jsonb,
    'openings', '[]'::jsonb
  ),
  jsonb_build_object(
    'devices', COALESCE(p.data->'devices', '[]'::jsonb),
    'cables', COALESCE(p.data->'cables', '[]'::jsonb),
    'roomLabels', COALESCE(p.data->'roomLabels', '[]'::jsonb),
    'showCoverage', COALESCE(p.data->'showCoverage', 'true'::jsonb)
  ),
  true
FROM public.cctv_projects p
WHERE NOT EXISTS (
  SELECT 1 FROM public.cctv_layouts l WHERE l.project_id = p.id
);

CREATE OR REPLACE FUNCTION public.activate_cctv_layout(p_layout_id UUID)
RETURNS public.cctv_layouts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_layout public.cctv_layouts%ROWTYPE;
BEGIN
  SELECT * INTO v_layout
  FROM public.cctv_layouts
  WHERE id = p_layout_id AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'layout not found or not owned by current user';
  END IF;

  UPDATE public.cctv_layouts
  SET is_active = (id = p_layout_id)
  WHERE project_id = v_layout.project_id
    AND user_id = auth.uid();

  SELECT * INTO v_layout
  FROM public.cctv_layouts
  WHERE id = p_layout_id;

  RETURN v_layout;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_cctv_layout(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_layout_ready_for_design(p_layout_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_layout public.cctv_layouts%ROWTYPE;
BEGIN
  SELECT * INTO v_layout
  FROM public.cctv_layouts
  WHERE id = p_layout_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'layout not found or not owned by current user';
  END IF;

  IF v_layout.floorplan_path IS NULL THEN
    RAISE EXCEPTION 'layout has no floor plan';
  END IF;
  IF v_layout.px_per_meter IS NULL OR v_layout.px_per_meter <= 0 THEN
    RAISE EXCEPTION 'layout scale is not calibrated';
  END IF;
  IF v_layout.ceiling_height_m <= 0 THEN
    RAISE EXCEPTION 'layout ceiling height is invalid';
  END IF;
  IF v_layout.geometry_status <> 'approved' THEN
    RAISE EXCEPTION 'layout geometry must be approved before AI design';
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_layout_ready_for_design(UUID) TO authenticated;
